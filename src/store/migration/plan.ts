/**
 * 旧数据 → 新数据的迁移计划 (纯函数模块)
 *
 * 输入是"文件名 → 已 JSON.parse 的旧文件内容"的快照, 输出是待写入的
 * 新文件内容与待备份的旧文件。不 import fs / pluginState / 任何 store,
 * 因此校验、合并、备份命名全部可独立测试。
 *
 * 迁移源 → 目标映射:
 *   bilibiliLiveData.json          ┐
 *   bilibiliOnlineMonitors.json    ┴→ bilibiliLiveMonitors.json (to + onlineTo)
 *   bilibiliDynData.json            → bilibiliDynMonitors.json (去掉 cachedIds)
 *                                   → bilibiliDynRuntimeData.json (cachedIds)
 *   bilibiliLiveLimits.json         ┐
 *   bilibiliLiveOnlineLimits.json   ├→ bilibiliLimits.json
 *   bilibiliDynLimits.json          ┘
 *   bilibiliLiveRoomData.json       → bilibiliLiveRoomData.json (原地包裹)
 *
 * 校验失败 (uid / id 非字符串) 会收集全部问题后一次性抛错, 保证
 * "全量校验通过才写入"。
 */

import { isPlainObject, wrapData } from '../storeFile';

// ==================== 文件清单 ====================

/** 迁移源 (旧文件) */
export const LEGACY_FILES = {
    liveData: 'bilibiliLiveData.json',
    onlineMonitors: 'bilibiliOnlineMonitors.json',
    dynData: 'bilibiliDynData.json',
    liveLimits: 'bilibiliLiveLimits.json',
    onlineLimits: 'bilibiliLiveOnlineLimits.json',
    dynLimits: 'bilibiliDynLimits.json',
    roomData: 'bilibiliLiveRoomData.json',
} as const;

/** 迁移目标 (新文件) */
export const TARGET_FILES = {
    limits: 'bilibiliLimits.json',
    liveMonitors: 'bilibiliLiveMonitors.json',
    dynMonitors: 'bilibiliDynMonitors.json',
    dynRuntime: 'bilibiliDynRuntimeData.json',
    roomData: 'bilibiliLiveRoomData.json',
} as const;

/** 一个目标文件及其迁移源 (顺序即优先级, 后者覆盖前者) */
export interface MigrationTarget {
    name: string;
    sources: string[];
}

/** 全部迁移目标 (顺序固定, 便于日志与测试断言) */
export const MIGRATION_TARGETS: MigrationTarget[] = [
    {
        name: TARGET_FILES.limits,
        sources: [
            LEGACY_FILES.liveLimits,
            LEGACY_FILES.onlineLimits,
            LEGACY_FILES.dynLimits,
        ],
    },
    {
        name: TARGET_FILES.liveMonitors,
        sources: [
            LEGACY_FILES.liveData,
            LEGACY_FILES.onlineMonitors,
        ],
    },
    {
        name: TARGET_FILES.dynMonitors,
        sources: [LEGACY_FILES.dynData],
    },
    {
        name: TARGET_FILES.dynRuntime,
        sources: [LEGACY_FILES.dynData],
    },
    {
        name: TARGET_FILES.roomData,
        sources: [LEGACY_FILES.roomData],
    },
];

// ==================== 校验 ====================

/** 单条校验问题 */
export interface MigrationIssue {
    /** 出问题的文件名 */
    file: string;
    /** 记录位置, 如 `[3].to[1]` */
    path: string;
    /** 字段名 */
    field: string;
    /** 实际类型 (便于定位) */
    actual: string;
}

/** 旧数据校验失败 (阻止迁移与插件启动) */
export class MigrationValidationError extends Error {
    readonly issues: MigrationIssue[];

    constructor(issues: MigrationIssue[]) {
        super(`旧数据校验失败, 共 ${issues.length} 处类型错误`);
        this.name = 'MigrationValidationError';
        this.issues = issues;
    }
}

/** 类型描述 (用于错误信息) */
function describeType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/** 校验字段为字符串, 不符则记录问题 */
function requireString(
    value: unknown,
    file: string,
    path: string,
    field: string,
    issues: MigrationIssue[],
): value is string {
    if (typeof value === 'string') return true;
    issues.push({
        file,
        path,
        field,
        actual: describeType(value),
    });
    return false;
}

/** 读取 uname, 非字符串时清洗为空串 (不阻断迁移) */
function readUname(
    raw: unknown,
    file: string,
    path: string,
    warnings: string[],
): string {
    if (typeof raw === 'string') return raw;
    if (raw === undefined || raw === null) return '';
    warnings.push(
        `${file} ${path}.uname 非字符串 (${describeType(raw)}), 已转为空串`,
    );
    return '';
}

/** 读取有限数值, 不符返回 undefined */
function readFiniteNumber(raw: unknown): number | undefined {
    return typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : undefined;
}

/** 读取会话类型, 不符返回 undefined */
function readSessionType(
    raw: unknown,
): 'private' | 'group' | undefined {
    return raw === 'private' || raw === 'group' ? raw : undefined;
}

// ==================== 计划结构 ====================

/** 待写入的新文件 (data 已含 version 包裹) */
export interface FileWrite {
    name: string;
    data: unknown;
}

/** 待备份的旧文件 */
export interface FileBackup {
    from: string;
    to: string;
    /**
     * 备份方式:
     * - `copy`: 原文件保留 (源与目标同名时, 先复制再覆盖同名写入)
     * - `rename`: 原文件移走 (其余旧文件, 新文件写入后再移)
     */
    mode: 'copy' | 'rename';
}

/** 迁移摘要 (日志统计用) */
export interface MigrationSummary {
    /** 写入的直播监听条数 */
    liveMonitors: number;
    /** 其中带同接目标的条数 */
    onlineMonitors: number;
    /** 无对应直播监听而丢弃的同接记录条数 */
    onlineDropped: number;
    /** 写入的动态监听条数 */
    dynMonitors: number;
    /** 写入的动态运行时条目数 */
    dynRuntime: number;
    /** 合并后的会话上限条数 */
    limits: number;
    /** 迁移的直播间快照条数 */
    roomRecords: number;
}

/** 迁移计划 */
export interface MigrationPlan {
    writes: FileWrite[];
    backups: FileBackup[];
    summary: MigrationSummary;
    warnings: string[];
}

/** 构建计划所需的上下文 */
export interface MigrationContext {
    /** 已存在且为当前版本的目标文件 (跳过不迁移) */
    skipTargets: ReadonlySet<string>;
    /** 数据目录下已占用的文件名 (备份命名冲突判定) */
    takenNames: ReadonlySet<string>;
    /** 当前时间 (备份名时间戳) */
    now: Date;
}

// ==================== 备份命名 ====================

/** 将时间格式化为本地时间 YYYYMMDDHHmmss */
export function formatStamp(now: Date): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return (
        String(now.getFullYear()) +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
    );
}

/**
 * 生成备份文件名: `<原文件名>.<YYYYMMDDHHmmss>.bak`
 * 同名备份已存在时追加序号: `<原文件名>.<时间戳>.1.bak`
 */
export function buildBackupName(
    original: string,
    taken: ReadonlySet<string>,
    now: Date,
): string {
    const stamp = formatStamp(now);
    let candidate = `${original}.${stamp}.bak`;
    let index = 1;
    while (taken.has(candidate)) {
        candidate = `${original}.${stamp}.${index}.bak`;
        index++;
    }
    return candidate;
}

// ==================== 主流程 ====================

/**
 * 构建迁移计划
 *
 * 目标文件逐个独立判定: 已跳过的目标不消费其源文件、不备份。
 * 校验失败时抛 MigrationValidationError (携带全部问题)。
 */
export function buildMigrationPlan(
    snapshot: Record<string, unknown>,
    ctx: MigrationContext,
): MigrationPlan {
    const issues: MigrationIssue[] = [];
    const warnings: string[] = [];
    const writes: FileWrite[] = [];
    const consumed = new Set<string>();
    const summary: MigrationSummary = {
        liveMonitors: 0,
        onlineMonitors: 0,
        onlineDropped: 0,
        dynMonitors: 0,
        dynRuntime: 0,
        limits: 0,
        roomRecords: 0,
    };

    /** 该源文件在快照中且内容可用 */
    const present = (name: string) =>
        Object.hasOwn(snapshot, name) && snapshot[name] !== undefined;

    /** 记录被消费的源文件 (迁移成功后需备份) */
    const consume = (names: string[]) => {
        for (const name of names) consumed.add(name);
    };

    for (const target of MIGRATION_TARGETS) {
        if (ctx.skipTargets.has(target.name)) continue;
        const sources = target.sources.filter(present);
        if (sources.length === 0) continue;

        const data = buildTargetData(
            target.name,
            snapshot,
            sources,
            issues,
            warnings,
            summary,
        );
        if (data === undefined) continue;

        writes.push({ name: target.name, data: wrapData(data) });
        consume(sources);
    }

    // 全量校验通过才写入
    if (issues.length > 0) throw new MigrationValidationError(issues);

    const targetNames = new Set(MIGRATION_TARGETS.map((t) => t.name));
    const backups: FileBackup[] = [];
    const taken = new Set(ctx.takenNames);
    for (const name of [...consumed].sort()) {
        const to = buildBackupName(name, taken, ctx.now);
        taken.add(to);
        backups.push({
            from: name,
            to,
            // 源与目标同名 (直播间快照) 时只能先复制再覆盖写入
            mode: targetNames.has(name) ? 'copy' : 'rename',
        });
    }

    return { writes, backups, summary, warnings };
}

/** 按目标文件分派构建逻辑 (返回 undefined 表示无需写入) */
function buildTargetData(
    targetName: string,
    snapshot: Record<string, unknown>,
    sources: string[],
    issues: MigrationIssue[],
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    switch (targetName) {
        case TARGET_FILES.limits:
            return buildLimitsFile(sources.map((s) => ({
                file: s,
                raw: snapshot[s],
            })), issues, warnings, summary);
        case TARGET_FILES.liveMonitors:
            return buildLiveMonitorsFile(
                sources.includes(LEGACY_FILES.liveData)
                    ? snapshot[LEGACY_FILES.liveData]
                    : undefined,
                sources
                    .filter((s) => s === LEGACY_FILES.onlineMonitors)
                    .map((s) => ({ file: s, raw: snapshot[s] })),
                issues,
                warnings,
                summary,
            );
        case TARGET_FILES.dynMonitors:
            return buildDynMonitorsFile(
                sources[0],
                snapshot[sources[0]],
                issues,
                warnings,
                summary,
            );
        case TARGET_FILES.dynRuntime:
            return buildDynRuntimeFile(
                sources[0],
                snapshot[sources[0]],
                warnings,
                summary,
            );
        case TARGET_FILES.roomData:
            return buildRoomDataFile(
                sources[0],
                snapshot[sources[0]],
                issues,
                warnings,
                summary,
            );
        default:
            return undefined;
    }
}

// ==================== Limits ====================

/** 源文件的 raw 内容与文件名 */
interface RawSource {
    file: string;
    raw: unknown;
}

/** kind 与源文件的对应关系 (顺序即优先级) */
const LIMIT_KIND_BY_FILE: Record<string, 'live' | 'online' | 'dyn'> = {
    [LEGACY_FILES.liveLimits]: 'live',
    [LEGACY_FILES.onlineLimits]: 'online',
    [LEGACY_FILES.dynLimits]: 'dyn',
};

/** 合并三个上限文件, 同一 (id, type) 重复取最后 */
function buildLimitsFile(
    sources: RawSource[],
    issues: MigrationIssue[],
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    // Map 保持插入顺序, 重复的 (id, type) 就地更新
    const merged = new Map<
        string,
        { id: string; type: 'private' | 'group'; limits: Record<string, number> }
    >();

    for (const { file, raw } of sources) {
        const kind = LIMIT_KIND_BY_FILE[file];
        if (!kind) continue;
        if (!Array.isArray(raw)) {
            warnings.push(`${file} 顶层不是数组, 已忽略该文件`);
            continue;
        }
        raw.forEach((item, index) => {
            const path = `[${index}]`;
            if (!isPlainObject(item)) {
                warnings.push(`${file} ${path} 不是对象, 已忽略`);
                return;
            }
            if (!requireString(item.id, file, path, 'id', issues)) {
                return;
            }
            const type = readSessionType(item.type);
            if (!type) {
                warnings.push(
                    `${file} ${path}.type 非法 (${describeType(item.type)}), 已忽略`,
                );
                return;
            }
            const max = readFiniteNumber(item.max);
            if (max === undefined) {
                warnings.push(
                    `${file} ${path}.max 非有限数 (${describeType(item.max)}), 已忽略`,
                );
                return;
            }

            const key = `${type} ${item.id}`;
            const existing = merged.get(key);
            if (existing) {
                existing.limits[kind] = max;
            } else {
                merged.set(key, {
                    id: item.id,
                    type,
                    limits: { [kind]: max },
                });
            }
        });
    }

    const records = [...merged.values()].filter(
        (item) => Object.keys(item.limits).length > 0,
    );
    summary.limits = records.length;
    return records;
}

// ==================== 直播 / 同接监听 ====================

/** 合并中的监听记录 (to 去重表: targetKey → 目标) */
interface MonitorAccumulator {
    uid: string;
    uname: string;
    to: {
        id: string;
        type: 'private' | 'group';
        mentionUsers?: string[];
    }[];
    toKeys: Set<string>;
    onlineTo: { id: string; type: 'private' | 'group' }[];
    onlineKeys: Set<string>;
}

/** 目标去重键 */
function targetKey(type: string, id: string): string {
    return `${type} ${id}`;
}

/** 合并直播监听与同接监听到一个文件 */
function buildLiveMonitorsFile(
    liveRaw: unknown,
    onlineSources: RawSource[],
    issues: MigrationIssue[],
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    const liveFile = LEGACY_FILES.liveData;
    const monitors = new Map<string, MonitorAccumulator>();

    if (Array.isArray(liveRaw)) {
        liveRaw.forEach((item, index) => {
            const path = `[${index}]`;
            if (!isPlainObject(item)) {
                warnings.push(`${liveFile} ${path} 不是对象, 已忽略`);
                return;
            }
            if (!requireString(item.uid, liveFile, path, 'uid', issues)) {
                return;
            }
            const to = readToList(
                item.to,
                liveFile,
                path,
                issues,
                true,
            );
            const uname = readUname(
                item.uname,
                liveFile,
                path,
                warnings,
            );
            const acc = ensureMonitor(
                monitors,
                item.uid,
                uname,
                path,
                liveFile,
                warnings,
            );
            for (const target of to) {
                addLiveTarget(acc, target);
            }
        });
    } else if (liveRaw !== undefined) {
        warnings.push(`${liveFile} 顶层不是数组, 已忽略该文件`);
    }

    for (const { file, raw } of onlineSources) {
        if (!Array.isArray(raw)) {
            warnings.push(`${file} 顶层不是数组, 已忽略该文件`);
            continue;
        }
        raw.forEach((item, index) => {
            const path = `[${index}]`;
            if (!isPlainObject(item)) {
                warnings.push(`${file} ${path} 不是对象, 已忽略`);
                return;
            }
            if (!requireString(item.uid, file, path, 'uid', issues)) {
                return;
            }
            const targets = readToList(
                item.to,
                file,
                path,
                issues,
                false,
            );
            const acc = monitors.get(item.uid);
            if (!acc) {
                // 同接是直播监听的附属功能, 无宿主即丢弃
                summary.onlineDropped++;
                warnings.push(
                    `${file} ${path} 的同接监听无对应直播监听 (uid: ${item.uid}), 已丢弃`,
                );
                return;
            }
            for (const target of targets) {
                addOnlineTarget(acc, target);
            }
        });
    }

    const records = [...monitors.values()]
        .filter((acc) => {
            if (acc.to.length > 0) return true;
            // to 为空则整条记录非法 (不允许只有 onlineTo 没有 to)
            warnings.push(`直播监听 ${acc.uid} 无有效目标, 已丢弃`);
            return false;
        })
        .map(toMonitorRecord);

    summary.liveMonitors = records.length;
    summary.onlineMonitors = records.filter(
        (r) => (r.onlineTo?.length ?? 0) > 0,
    ).length;
    return records;
}

/** 读取 to 目标列表 (withMention 为真时读取 mentionUsers) */
function readToList(
    raw: unknown,
    file: string,
    path: string,
    issues: MigrationIssue[],
    withMention: boolean,
): {
    id: string;
    type: 'private' | 'group';
    mentionUsers?: string[];
}[] {
    if (!Array.isArray(raw)) return [];
    const out: {
        id: string;
        type: 'private' | 'group';
        mentionUsers?: string[];
    }[] = [];
    raw.forEach((item, index) => {
        const toPath = `${path}.to[${index}]`;
        if (!isPlainObject(item)) return;
        if (!requireString(item.id, file, toPath, 'id', issues)) {
            return;
        }
        const type = readSessionType(item.type);
        if (!type) return;
        const target: {
            id: string;
            type: 'private' | 'group';
            mentionUsers?: string[];
        } = { id: item.id, type };
        if (withMention && Array.isArray(item.mentionUsers)) {
            const users = item.mentionUsers.filter(
                (qq): qq is string => typeof qq === 'string',
            );
            if (users.length > 0) target.mentionUsers = users;
        }
        out.push(target);
    });
    return out;
}

/** 取或建累加器 (同 uid 重复出现时合并, uname 取最后) */
function ensureMonitor(
    monitors: Map<string, MonitorAccumulator>,
    uid: string,
    uname: string,
    path: string,
    file: string,
    warnings: string[],
): MonitorAccumulator {
    const existing = monitors.get(uid);
    if (existing) {
        if (uname) existing.uname = uname;
        warnings.push(
            `${file} ${path} 直播监听 uid 重复, 已合并 (uid: ${uid})`,
        );
        return existing;
    }
    const acc: MonitorAccumulator = {
        uid,
        uname,
        to: [],
        toKeys: new Set(),
        onlineTo: [],
        onlineKeys: new Set(),
    };
    monitors.set(uid, acc);
    return acc;
}

/** 追加直播目标 (同目标取并集, mentionUsers 合并) */
function addLiveTarget(
    acc: MonitorAccumulator,
    target: {
        id: string;
        type: 'private' | 'group';
        mentionUsers?: string[];
    },
): void {
    const key = targetKey(target.type, target.id);
    if (acc.toKeys.has(key)) {
        const existing = acc.to.find(
            (t) => targetKey(t.type, t.id) === key,
        );
        if (existing && target.mentionUsers) {
            const merged = new Set([
                ...(existing.mentionUsers ?? []),
                ...target.mentionUsers,
            ]);
            existing.mentionUsers = [...merged];
        }
        return;
    }
    acc.toKeys.add(key);
    acc.to.push(target);
}

/** 追加同接目标 (同目标取并集) */
function addOnlineTarget(
    acc: MonitorAccumulator,
    target: { id: string; type: 'private' | 'group' },
): void {
    const key = targetKey(target.type, target.id);
    if (acc.onlineKeys.has(key)) return;
    acc.onlineKeys.add(key);
    acc.onlineTo.push(target);
}

/** 累加器 → 落盘记录 (空数组字段不落盘) */
function toMonitorRecord(acc: MonitorAccumulator): {
    uid: string;
    uname: string;
    to: { id: string; type: 'private' | 'group'; mentionUsers?: string[] }[];
    onlineTo?: { id: string; type: 'private' | 'group' }[];
} {
    const record: {
        uid: string;
        uname: string;
        to: {
            id: string;
            type: 'private' | 'group';
            mentionUsers?: string[];
        }[];
        onlineTo?: { id: string; type: 'private' | 'group' }[];
    } = { uid: acc.uid, uname: acc.uname, to: acc.to };
    if (acc.onlineTo.length > 0) record.onlineTo = acc.onlineTo;
    return record;
}

// ==================== 动态监听 / 动态运行时 ====================

/** 动态缓存上限 (与 BiliDynRuntimeStore 保持一致) */
const DYN_CACHE_MAX = 100;

/** 从旧动态文件构建监听配置 (去掉 cachedIds) */
function buildDynMonitorsFile(
    file: string,
    raw: unknown,
    issues: MigrationIssue[],
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    if (!Array.isArray(raw)) {
        if (raw !== undefined) {
            warnings.push(`${file} 顶层不是数组, 已忽略该文件`);
        }
        return [];
    }

    const monitors = new Map<
        string,
        {
            uid: string;
            uname: string;
            to: { id: string; type: 'private' | 'group' }[];
            keys: Set<string>;
        }
    >();

    raw.forEach((item, index) => {
        const path = `[${index}]`;
        if (!isPlainObject(item)) {
            warnings.push(`${file} ${path} 不是对象, 已忽略`);
            return;
        }
        if (!requireString(item.uid, file, path, 'uid', issues)) return;
        const to = readToList(item.to, file, path, issues, false);
        const uname = readUname(item.uname, file, path, warnings);

        const existing = monitors.get(item.uid);
        if (existing) {
            warnings.push(
                `${file} ${path} 动态监听 uid 重复, 已合并 (uid: ${item.uid})`,
            );
            if (uname) existing.uname = uname;
            for (const target of to) {
                const key = targetKey(target.type, target.id);
                if (existing.keys.has(key)) continue;
                existing.keys.add(key);
                existing.to.push(target);
            }
            return;
        }
        const keys = new Set<string>();
        const targets: { id: string; type: 'private' | 'group' }[] = [];
        for (const target of to) {
            const key = targetKey(target.type, target.id);
            if (keys.has(key)) continue;
            keys.add(key);
            targets.push(target);
        }
        monitors.set(item.uid, {
            uid: item.uid,
            uname,
            to: targets,
            keys,
        });
    });

    const records = [...monitors.values()]
        .filter((acc) => {
            if (acc.to.length > 0) return true;
            warnings.push(`动态监听 ${acc.uid} 无有效目标, 已丢弃`);
            return false;
        })
        .map((acc) => ({
            uid: acc.uid,
            uname: acc.uname,
            to: acc.to,
        }));

    summary.dynMonitors = records.length;
    return records;
}

/**
 * 从旧动态文件提取 cachedIds 到运行时文件
 *
 * 清洗规则: 仅保留字符串 → 去重保留最后出现位置 → 截取最后 100 →
 * 空数组不写入该 uid。
 */
function buildDynRuntimeFile(
    file: string,
    raw: unknown,
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    const out: Record<string, { cachedIds: string[] }> = {};
    if (!Array.isArray(raw)) {
        if (raw !== undefined) {
            warnings.push(`${file} 顶层不是数组, 已忽略该文件`);
        }
        return out;
    }

    raw.forEach((item, index) => {
        if (!isPlainObject(item)) return;
        if (typeof item.uid !== 'string') return;
        if (!Array.isArray(item.cachedIds)) return;

        const cleaned = cleanCachedIds(item.cachedIds);
        if (cleaned.length === 0) return;
        if (Object.hasOwn(out, item.uid)) {
            warnings.push(
                `${file} [${index}] 动态运行时 uid 重复, 已取并集 (uid: ${item.uid})`,
            );
            out[item.uid] = {
                cachedIds: cleanCachedIds([
                    ...out[item.uid].cachedIds,
                    ...cleaned,
                ]),
            };
            return;
        }
        out[item.uid] = { cachedIds: cleaned };
    });

    summary.dynRuntime = Object.keys(out).length;
    return out;
}

/** 清洗缓存 id: 仅字符串 → 去重保留最后 → 截取最后 100 */
function cleanCachedIds(raw: unknown[]): string[] {
    const seen = new Set<string>();
    const kept: string[] = [];
    // 逆序遍历: 后出现的先记入, 从而"去重保留最后出现位置"
    for (let i = raw.length - 1; i >= 0; i--) {
        const id = raw[i];
        if (typeof id !== 'string' || seen.has(id)) continue;
        seen.add(id);
        kept.push(id);
    }
    kept.reverse();
    return kept.length > DYN_CACHE_MAX
        ? kept.slice(kept.length - DYN_CACHE_MAX)
        : kept;
}

// ==================== 直播间快照 ====================

/** 原地包裹直播间快照文件 (uid 归一化为字符串) */
function buildRoomDataFile(
    file: string,
    raw: unknown,
    issues: MigrationIssue[],
    warnings: string[],
    summary: MigrationSummary,
): unknown {
    if (!isPlainObject(raw)) {
        warnings.push(`${file} 顶层不是对象, 已忽略该文件`);
        return {};
    }

    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!isPlainObject(value)) {
            warnings.push(`${file} ${key} 不是对象, 已忽略`);
            continue;
        }
        const rawUid = value.uid;
        if (
            typeof rawUid !== 'number' &&
            typeof rawUid !== 'string'
        ) {
            issues.push({
                file,
                path: key,
                field: 'uid',
                actual: describeType(rawUid),
            });
            continue;
        }
        const uid = String(rawUid);
        if (uid !== key) {
            warnings.push(
                `${file} ${key} 的 uid 与键不一致, 已按 uid 归一为 ${uid}`,
            );
        }
        out[uid] = { ...value, uid };
    }

    summary.roomRecords = Object.keys(out).length;
    return out;
}
