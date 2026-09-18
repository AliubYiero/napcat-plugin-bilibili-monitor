/**
 * 数据文件顶层格式 (纯函数模块, 零依赖)
 *
 * 除 Cookie 外, 所有 store 数据文件统一包裹为:
 *   { version: 1, data: ... }
 *
 * 读取侧兼容未包裹的旧结构 (legacy), 读到时按原样使用并告警, 下次
 * 写入自动升级为本格式 —— 这是防"迁移没跑成导致静默清空"的兜底。
 *
 * 本模块不得 import 任何 store / pluginState (否则会与 BaseStore 成环)。
 */

/** 当前数据文件格式版本 */
export const STORE_FILE_VERSION = 1;

/** 包裹后的顶层结构 */
export interface VersionedFile<T> {
    version: number;
    data: T;
}

/** 解包结果: data 为内部数据, legacy 表示读到的是未包裹的旧结构 */
export interface UnwrappedFile {
    data: unknown;
    legacy: boolean;
}

/** 是否为普通对象 (排除 null 与数组) */
export function isPlainObject(
    v: unknown,
): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 将数据包裹为带版本号的顶层结构 */
export function wrapData<T>(data: T): VersionedFile<T> {
    return { version: STORE_FILE_VERSION, data };
}

/**
 * 解包数据文件内容
 * @returns 无数据 (文件缺失/为空) 返回 null; 否则返回内部数据与是否为旧结构
 */
export function unwrapData(raw: unknown): UnwrappedFile | null {
    if (raw === null || raw === undefined) return null;
    if (isPlainObject(raw) && 'data' in raw) {
        return { data: raw.data, legacy: false };
    }
    return { data: raw, legacy: true };
}

/**
 * 该内容是否为当前版本的有效包裹 (迁移幂等判定用)
 * 注意: version 存在但不等于当前版本时同样返回 false, 调用方需自行区分
 * "未知的更高版本" (应跳过而非覆盖), 见 migration/run.ts。
 */
export function isCurrentVersionFile(raw: unknown): boolean {
    return (
        isPlainObject(raw) &&
        raw.version === STORE_FILE_VERSION &&
        'data' in raw
    );
}

/** 顶层是否声明了版本号 (含非当前版本) */
export function hasVersionField(raw: unknown): boolean {
    return isPlainObject(raw) && typeof raw.version === 'number';
}
