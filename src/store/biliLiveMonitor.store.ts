/**
 * B 站直播监听存储
 *
 * 按主播聚合, 持久化到 data 目录的 bilibiliLiveMonitors.json,
 * 结构: { version: 1, data: BiliLiveMonitor[] }
 *
 * 同接监听是直播监听的附属功能, 与直播目标同存于一条记录:
 * `to` 为直播推送目标, `onlineTo` 为同接推送目标。
 * 不允许存在只有 onlineTo 没有 to 的记录。
 */

import { BaseStore } from './BaseStore';

const BILI_LIVE_MONITOR_FILENAME = 'bilibiliLiveMonitors.json';

/** 直播监听推送目标 */
export interface BiliLiveMonitorToInfo {
    id: string;
    type: 'private' | 'group';
    /** 开播时希望被 @ 的用户 QQ 号列表（仅群聊目标有效） */
    mentionUsers?: string[];
}

/** 同接监听推送目标 (无 mentionUsers) */
export interface BiliOnlineMonitorToInfo {
    id: string;
    type: 'private' | 'group';
}

/** 直播监听记录 (按主播聚合) */
export interface BiliLiveMonitor {
    uid: string;
    /** 主播名称 */
    uname: string;
    /** 直播状态推送目标列表 (不可为空) */
    to: BiliLiveMonitorToInfo[];
    /** 同接数推送目标列表 (为空时不落盘该字段) */
    onlineTo?: BiliOnlineMonitorToInfo[];
}

/** 判断两个推送目标是否指向同一会话 */
function isSameTarget(
    a: { id: string; type: 'private' | 'group' },
    b: { id: string; type: 'private' | 'group' },
): boolean {
    return a.type === b.type && a.id === b.id;
}

export class BiliLiveMonitorStore extends BaseStore<BiliLiveMonitor> {
    private static instance: BiliLiveMonitorStore | null = null;

    private constructor() {
        super(BILI_LIVE_MONITOR_FILENAME);
    }

    static getInstance(): BiliLiveMonitorStore {
        if (!BiliLiveMonitorStore.instance) {
            BiliLiveMonitorStore.instance = new BiliLiveMonitorStore();
        }
        return BiliLiveMonitorStore.instance;
    }

    // ========== 查询 ==========

    /** 获取当前内存中的所有监听记录 */
    get(): BiliLiveMonitor[] {
        return this.getAll();
    }

    /** 按主播 uid 获取记录 (不存在返回 undefined) */
    getByUid(uid: string): BiliLiveMonitor | undefined {
        return this.findItem((item) => item.uid === uid);
    }

    /** 指定会话正在直播监听的主播列表 */
    listForLiveTarget(toInfo: BiliLiveMonitorToInfo): BiliLiveMonitor[] {
        return this.get().filter((monitor) =>
            monitor.to.some((t) => isSameTarget(t, toInfo)),
        );
    }

    /** 指定会话正在同接监听的主播列表 */
    listForOnlineTarget(
        toInfo: BiliOnlineMonitorToInfo,
    ): BiliLiveMonitor[] {
        return this.get().filter((monitor) =>
            monitor.onlineTo?.some((t) => isSameTarget(t, toInfo)),
        );
    }

    /** 该主播是否对指定会话开启了直播状态监听 */
    has(uid: string, toInfo: BiliLiveMonitorToInfo): boolean {
        return (
            this.getByUid(uid)?.to.some((t) =>
                isSameTarget(t, toInfo),
            ) ?? false
        );
    }

    /** 该主播是否被任意会话开启了同接监听 */
    hasOnline(uid: string): boolean {
        return (this.getByUid(uid)?.onlineTo?.length ?? 0) > 0;
    }

    /** 该主播是否对指定会话开启了同接监听 */
    hasOnlineForTarget(
        uid: string,
        toInfo: BiliOnlineMonitorToInfo,
    ): boolean {
        return (
            this.getByUid(uid)?.onlineTo?.some((t) =>
                isSameTarget(t, toInfo),
            ) ?? false
        );
    }

    // ========== 直播目标 (to) ==========

    /**
     * 添加一个直播推送目标 (已存在则无操作)
     * @returns 是否实际新增
     */
    add(
        uid: string,
        uname: string,
        toInfo: BiliLiveMonitorToInfo,
    ): boolean {
        if (typeof uid !== 'string' || uid.trim() === '') {
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
        // 同步最新主播名称, 追加新目标; onlineTo 原样保留
        existing.uname = uname || existing.uname;
        existing.to.push(toInfo);
        this.saveToFile();
        return true;
    }

    /**
     * 移除一个直播推送目标
     *
     * to 清空时整条记录删除 (onlineTo 一并删除, 同接是直播的附属功能)。
     * 未清空时同步移除该目标上的同接监听 (级联语义不变)。
     * @returns 是否实际移除
     */
    remove(uid: string, toInfo: BiliLiveMonitorToInfo): boolean {
        const record = this.getByUid(uid);
        if (!record) return false;

        const before = record.to.length;
        record.to = record.to.filter((t) => !isSameTarget(t, toInfo));
        if (record.to.length === before) return false;

        if (record.to.length === 0) {
            this.removeItem((item) => item.uid === uid);
            return true;
        }

        // 该会话的直播监听已撤, 同接监听一并撤
        const currentOnlineTo = record.onlineTo;
        if (currentOnlineTo) {
            const nextOnlineTo = currentOnlineTo.filter(
                (t) => !isSameTarget(t, toInfo),
            );
            if (nextOnlineTo.length !== currentOnlineTo.length) {
                if (nextOnlineTo.length > 0) {
                    record.onlineTo = nextOnlineTo;
                } else {
                    delete record.onlineTo;
                }
            }
        }
        this.saveToFile();
        return true;
    }

    // ========== 开播 @ 订阅 ==========

    /**
     * 为某主播的某个目标添加一个开播 @ 订阅用户
     * @returns 是否新增（重复订阅返回 false）
     */
    addMention(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
        qq: string,
    ): boolean {
        const target = this.findMentionTarget(uid, toInfo);
        if (!target) return false;

        const mentions = target.mentionUsers ?? [];
        if (mentions.includes(qq)) return false;

        target.mentionUsers = [...mentions, qq];
        this.saveToFile();
        return true;
    }

    /**
     * 移除某主播某个目标的一个开播 @ 订阅用户
     * @returns 是否移除成功（未订阅返回 false）
     */
    removeMention(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
        qq: string,
    ): boolean {
        const target = this.findMentionTarget(uid, toInfo);
        if (!target) return false;

        const mentions = target.mentionUsers ?? [];
        const next = mentions.filter((u) => u !== qq);
        if (next.length === mentions.length) return false;

        // 列表为空时删掉字段，保持存储整洁
        if (next.length > 0) {
            target.mentionUsers = next;
        } else {
            delete target.mentionUsers;
        }
        this.saveToFile();
        return true;
    }

    /** 获取某主播某个目标的开播 @ 订阅用户列表 */
    getMentionUsers(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
    ): string[] {
        return (
            this.findMentionTarget(uid, toInfo)?.mentionUsers ?? []
        );
    }

    // ========== 同接目标 (onlineTo) ==========

    /**
     * 添加一个同接推送目标
     *
     * 同接监听依附于直播监听: 该 uid 没有直播目标时拒绝变更。
     * 服务层已有前置校验, 这里只是 store 侧的防线, 故返回 false 而非抛错。
     * @returns 是否实际新增
     */
    addOnline(uid: string, toInfo: BiliOnlineMonitorToInfo): boolean {
        const record = this.getByUid(uid);
        if (!record || record.to.length === 0) return false;

        const onlineTo = record.onlineTo ?? [];
        if (onlineTo.some((t) => isSameTarget(t, toInfo))) {
            return false;
        }
        record.onlineTo = [...onlineTo, toInfo];
        this.saveToFile();
        return true;
    }

    /**
     * 移除一个同接推送目标 (清空时字段置 undefined, 不落盘空数组)
     * @returns 是否实际移除
     */
    removeOnline(
        uid: string,
        toInfo: BiliOnlineMonitorToInfo,
    ): boolean {
        const record = this.getByUid(uid);
        const onlineTo = record?.onlineTo;
        if (!record || !onlineTo) return false;

        const next = onlineTo.filter((t) => !isSameTarget(t, toInfo));
        if (next.length === onlineTo.length) return false;

        if (next.length > 0) {
            record.onlineTo = next;
        } else {
            delete record.onlineTo;
        }
        this.saveToFile();
        return true;
    }

    // ========== 持久化 ==========

    protected loadFromFile(): BiliLiveMonitor[] {
        // to 为空的记录非法 (不允许只有 onlineTo 没有 to), 加载时剔除
        return super
            .loadFromFile()
            .filter((item) => Array.isArray(item?.to) && item.to.length > 0)
            .map((item) => {
                normalizeRecord(item);
                return item;
            });
    }

    protected saveToFile(): void {
        for (const item of this.getAll()) normalizeRecord(item);
        super.saveToFile();
    }

    /** 查找某主播的某个直播目标（不存在返回 undefined） */
    private findMentionTarget(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
    ): BiliLiveMonitorToInfo | undefined {
        return this.getByUid(uid)?.to.find((t) =>
            isSameTarget(t, toInfo),
        );
    }
}

/** 删掉空数组字段, 保持存储整洁 (空 mentionUsers / 空 onlineTo 不落盘) */
function normalizeRecord(record: BiliLiveMonitor): void {
    for (const target of record.to ?? []) {
        if (target.mentionUsers?.length === 0) {
            delete target.mentionUsers;
        }
    }
    if (record.onlineTo?.length === 0) {
        delete record.onlineTo;
    }
}
