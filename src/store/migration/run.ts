/**
 * 一次性数据迁移的执行层 (IO 驱动)
 *
 * 职责: 读盘 → 交给 plan.ts 构建计划 → 写新文件 → 备份旧文件。
 *
 * 本模块严禁 import 任何 store 或 service: 迁移必须在所有 store 实例化
 * 之前完成, 一旦引入就会提前触发读文件, 读到旧结构甚至回写覆盖。
 *
 * 幂等: 按目标文件逐个判定, 已是当前版本的目标文件跳过 (其源不消费、
 * 不备份)。执行顺序为「复制同名备份 → 写新文件 → 重命名其余旧文件」,
 * 任一环节崩溃都不会丢原始数据。
 */

import fs from 'fs';
import path from 'path';
import { pluginState } from '../../core/state';
import {
    STORE_FILE_VERSION,
    hasVersionField,
    isCurrentVersionFile,
    isPlainObject,
} from '../storeFile';
import {
    LEGACY_FILES,
    MIGRATION_TARGETS,
    buildMigrationPlan,
    type MigrationPlan,
} from './plan';

// ==================== IO 抽象 ====================

/** 读文件结果 */
export type ReadResult =
    | { status: 'missing' }
    | { status: 'ok'; value: unknown }
    | { status: 'invalid'; error: string };

/** 数据目录的文件操作 (抽出接口以便测试用内存实现替换) */
export interface MigrationIo {
    /** 目录下的文件名列表 */
    list(): string[];
    read(name: string): ReadResult;
    write(name: string, data: unknown): void;
    /** 重命名 (原文件消失) */
    rename(from: string, to: string): void;
    /** 复制 (原文件保留) */
    copy(from: string, to: string): void;
}

/** 迁移过程中的 IO 失败 (阻止插件启动) */
export class MigrationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MigrationError';
    }
}

/** 基于真实文件系统的实现 */
export function createFsMigrationIo(dataDir: string): MigrationIo {
    const resolve = (name: string) => path.join(dataDir, name);
    return {
        list(): string[] {
            if (!fs.existsSync(dataDir)) return [];
            return fs.readdirSync(dataDir);
        },
        read(name: string): ReadResult {
            const filePath = resolve(name);
            if (!fs.existsSync(filePath)) return { status: 'missing' };
            try {
                const text = fs.readFileSync(filePath, 'utf-8');
                return { status: 'ok', value: JSON.parse(text) };
            } catch (e) {
                return { status: 'invalid', error: String(e) };
            }
        },
        write(name: string, data: unknown): void {
            fs.writeFileSync(
                resolve(name),
                JSON.stringify(data, null, 0),
                'utf-8',
            );
        },
        rename(from: string, to: string): void {
            fs.renameSync(resolve(from), resolve(to));
        },
        copy(from: string, to: string): void {
            fs.copyFileSync(resolve(from), resolve(to));
        },
    };
}

// ==================== 执行 ====================

/** 迁移结果 */
export interface MigrationResult {
    status: 'skipped' | 'migrated';
    /** 本次迁移的计划 (skipped 时也可能有, 用于观察跳过原因) */
    plan: MigrationPlan;
    warnings: string[];
}

/** 旧文件全集 (迁移源) */
const LEGACY_NAMES: ReadonlySet<string> = new Set(
    MIGRATION_TARGETS.flatMap((t) => t.sources),
);

/**
 * 执行数据迁移
 *
 * @param dataDir 数据目录, 缺省取 pluginState.ctx.dataPath
 * @throws MigrationError / MigrationValidationError 时调用方应阻止插件启动
 */
export function runDataMigration(dataDir?: string): MigrationResult {
    const io = createFsMigrationIo(dataDir ?? pluginState.ctx.dataPath);
    return executeMigration(io, new Date());
}

/**
 * 迁移核心 (IO 注入版, 便于用内存实现测试)
 *
 * @param io 数据目录的文件操作
 * @param now 当前时间 (备份名时间戳, 注入以保证可断言)
 */
export function executeMigration(
    io: MigrationIo,
    now: Date,
): MigrationResult {
    const snapshot: Record<string, unknown> = {};
    const skipTargets = new Set<string>();
    const warnings: string[] = [];

    // 1. 读取全部迁移源 (解析失败即阻断: 继续下去等于静默丢数据)
    for (const name of LEGACY_NAMES) {
        const res = io.read(name);
        if (res.status === 'missing') continue;
        if (res.status === 'invalid') {
            throw new MigrationError(
                `旧数据文件 ${name} 解析失败, 已中止迁移: ${res.error}`,
            );
        }
        snapshot[name] = res.value;
    }

    // 2. 判定各目标文件是否跳过
    for (const target of MIGRATION_TARGETS) {
        const name = target.name;
        const res = io.read(name);
        if (res.status === 'missing') continue;
        if (res.status === 'invalid') {
            warnings.push(`${name} 解析失败, 已跳过该目标以免覆盖`);
            skipTargets.add(name);
            continue;
        }
        if (isCurrentVersionFile(res.value)) {
            skipTargets.add(name);
            continue;
        }
        // 直播间快照是"原地包裹": 无版本号的普通对象即为旧结构
        if (
            name === LEGACY_FILES.roomData &&
            !hasVersionField(res.value) &&
            isPlainObject(res.value)
        ) {
            continue;
        }
        warnings.push(
            `${name} 不是当前版本 (version: ${STORE_FILE_VERSION}) 的数据文件, 已跳过该目标以免覆盖`,
        );
        skipTargets.add(name);
    }

    // 3. 构建并执行计划
    const plan = buildMigrationPlan(snapshot, {
        skipTargets,
        takenNames: new Set(io.list()),
        now,
    });
    const allWarnings = [...warnings, ...plan.warnings];

    if (plan.writes.length === 0) {
        return { status: 'skipped', plan, warnings: allWarnings };
    }

    // 3.1 同名备份先复制 (原文件保留, 写入失败时旧数据仍在)
    for (const backup of plan.backups) {
        if (backup.mode === 'copy') io.copy(backup.from, backup.to);
    }
    // 3.2 写入全部新文件
    for (const write of plan.writes) io.write(write.name, write.data);
    // 3.3 其余旧文件重命名为备份 (此时新文件已就位)
    for (const backup of plan.backups) {
        if (backup.mode === 'rename') io.rename(backup.from, backup.to);
    }

    return { status: 'migrated', plan, warnings: allWarnings };
}

/** 迁移摘要日志文本 (纯函数, 便于断言格式) */
export function formatMigrationSummary(plan: MigrationPlan): string {
    const s = plan.summary;
    const parts = [
        `直播监听 ${s.liveMonitors} 条 (含同接 ${s.onlineMonitors} 条)`,
        `动态监听 ${s.dynMonitors} 条 (运行时快照 ${s.dynRuntime} 条)`,
        `会话上限 ${s.limits} 条`,
        `直播间快照 ${s.roomRecords} 条`,
    ];
    let text = `数据迁移完成: ${parts.join(', ')}`;
    text += `; 写入 ${plan.writes.length} 个文件, 备份 ${plan.backups.length} 个文件`;
    if (s.onlineDropped > 0) {
        text += `; 丢弃无对应直播监听的同接记录 ${s.onlineDropped} 条`;
    }
    return text;
}
