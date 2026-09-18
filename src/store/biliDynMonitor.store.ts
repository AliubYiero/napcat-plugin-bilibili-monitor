/**
 * B 站动态监听存储 (监听配置)
 *
 * 按主播聚合, 持久化到 data 目录的 bilibiliDynMonitors.json,
 * 结构: { version: 1, data: BiliDynamicMonitor[] }
 *
 * 已推送动态 id 缓存属运行时快照, 不在此处, 见 BiliDynRuntimeStore。
 */

import { BaseStore } from './BaseStore';

const BILI_DYN_MONITOR_FILENAME = 'bilibiliDynMonitors.json';

/** 动态监听记录 (按主播聚合) */
export interface BiliDynamicMonitor {
    /** 主播 uid */
    uid: string;
    /** 主播名称 */
    uname: string;
    /** 推送目标列表 */
    to: BiliDynamicMonitorToInfo[];
}

/** 动态监听推送目标 (无 mentionUsers) */
export interface BiliDynamicMonitorToInfo {
    id: string;
    type: 'private' | 'group';
}

/** 判断两个推送目标是否指向同一会话 */
function isSameTarget(
    a: BiliDynamicMonitorToInfo,
    b: BiliDynamicMonitorToInfo,
): boolean {
    return a.type === b.type && a.id === b.id;
}

export class BiliDynMonitorStore extends BaseStore<BiliDynamicMonitor> {
    private static instance: BiliDynMonitorStore | null = null;

    private constructor() {
        super(BILI_DYN_MONITOR_FILENAME);
    }

    static getInstance(): BiliDynMonitorStore {
        if (!BiliDynMonitorStore.instance) {
            BiliDynMonitorStore.instance = new BiliDynMonitorStore();
        }
        return BiliDynMonitorStore.instance;
    }

    /** 获取当前内存中的所有动态监听记录 */
    get(): BiliDynamicMonitor[] {
        return this.getAll();
    }

    /** 按主播 uid 获取记录 (不存在返回 undefined) */
    getByUid(uid: string): BiliDynamicMonitor | undefined {
        return this.findItem((item) => item.uid === uid);
    }

    /** 该主播是否已推送至指定会话 */
    has(uid: string, toInfo: BiliDynamicMonitorToInfo): boolean {
        return (
            this.getByUid(uid)?.to.some((t) => isSameTarget(t, toInfo)) ??
            false
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

        const existing = this.getByUid(uid);
        if (!existing) {
            this.addItem({ uid, uname, to: [toInfo] });
            return true;
        }
        if (existing.to.some((t) => isSameTarget(t, toInfo))) {
            return false;
        }
        existing.uname = uname || existing.uname;
        existing.to.push(toInfo);
        this.saveToFile();
        return true;
    }

    /**
     * 移除一个推送目标 (to 为空则整条删除)
     * 删除整条记录时调用方需同步清理该 uid 的动态运行时快照。
     * @returns 是否实际移除
     */
    remove(uid: string, toInfo: BiliDynamicMonitorToInfo): boolean {
        const monitor = this.getByUid(uid);
        if (!monitor) return false;

        const before = monitor.to.length;
        monitor.to = monitor.to.filter((t) => !isSameTarget(t, toInfo));
        if (monitor.to.length === before) return false;

        if (monitor.to.length === 0) {
            this.removeItem((item) => item.uid === uid);
        } else {
            this.saveToFile();
        }
        return true;
    }

    protected loadFromFile(): BiliDynamicMonitor[] {
        return (
            super
                .loadFromFile()
                // to 为空的记录非法, 加载时剔除
                .filter(
                    (item) =>
                        Array.isArray(item?.to) && item.to.length > 0,
                )
                // 只取本 store 声明的字段: 旧结构里残留的 cachedIds
                // (或任何手改文件里的杂字段) 在此被丢掉
                .map((item) => ({
                    uid: item.uid,
                    uname: item.uname,
                    to: item.to,
                }))
        );
    }
}
