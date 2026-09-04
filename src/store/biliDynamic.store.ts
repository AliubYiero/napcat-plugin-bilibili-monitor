/**
 * B 站动态监听存储
 *
 * 按主播聚合 (与 live store 范式一致), 持久化到 data 目录的
 * bilibiliDynData.json, 结构: BiliDynamicMonitor[]
 */

import { BaseStore } from './BaseStore';

const BILI_DYN_DATA_FILENAME = 'bilibiliDynData.json';

/** 动态监听记录 (按主播聚合) */
export interface BiliDynamicMonitor {
    /** 主播 uid */
    uid: string;
    /** 主播名称 */
    uname: string;
    /** 推送目标列表 */
    to: BiliDynamicMonitorToInfo[];
    /** 已缓存的动态 id_str (FIFO, 上限 100) */
    cachedIds: string[];
}

/** 动态监听推送目标 (复用 live 的 toInfo 结构, 无 mentionUsers) */
export interface BiliDynamicMonitorToInfo {
    id: string;
    type: 'private' | 'group';
}

/** 动态缓存 id 上限 */
const DYN_CACHE_MAX = 100;

export class BiliDynamicStore extends BaseStore<BiliDynamicMonitor> {
    private static instance: BiliDynamicStore | null = null;

    private constructor() {
        super(BILI_DYN_DATA_FILENAME);
    }

    static getInstance(): BiliDynamicStore {
        if (!BiliDynamicStore.instance) {
            BiliDynamicStore.instance = new BiliDynamicStore();
        }
        return BiliDynamicStore.instance;
    }

    /** 获取当前内存中的所有动态监听记录 */
    get(): BiliDynamicMonitor[] {
        return this.getAll();
    }

    /** 判断某个主播是否已推送至指定目标 */
    has(uid: string, toInfo: BiliDynamicMonitorToInfo): boolean {
        return this.hasItem(
            (item) =>
                item.uid === uid &&
                item.to.some(
                    (t) =>
                        t.type === toInfo.type && t.id === toInfo.id,
                ),
        );
    }

    /**
     * 添加一个推送目标
     * @returns 是否实际新增 (重复添加返回 false)
     */
    add(
        uid: string,
        uname: string,
        toInfo: BiliDynamicMonitorToInfo,
    ): boolean {
        if (!uid) {
            throw new Error('uid must be a non-empty string');
        }
        if (!toInfo?.id || !toInfo.type) {
            throw new Error('Invalid toInfo');
        }

        const existing = this.findItem((item) => item.uid === uid);
        if (existing) {
            if (
                existing.to.some(
                    (t) =>
                        t.type === toInfo.type && t.id === toInfo.id,
                )
            ) {
                return false;
            }
            existing.uname = uname || existing.uname;
            existing.to.push(toInfo);
            this.saveToFile();
            return true;
        }
        this.addItem({ uid, uname, to: [toInfo], cachedIds: [] });
        return true;
    }

    /**
     * 批量记录动态 id 到缓存 (FIFO 淘汰, 上限 100)
     * @returns 是否有新增 (全部已存在返回 false)
     */
    addCacheIds(uid: string, ids: string[]): boolean {
        const monitor = this.findItem((item) => item.uid === uid);
        if (!monitor) return false;
        const known = new Set(monitor.cachedIds);
        const fresh = ids.filter((id) => !known.has(id));
        if (fresh.length === 0) return false;
        monitor.cachedIds.push(...fresh);
        while (monitor.cachedIds.length > DYN_CACHE_MAX) {
            monitor.cachedIds.shift();
        }
        this.saveToFile();
        return fresh.length > 0;
    }

    /** 判断动态 id 是否已缓存 */
    hasCacheId(uid: string, id: string): boolean {
        return (
            this.findItem(
                (item) => item.uid === uid,
            )?.cachedIds.includes(id) ?? false
        );
    }

    /** 移除一个推送目标 (to 为空则整条删除, 缓存随之清空) */
    remove(uid: string, toInfo: BiliDynamicMonitorToInfo): boolean {
        const monitor = this.findItem((item) => item.uid === uid);
        if (!monitor) return false;

        const originalLength = monitor.to.length;
        monitor.to = monitor.to.filter(
            (t) => !(t.type === toInfo.type && t.id === toInfo.id),
        );
        if (monitor.to.length === originalLength) {
            return false;
        }

        if (monitor.to.length === 0) {
            this.removeItem((item) => item.uid === uid);
        } else {
            this.saveToFile();
        }
        return true;
    }
}
