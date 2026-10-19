/**
 * 一次性配置迁移 (旧配置文件 → 新配置形状 + 会话文件)
 *
 * 迁移内容:
 *   - 旧字段 `adminUser`(逗号分隔字符串) 并入 `adminUsers`
 *   - 旧字段 `groupConfigs` 抽取到会话文件 bilibiliSessionConfig.json
 *     (仅保留有意义的取值: enabled:false / liveMentionAll:true)
 *   - 删除已移除的字段: `enabled` / `debug` / `commandPrefix` / `groupConfigs`
 *     (`stats` 不在 FIELDS 内, 原样保留)
 *   - 按值告警: `enabled=false`(改由宿主负责) 与非 `#bili` 的 `commandPrefix`
 *
 * 本模块严禁 import 任何 store 或 service: 迁移必须在所有 store 实例化
 * 之前完成 (只允许 import pluginState 与纯函数 storeFile)。
 *
 * 幂等: 配置文件中不存在任何旧字段时直接跳过; 会话记录只补缺不覆盖。
 * 失败抛 MigrationError, 由入口阻止插件启动; 执行前先复制同名备份。
 */

import fs from 'node:fs';
import path from 'node:path';
import { COMMAND_PREFIX, sanitizeConfig } from 'shared';
import { pluginState } from '../../core/state';
import { isPlainObject, unwrapData, wrapData } from '../storeFile';
import { MigrationError } from './run';

/** 会话配置文件 (与 SessionConfigStore 同名) */
const SESSION_CONFIG_FILE = 'bilibiliSessionConfig.json';

/** 触发迁移的旧字段 (出现任一即执行) */
const LEGACY_KEYS = [
    'enabled',
    'debug',
    'commandPrefix',
    'groupConfigs',
    'adminUser',
] as const;

/** 迁移结果 */
export interface ConfigMigrationResult {
    status: 'skipped' | 'migrated';
    warnings: string[];
    /** 本次抽取到会话文件的记录数 */
    sessionEntries: number;
}

/**
 * 执行配置迁移
 *
 * @param now 当前时间 (备份名时间戳, 注入以保证可断言)
 * @throws MigrationError 时调用方应阻止插件启动
 */
export function runConfigMigration(
    now: Date = new Date(),
): ConfigMigrationResult {
    const configPath = pluginState.configPath;
    if (!configPath || !fs.existsSync(configPath)) {
        return { status: 'skipped', warnings: [], sessionEntries: 0 };
    }

    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        throw new MigrationError(
            `配置文件解析失败, 已中止迁移: ${String(e)}`,
        );
    }

    if (!isPlainObject(raw)) {
        return { status: 'skipped', warnings: [], sessionEntries: 0 };
    }
    if (!LEGACY_KEYS.some((key) => key in raw)) {
        return { status: 'skipped', warnings: [], sessionEntries: 0 };
    }

    const warnings: string[] = [];

    // 1. 先备份 (原文件保留, 后续写入失败时旧数据仍在)
    const backupName = `${path.basename(configPath)}.${formatTimestamp(now)}.bak`;
    fs.copyFileSync(
        configPath,
        path.join(path.dirname(configPath), backupName),
    );

    // 2. groupConfigs → 会话文件 (只补缺, 不覆盖已有记录)
    const sessionEntries = extractGroupConfigs(
        raw.groupConfigs,
        warnings,
    );

    // 3. 旧 adminUser 并入 adminUsers 后清洗
    const source: Record<string, unknown> = { ...raw };
    if (
        source.adminUsers === undefined &&
        source.adminUser !== undefined
    ) {
        source.adminUsers = source.adminUser;
    }
    const cleaned = sanitizeConfig(source);
    const next: Record<string, unknown> = { ...cleaned };
    if (raw.stats !== undefined) next.stats = raw.stats;

    // 4. 写回清洗后的配置
    fs.writeFileSync(
        configPath,
        JSON.stringify(next, null, 2),
        'utf-8',
    );

    // 5. 按值告警
    if (raw.enabled === false) {
        warnings.push(
            '旧配置 enabled=false: 插件级启停已改由 NapCat 宿主负责, 请用宿主开关停用插件',
        );
    }
    if (
        typeof raw.commandPrefix === 'string' &&
        raw.commandPrefix !== COMMAND_PREFIX
    ) {
        warnings.push(
            `旧配置 commandPrefix="${raw.commandPrefix}" 已忽略, 指令前缀固定为 ${COMMAND_PREFIX}`,
        );
    }
    if ('debug' in raw) {
        warnings.push('旧配置 debug 已移除 (日志级别由宿主控制)');
    }

    return { status: 'migrated', warnings, sessionEntries };
}

/**
 * 把旧 groupConfigs 抽取到会话文件
 *
 * 键为 `group:<群号>`; 只保留有意义的取值 (enabled:false / liveMentionAll:true),
 * 已存在的键不覆盖。
 *
 * @returns 本次新增的记录数
 */
function extractGroupConfigs(
    groupConfigs: unknown,
    warnings: string[],
): number {
    if (!isPlainObject(groupConfigs)) return 0;

    const existing = readSessionFile();
    let added = 0;
    for (const [groupId, value] of Object.entries(groupConfigs)) {
        if (!isPlainObject(value)) continue;
        const key = `group:${groupId}`;
        if (Object.hasOwn(existing, key)) continue;

        const record: Record<string, unknown> = {
            id: groupId,
            type: 'group',
        };
        if (value.enabled === false) record.enabled = false;
        if (value.liveMentionAll === true) {
            record.liveMentionAll = true;
        }
        if (
            record.enabled === undefined &&
            record.liveMentionAll === undefined
        ) {
            continue;
        }
        existing[key] = record;
        added++;
    }

    if (added > 0) {
        try {
            pluginState.saveDataFile(
                SESSION_CONFIG_FILE,
                wrapData(existing),
            );
        } catch (e) {
            throw new MigrationError(
                `写入会话文件 ${SESSION_CONFIG_FILE} 失败: ${String(e)}`,
            );
        }
    } else if (
        !fs.existsSync(
            pluginState.getDataFilePath(SESSION_CONFIG_FILE),
        )
    ) {
        warnings.push('旧 groupConfigs 无有效记录, 未生成会话文件');
    }

    return added;
}

/** 读取会话文件内部数据表 (缺失/异常时回退空表) */
function readSessionFile(): Record<string, unknown> {
    const raw = pluginState.loadDataFile<unknown>(
        SESSION_CONFIG_FILE,
        undefined,
    );
    const unwrapped = unwrapData(raw);
    if (!unwrapped || !isPlainObject(unwrapped.data)) return {};
    return { ...unwrapped.data };
}

/** 备份名时间戳: YYYYMMDDHHmmss */
function formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
}
