// biliOnlineMonitor.store.ts
import { BaseStore } from './BaseStore';

const BILI_ONLINE_MONITOR_FILENAME = 'bilibiliOnlineMonitors.json';

/**
 * 同接监听记录：一个主播及其绑定的推送目标列表
 * 结构与直播监控项（BiliLiveMonitor）一致, 但不携带 mentionUsers
 */
export interface BiliOnlineMonitor {
    uid: string;
    /** 主播名称 */
    uname: string;
    to: { id: string; type: 'private' | 'group' }[];
}

/**
 * 同接监听存储：直播监听的附属功能,
 * 仅允许监听已开启直播状态监听的主播（由服务层校验）
 */
export class BiliOnlineMonitorStore extends BaseStore<BiliOnlineMonitor> {
    private static instance: BiliOnlineMonitorStore | null = null;

    private constructor() {
        super(BILI_ONLINE_MONITOR_FILENAME);
    }

    static getInstance(): BiliOnlineMonitorStore {
        if (!BiliOnlineMonitorStore.instance) {
            BiliOnlineMonitorStore.instance =
                new BiliOnlineMonitorStore();
        }
        return BiliOnlineMonitorStore.instance;
    }

    /** 获取当前内存中的所有同接监听数据 */
    get(): BiliOnlineMonitor[] {
        return this.getAll();
    }

    /** 该主播是否被任意会话开启同接监听 */
    has(uid: string): boolean {
        return this.hasItem((item) => item.uid === uid);
    }

    /** 该主播是否对指定会话开启同接监听 */
    hasForTarget(
        uid: string,
        toInfo: { id: string; type: 'private' | 'group' },
    ): boolean {
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
     * 添加一个推送目标（主播记录已存在时追加 to, 否则新建）
     */
    add(
        uid: string,
        uname: string,
        toInfo: { id: string; type: 'private' | 'group' },
    ): boolean {
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
        this.addItem({ uid, uname, to: [toInfo] });
        return true;
    }

    /**
     * 移除一个推送目标；目标清空后删除整条记录
     * @returns 是否实际移除
     */
    remove(
        uid: string,
        toInfo: { id: string; type: 'private' | 'group' },
    ): boolean {
        const record = this.findItem((item) => item.uid === uid);
        if (!record) return false;

        const before = record.to.length;
        record.to = record.to.filter(
            (t) => !(t.type === toInfo.type && t.id === toInfo.id),
        );
        if (record.to.length === before) return false;

        if (record.to.length === 0) {
            this.removeItem((item) => item.uid === uid);
        } else {
            this.saveToFile();
        }
        return true;
    }

    /** 获取指定会话正在同接监听的主播列表 */
    listForTarget(toInfo: {
        id: string;
        type: 'private' | 'group';
    }): BiliOnlineMonitor[] {
        return this.get().filter((monitor) =>
            monitor.to.some(
                (t) => t.type === toInfo.type && t.id === toInfo.id,
            ),
        );
    }
}
