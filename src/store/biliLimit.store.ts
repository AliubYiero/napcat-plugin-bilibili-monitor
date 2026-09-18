/**
 * B 站会话自定义监听上限存储
 *
 * 持久化到 data 目录的 bilibiliLimits.json,
 * 结构: { version: 1, data: BiliLimit[] }
 *
 * 三类上限 (直播/同接/动态) 合并存于一条记录, 按会话区分。
 *
 * 语义要点:
 * - 字段缺省表示跟随全局默认上限; `0` 是有效覆盖值, 不得视为缺省。
 * - 用户设置后显式存储, 即使值等于当前全局默认。
 * - limits 为空对象时删除整条记录。
 * - 此处只读显式值, 不回落全局默认 (回落由各 kind 的服务层负责)。
 */

import { BaseStore } from './BaseStore';
import { isPlainObject } from './storeFile';

const BILI_LIMIT_FILENAME = 'bilibiliLimits.json';

/** 上限类别 */
export type BiliLimitKind = 'live' | 'online' | 'dyn';

/** 会话类型 */
export type BiliSessionType = 'private' | 'group';

/** 单个会话的自定义监听上限记录 */
export interface BiliLimit {
    id: string;
    type: BiliSessionType;
    /** 各 kind 的显式覆盖值 (缺省 = 跟随全局默认) */
    limits: Partial<Record<BiliLimitKind, number>>;
}

/** 已知的上限类别 */
const LIMIT_KINDS: BiliLimitKind[] = ['live', 'online', 'dyn'];

/** 会话类型是否合法 */
function isSessionType(v: unknown): v is BiliSessionType {
    return v === 'private' || v === 'group';
}

export class BiliLimitStore extends BaseStore<BiliLimit> {
    private static instance: BiliLimitStore | null = null;

    private constructor() {
        super(BILI_LIMIT_FILENAME);
    }

    static getInstance(): BiliLimitStore {
        if (!BiliLimitStore.instance) {
            BiliLimitStore.instance = new BiliLimitStore();
        }
        return BiliLimitStore.instance;
    }

    /** 获取指定会话的上限记录 (不存在返回 undefined) */
    get(id: string, type: BiliSessionType): BiliLimit | undefined {
        return this.findItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /**
     * 获取指定会话某个 kind 的显式上限
     * 未设置返回 undefined (不回落全局默认); `0` 是有效值。
     */
    getLimit(
        id: string,
        type: BiliSessionType,
        kind: BiliLimitKind,
    ): number | undefined {
        const limits = this.get(id, type)?.limits;
        if (!limits || !Object.hasOwn(limits, kind)) return undefined;
        const value = limits[kind];
        return typeof value === 'number' ? value : undefined;
    }

    /**
     * 显式设置指定会话某个 kind 的上限
     * 即使值等于当前全局默认也照样写入 (显式覆盖语义)。
     */
    setLimit(
        id: string,
        type: BiliSessionType,
        kind: BiliLimitKind,
        max: number,
    ): void {
        const existing = this.get(id, type);
        if (existing) {
            existing.limits[kind] = max;
            this.saveToFile();
            return;
        }
        this.addItem({ id, type, limits: { [kind]: max } });
    }

    /** 删除指定会话某个 kind 的上限 (limits 清空则删除整条记录) */
    removeLimit(
        id: string,
        type: BiliSessionType,
        kind: BiliLimitKind,
    ): void {
        const existing = this.get(id, type);
        if (!existing || !Object.hasOwn(existing.limits, kind)) return;
        // 用 delete 而非赋 undefined: JSON.stringify 会丢掉 undefined 值键
        delete existing.limits[kind];
        if (Object.keys(existing.limits).length === 0) {
            this.removeItem((item) => item === existing);
        } else {
            this.saveToFile();
        }
    }

    /** 删除指定会话的整条记录 */
    removeSession(id: string, type: BiliSessionType): void {
        this.removeItem(
            (item) => item.id === id && item.type === type,
        );
    }

    protected loadFromFile(): BiliLimit[] {
        return super
            .loadFromFile()
            .map(cleanRecord)
            .filter((item): item is BiliLimit => item !== null);
    }
}

/**
 * 清洗单条记录: 剔除非法字段, 只保留有限数值
 * @returns 清洗后仍有有效 kind 时返回记录, 否则 null
 */
function cleanRecord(raw: unknown): BiliLimit | null {
    if (!isPlainObject(raw)) return null;
    const { id, type, limits } = raw;
    if (typeof id !== 'string' || !isSessionType(type)) return null;
    if (!isPlainObject(limits)) return null;

    const cleaned: Partial<Record<BiliLimitKind, number>> = {};
    for (const kind of LIMIT_KINDS) {
        const value = limits[kind];
        // 0 是有效覆盖值, 只剔除非数字与非有限数
        if (typeof value === 'number' && Number.isFinite(value)) {
            cleaned[kind] = value;
        }
    }
    if (Object.keys(cleaned).length === 0) return null;
    return { id, type, limits: cleaned };
}
