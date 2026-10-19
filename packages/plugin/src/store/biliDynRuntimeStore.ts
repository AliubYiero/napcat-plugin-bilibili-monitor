/**
 * B 站动态运行时快照存储
 *
 * 持久化到 data 目录的 bilibiliDynRuntimeData.json,
 * 结构: { version: 1, data: Record<string, BiliDynRuntimeInfo> }, 键为 uid。
 *
 * 只存运行时数据 (已推送动态 id 缓存), 与监听配置 (BiliDynMonitorStore) 分离。
 * 二者不得互相 import: 孤立 uid 清理与删除级联由 services/dyn/runtime.service.ts
 * 编排, 避免成环。
 */

import { BaseRecordStore } from './BaseRecordStore';
import { isPlainObject } from './storeFile';

const BILI_DYN_RUNTIME_FILENAME = 'bilibiliDynRuntimeData.json';

/** 单个 uid 的动态运行时快照 */
export interface BiliDynRuntimeInfo {
    /** 已缓存的动态 id_str (FIFO, 上限 100) */
    cachedIds: string[];
}

/** 动态缓存 id 上限 */
const DYN_CACHE_MAX = 100;

export class BiliDynRuntimeStore extends BaseRecordStore<BiliDynRuntimeInfo> {
    private static instance: BiliDynRuntimeStore | null = null;

    private constructor() {
        super(BILI_DYN_RUNTIME_FILENAME);
    }

    static getInstance(): BiliDynRuntimeStore {
        if (!BiliDynRuntimeStore.instance) {
            BiliDynRuntimeStore.instance = new BiliDynRuntimeStore();
        }
        return BiliDynRuntimeStore.instance;
    }

    /** 获取某 uid 的已缓存动态 id (返回副本, 调用方可安全持有请求前快照) */
    getCachedIds(uid: string): string[] {
        return [...(this.get(uid)?.cachedIds ?? [])];
    }

    /**
     * 记录一个已推送的动态 id (去重 + FIFO 上限 100, 立即落盘)
     * @returns 是否有新增
     */
    addCachedId(uid: string, id: string): boolean {
        return this.addCachedIds(uid, [id]);
    }

    /**
     * 批量记录动态 id (整页记录, 去重 + FIFO 上限 100, 立即落盘)
     * @returns 是否有新增
     */
    addCachedIds(uid: string, ids: string[]): boolean {
        const existing = this.get(uid)?.cachedIds ?? [];
        const known = new Set(existing);
        const fresh: string[] = [];
        // 逐个判定并即时记入 known: 同一批次内的重复也只保留一份
        for (const id of ids) {
            if (typeof id !== 'string' || known.has(id)) continue;
            known.add(id);
            fresh.push(id);
        }
        if (fresh.length === 0) return false;

        const merged = [...existing, ...fresh];
        const cachedIds =
            merged.length > DYN_CACHE_MAX
                ? merged.slice(merged.length - DYN_CACHE_MAX)
                : merged;
        this.set(uid, { cachedIds });
        return true;
    }

    /** 删除该 uid 的运行时记录 (无记录时不落盘) */
    removeRuntime(uid: string): void {
        this.remove(uid);
    }

    /**
     * 清理孤立 uid 的运行时记录 (该 uid 已不在动态监听中)
     * 仅改内存, 不落盘 —— 孤立项会在下次真正写入时自然消失。
     * @returns 被清理的 uid 列表
     */
    pruneOrphans(isValidUid: (uid: string) => boolean): string[] {
        const pruned = this.keys().filter((uid) => !isValidUid(uid));
        for (const uid of pruned) delete this.data[uid];
        return pruned;
    }

    protected loadFromFile(): Record<string, BiliDynRuntimeInfo> {
        const raw = super.loadFromFile();
        const out: Record<string, BiliDynRuntimeInfo> = {};
        for (const [uid, value] of Object.entries(raw)) {
            const cachedIds = isPlainObject(value)
                ? value.cachedIds
                : undefined;
            if (!Array.isArray(cachedIds)) continue;
            const clean = cachedIds.filter(
                (id): id is string => typeof id === 'string',
            );
            // 空缓存视为无记录
            if (clean.length === 0) continue;
            out[uid] = {
                cachedIds:
                    clean.length > DYN_CACHE_MAX
                        ? clean.slice(clean.length - DYN_CACHE_MAX)
                        : clean,
            };
        }
        return out;
    }

    /** 空 cachedIds 视为无记录, 落盘前清掉 */
    protected normalizeBeforeSave(): void {
        for (const uid of this.keys()) {
            if ((this.data[uid]?.cachedIds?.length ?? 0) === 0) {
                delete this.data[uid];
            }
        }
    }
}
