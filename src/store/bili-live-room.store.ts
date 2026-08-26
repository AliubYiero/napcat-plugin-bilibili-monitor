// BiliLiveRoomStore.ts
import { pluginState } from '../core/state';

const ROOM_DATA_FILENAME = 'bilibiliLiveRoomData.json';

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
    /** 直播间封面 url（主播设置，可能为空） */
    cover_from_user?: string;
    /** 直播间关键帧 url（直播画面截图，可能为空） */
    keyframe?: string;
}

/** 变化类型枚举 */
export type ChangeType =
    | 'start_stream' // 开始直播（offline → streaming）
    | 'end_stream' // 结束直播（streaming → offline）
    | 'title_changed' // 标题变化
    | 'area_changed'; // 分区变化（父分区或子分区变化）

/** 变化事件详情 */
export interface ChangeEvent {
    uid: string; // 主播 uid（字符串形式）
    type: ChangeType;
    oldValue?: any; // 旧值（具体字段的旧值，便于使用）
    newValue?: any;
    /** 变更前的完整直播间信息（结束直播时取开播时间等旧值用） */
    oldRoomInfo?: BiliLiveRoomInfo;
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
            // 无变化，不覆盖（但也可以覆盖，视业务需求，此处不覆盖以节省性能）
            return false;
        }

        // 覆盖数据
        this.data[uid] = { ...roomInfo };
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

        // 1. 直播状态变化
        if (oldInfo.live_status !== newInfo.live_status) {
            if (
                oldInfo.live_status === 'offline' &&
                newInfo.live_status === 'streaming'
            ) {
                changes.push({
                    type: 'start_stream',
                    oldValue: 'offline',
                    newValue: 'streaming',
                });
            } else if (
                oldInfo.live_status === 'streaming' &&
                newInfo.live_status === 'offline'
            ) {
                changes.push({
                    type: 'end_stream',
                    oldValue: 'streaming',
                    newValue: 'offline',
                });
            }
        }

        // 2. 标题变化
        if (oldInfo.title !== newInfo.title) {
            changes.push({
                type: 'title_changed',
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
                type: 'area_changed',
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
