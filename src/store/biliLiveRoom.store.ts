// BiliLiveRoomStore.ts
import { pluginState } from '../core/state';
import type { RoomStatusInfo } from '../api/getStatusInfoByUids';

const ROOM_DATA_FILENAME = 'bilibiliLiveRoomData.json';

/** 将 B站接口返回的房间状态映射为内部 BiliLiveRoomInfo */
export function mapToRoomInfo(
    room: RoomStatusInfo,
): BiliLiveRoomInfo | null {
    if (!room || typeof room.uid !== 'number') return null;
    // 运行时字段（liveContents 等）此处留空, 由事件/采集层填充
    return {
        room_id: room.room_id,
        uid: room.uid,
        // live_status: 0 未开播, 1 正在直播, 2 轮播中；仅 1 视为 streaming
        live_status: room.live_status === 1 ? 'streaming' : 'offline',
        title: room.title || '',
        parent_area_name: room.area_v2_parent_name || '',
        area_name: room.area_v2_name || '',
        live_time: room.live_time || 0,
        uname: room.uname || '',
        avatar: room.face || '',
        cover_from_user: room.cover_from_user || '',
        keyframe: room.keyframe || '',
        liveContents: [],
        accumulatedAudience: 0,
        onlineSnapshots: [],
    };
}

/** 直播内容记录：一次连续的标题+分区区间 */
export interface BiliLiveContent {
    title: string;
    parent_area_name: string;
    area_name: string;
    /** 内容开始时间戳（秒）：首个内容为开播时间，其余为上一内容的结束时间 */
    startTime: number;
    /** 内容结束时间戳（秒）：变更（或下播）事件发生的时间 */
    endTime: number;
}

/** 同接数快照：[同接数, 采集时间戳（秒）] */
export type BiliOnlineSnapshot = [number, number];

/** 直播间信息（与接口对齐） */
export interface BiliLiveRoomInfo {
    room_id: number;
    uid: number;
    live_status: 'streaming' | 'offline';
    title: string;
    parent_area_name: string;
    area_name: string;
    live_time: number; // 开播时间戳（秒），未开播时为 0
    uname: string;
    /** 主播头像 url */
    avatar?: string;
    /** 直播间封面 url（主播设置，可能为空） */
    cover_from_user?: string;
    /** 直播间关键帧 url（直播画面截图，可能为空） */
    keyframe?: string;
    /** 直播内容历史记录（不含当前内容，当前内容即顶层 title/分区字段；下播时补录最后一段） */
    liveContents: BiliLiveContent[];
    /** 累计观众（轮询接口 online 字段覆盖更新，下播重置 0） */
    accumulatedAudience: number;
    /** 实时同接数快照序列（开播时抓首点，轮询节拍追加，下播推送后清空） */
    onlineSnapshots: BiliOnlineSnapshot[];
}

/** 重新开播判定窗口（秒）：两次开播时间在此窗口内视为重新开播 */
export const RESTART_WINDOW_SEC = 5 * 60;

/** 变化类型枚举 */
export type ChangeType =
    | 'start_stream' // 开始直播（offline → streaming）
    | 'end_stream' // 结束直播（streaming → offline）
    | 'restart_stream' // 重新开播（直播中 live_time 变化且在窗口内）
    | 'title_changed' // 标题变化（直播中）
    | 'area_changed' // 分区变化（父分区或子分区变化，直播中）
    | 'offline_title_changed' // 标题变化（未直播）
    | 'offline_area_changed'; // 分区变化（未直播）

/** 变化事件详情 */
export interface ChangeEvent {
    uid: string; // 主播 uid（字符串形式）
    type: ChangeType;
    oldValue?: any; // 旧值（具体字段的旧值，便于使用）
    newValue?: any;
    /** 变更前的完整直播间信息（结束直播时取开播时间等旧值用） */
    oldRoomInfo?: BiliLiveRoomInfo;
    /**
     * 结束时刻覆盖（秒）：重新开播触发的结束信息中，
     * 上一场的结束时刻为新的开播时间（轮询间隙内的精确下播时刻拿不到），
     * 缺省为当前时间
     */
    endTimeSec?: number;
}

/** 监听器类型 */
type ChangeListener = (event: ChangeEvent) => void;

/**
 * Bilibili 直播间信息存储（单例）
 * - 内存存储为 Record<uid, BiliLiveRoomInfo>
 * - 自动持久化到文件
 * - 支持变化监听（开始/结束直播、标题修改、分区修改）
 */
export class BiliLiveRoomStore {
    private static instance: BiliLiveRoomStore | null = null;
    private data: Record<string, BiliLiveRoomInfo> = {};
    private listeners: ChangeListener[] = [];

    private constructor() {
        this.loadFromFile();
    }

    static getInstance(): BiliLiveRoomStore {
        if (!BiliLiveRoomStore.instance) {
            BiliLiveRoomStore.instance = new BiliLiveRoomStore();
        }
        return BiliLiveRoomStore.instance;
    }

    // ========== 数据查询 ==========

    /** 获取所有数据（浅拷贝，防止外部修改） */
    getAll(): Record<string, BiliLiveRoomInfo> {
        return { ...this.data };
    }

    /** 根据 uid（字符串）获取单个直播间信息，不存在返回 undefined */
    get(uid: string): BiliLiveRoomInfo | undefined {
        return this.data[uid];
    }

    // ========== 更新 / 添加 ==========

    /**
     * 更新或添加直播间信息
     * - 如果该 uid 已存在，则比对变化并触发事件，然后覆盖数据
     * - 如果不存在，则直接添加（此时不会触发变化事件）
     * @param roomInfo 新的直播间信息
     * @returns 是否发生了更新（存在且发生变化）
     */
    updateOrAdd(roomInfo: BiliLiveRoomInfo): boolean {
        const uid = String(roomInfo.uid);
        const oldInfo = this.data[uid];

        // 如果不存在，直接添加并保存
        if (!oldInfo) {
            this.data[uid] = { ...roomInfo };
            this.saveToFile();
            return false; // 新添加，不算更新
        }

        // 存在时，逐个比对字段
        const changes = this.detectChanges(oldInfo, roomInfo);
        if (changes.length === 0) {
            // 超过重新开播窗口的 live_time 变化：检测层不发事件，
            // 旧场数据属于未观测到的"黑箱直播"，静默清理后覆盖
            if (
                oldInfo.live_status === 'streaming' &&
                roomInfo.live_status === 'streaming' &&
                oldInfo.live_time > 0 &&
                roomInfo.live_time > 0 &&
                oldInfo.live_time !== roomInfo.live_time
            ) {
                this.data[uid] = roomInfo;
                this.saveToFile();
                this.clearRuntimeData(uid);
            }
            // 无变化，不覆盖（但也可以覆盖，视业务需求，此处不覆盖以节省性能）
            return false;
        }

        // 覆盖数据：接口映射不携带运行时字段, 保留旧的采集/内容记录
        this.data[uid] = {
            ...roomInfo,
            liveContents: oldInfo.liveContents ?? [],
            accumulatedAudience:
                roomInfo.accumulatedAudience ||
                oldInfo.accumulatedAudience ||
                0,
            onlineSnapshots: oldInfo.onlineSnapshots ?? [],
        };
        this.saveToFile();

        // 触发所有监听器（每个变化类型分别触发）
        changes.forEach((change) => {
            this.notifyListeners({
                uid,
                type: change.type,
                oldValue: change.oldValue,
                newValue: change.newValue,
                oldRoomInfo: oldInfo,
            });
        });

        return true;
    }

    // ========== 运行时字段更新（不触发变化事件） ==========

    /** 更新累计观众（轮询每轮覆盖，未开播或无记录时忽略） */
    updateAccumulatedAudience(uid: string, online: number): void {
        const info = this.data[uid];
        if (!info || online <= 0) return;
        if (info.accumulatedAudience === online) return;
        info.accumulatedAudience = online;
        this.saveToFile();
    }

    /** 追加一条同接数快照（无记录时忽略） */
    appendOnlineSnapshot(
        uid: string,
        snapshot: BiliOnlineSnapshot,
    ): void {
        const info = this.data[uid];
        if (!info) return;
        info.onlineSnapshots.push(snapshot);
        this.saveToFile();
    }

    /** 将一段直播内容记入历史（uid 字符串由调用方给定） */
    pushLiveContent(uid: string, content: BiliLiveContent): void {
        const info = this.data[uid];
        if (!info) return;
        info.liveContents.push(content);
        this.saveToFile();
    }

    /**
     * 下播后清理运行时数据：清空同接快照与内容历史，重置累计观众
     */
    clearRuntimeData(uid: string): void {
        const info = this.data[uid];
        if (!info) return;
        info.liveContents = [];
        info.accumulatedAudience = 0;
        info.onlineSnapshots = [];
        this.saveToFile();
    }

    // ========== 变化监听 ==========

    /**
     * 注册变化监听器
     * @param listener 回调函数，接收 ChangeEvent
     * @returns 取消监听的函数
     */
    on(listener: ChangeListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(
                (l) => l !== listener,
            );
        };
    }

    /** 强制重新从文件加载（用于外部修改后同步） */
    reload(): void {
        this.loadFromFile();
    }

    // ========== 变化检测（核心） ==========

    /** 清空所有数据并保存 */
    reset(): void {
        this.data = {};
        this.saveToFile();
    }

    // ========== 文件持久化 ==========

    /** 通知所有监听器（内部） */
    private notifyListeners(event: ChangeEvent): void {
        this.listeners.forEach((listener) => {
            try {
                listener(event);
            } catch (err) {
                console.error('变化监听器执行出错:', err);
            }
        });
    }

    /**
     * 比对新旧两个对象，返回变化数组
     *
     * - 直播状态变化（开始/结束直播）始终触发，并吞掉同一次比对到的
     *   标题/分区差异（状态推送本身已携带最新状态）
     * - 直播中 live_time 变化视为重新开播：窗口内触发 restart_stream
     *   （吞掉同次标题/分区差异）；超过窗口或新开播时间为 0（接口
     *   异常）不触发事件，由轮询层静默处理旧场数据
     * - 状态不变时，标题/分区变化按当前直播状态区分事件类型：
     *   直播中为 title_changed/area_changed，未直播为 offline_* 变体
     */
    private detectChanges(
        oldInfo: BiliLiveRoomInfo,
        newInfo: BiliLiveRoomInfo,
    ): { type: ChangeType; oldValue: any; newValue: any }[] {
        const changes: {
            type: ChangeType;
            oldValue: any;
            newValue: any;
        }[] = [];

        const oldStatus = oldInfo.live_status;
        const newStatus = newInfo.live_status;

        // 1. 直播状态变化（吞掉同次的字段差异）
        if (oldStatus !== newStatus) {
            if (
                oldStatus === 'offline' &&
                newStatus === 'streaming'
            ) {
                changes.push({
                    type: 'start_stream',
                    oldValue: 'offline',
                    newValue: 'streaming',
                });
            } else if (
                oldStatus === 'streaming' &&
                newStatus === 'offline'
            ) {
                changes.push({
                    type: 'end_stream',
                    oldValue: 'streaming',
                    newValue: 'offline',
                });
            }
            return changes;
        }

        // 1.5 重新开播检测（直播中 live_time 变化）
        if (
            newStatus === 'streaming' &&
            newInfo.live_time > 0 &&
            oldInfo.live_time > 0 &&
            oldInfo.live_time !== newInfo.live_time
        ) {
            const gap = newInfo.live_time - oldInfo.live_time;
            if (Math.abs(gap) <= RESTART_WINDOW_SEC) {
                changes.push({
                    type: 'restart_stream',
                    oldValue: oldInfo.live_time,
                    newValue: newInfo.live_time,
                });
            }
            // 超过窗口（含负向修正）不触发事件，吞掉同次字段差异
            return changes;
        }

        // 2. 标题变化（按直播状态区分事件类型）
        if (oldInfo.title !== newInfo.title) {
            changes.push({
                type:
                    newStatus === 'streaming'
                        ? 'title_changed'
                        : 'offline_title_changed',
                oldValue: oldInfo.title,
                newValue: newInfo.title,
            });
        }

        // 3. 分区变化（父分区或子分区任一变化视为分区变化）
        if (
            oldInfo.parent_area_name !== newInfo.parent_area_name ||
            oldInfo.area_name !== newInfo.area_name
        ) {
            changes.push({
                type:
                    newStatus === 'streaming'
                        ? 'area_changed'
                        : 'offline_area_changed',
                oldValue: {
                    parent: oldInfo.parent_area_name,
                    area: oldInfo.area_name,
                },
                newValue: {
                    parent: newInfo.parent_area_name,
                    area: newInfo.area_name,
                },
            });
        }

        return changes;
    }

    // ========== 工具 ==========

    /** 从文件加载数据 */
    private loadFromFile(): void {
        this.data = pluginState.loadDataFile<
            Record<string, BiliLiveRoomInfo>
        >(ROOM_DATA_FILENAME, {});
        // 确保数据类型正确（防止文件损坏）
        if (
            typeof this.data !== 'object' ||
            this.data === null ||
            Array.isArray(this.data)
        ) {
            this.data = {};
        }
    }

    /** 保存数据到文件 */
    private saveToFile(): void {
        pluginState.saveDataFile(ROOM_DATA_FILENAME, this.data);
    }
}
