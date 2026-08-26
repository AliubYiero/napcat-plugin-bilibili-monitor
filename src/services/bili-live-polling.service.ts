/**
 * Bilibili 直播轮询服务
 *
 * 职责：
 * 1. 定时从 B站接口拉取所有被监控主播的直播间状态
 * 2. 将最新状态喂给 BiliLiveRoomStore（内部完成变化检测）
 * 3. 监听 store 的变化事件，按配置的推送类型渲染文本并推送到各目标
 *
 * 注意：store 单例依赖 pluginState.ctx，必须在 plugin_init 之后才可实例化，
 * 因此这里使用惰性 getter，避免模块加载期过早初始化抛错。
 */
import { pluginState } from '../core/state';
import { BiliLiveStore } from '../store/bili-live.store';
import {
    BiliLiveRoomStore,
    type BiliLiveRoomInfo,
    type ChangeEvent,
} from '../store/bili-live-room.store';
import {
    api_getStatusInfoByUids,
    type RoomStatusInfo,
} from '../api/api_getStatusInfoByUids';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../handlers/message.handler';

/** B站接口单次最大请求房间数 */
const MAX_ROOM_IDS_PER_REQUEST = 100;

/** 默认轮询间隔（秒），配置缺失时兜底 */
const DEFAULT_POLL_INTERVAL = 60;

/** 轮询服务（单例） */
export class BiliLivePollingService {
    private static instance: BiliLivePollingService | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private stopped = false;

    private constructor() {}

    private _liveStore: BiliLiveStore | null = null;

    /** 惰性获取监控存储（延迟到 plugin_init 之后实例化） */
    private get liveStore(): BiliLiveStore {
        if (!this._liveStore) {
            this._liveStore = BiliLiveStore.getInstance();
        }
        return this._liveStore;
    }

    private _roomStore: BiliLiveRoomStore | null = null;

    /** 惰性获取房间存储，并注册变化监听器（只注册一次） */
    private get roomStore(): BiliLiveRoomStore {
        if (!this._roomStore) {
            this._roomStore = BiliLiveRoomStore.getInstance();
            this._roomStore.on((event) => {
                void this.handleChange(event);
            });
        }
        return this._roomStore;
    }

    static getInstance(): BiliLivePollingService {
        if (!BiliLivePollingService.instance) {
            BiliLivePollingService.instance =
                new BiliLivePollingService();
        }
        return BiliLivePollingService.instance;
    }

    /** 启动轮询（plugin_init 中调用） */
    start(): void {
        if (this.running) return;
        this.running = true;
        this.stopped = false;
        // 触发 getter，初始化存储单例并注册监听器
        void this.liveStore;
        void this.roomStore;
        pluginState.logger.debug('轮询服务已启动');
        void this.tick();
    }

    /** 停止轮询（plugin_cleanup 中调用） */
    stop(): void {
        this.stopped = true;
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        pluginState.logger.debug('轮询服务已停止');
    }

    /** 单个轮询周期 */
    private async tick(): Promise<void> {
        if (this.stopped) return;
        try {
            // 全局开关关闭时跳过本轮（定时器照常运行，恢复后下一轮立即生效）
            if (!pluginState.config.enabled) {
                pluginState.logger.debug('插件已禁用，跳过本轮轮询');
                return;
            }
            await this.pollOnce();
        } catch (err) {
            pluginState.logger.error('轮询执行出错:', err);
        } finally {
            this.scheduleNext();
        }
    }

    /** 调度下一轮（读取最新配置间隔，实现"改配置即生效"） */
    private scheduleNext(): void {
        if (this.stopped) return;
        const intervalMs =
            Math.max(
                1,
                pluginState.config.pollIntervalSeconds ??
                    DEFAULT_POLL_INTERVAL,
            ) * 1000;
        this.timer = setTimeout(() => {
            void this.tick();
        }, intervalMs);
    }

    /** 执行一次拉取与更新 */
    private async pollOnce(): Promise<void> {
        const monitors = this.liveStore.get();
        if (monitors.length === 0) {
            pluginState.logger.debug('当前无被监控主播，跳过本轮拉取');
            return;
        }
        pluginState.logger.debug(
            `开始拉取直播状态，共 ${monitors.length} 个主播`,
        );

        const uids = monitors.map((m) => m.uid);
        // 按批次请求（B站接口单次最多 100 个）
        for (
            let i = 0;
            i < uids.length;
            i += MAX_ROOM_IDS_PER_REQUEST
        ) {
            const batch = uids.slice(i, i + MAX_ROOM_IDS_PER_REQUEST);
            try {
                const response = await api_getStatusInfoByUids(batch);
                const data = response?.data;
                if (!data) {
                    pluginState.logger.warn(
                        `拉取 ${batch.length} 个主播返回数据为空`,
                    );
                    continue;
                }
                pluginState.logger.debug(
                    `成功拉取 ${batch.length} 个主播的直播状态`,
                );
                for (const roomStatus of Object.values(data)) {
                    const roomInfo = mapToRoomInfo(roomStatus);
                    if (roomInfo) {
                        this.roomStore.updateOrAdd(roomInfo);
                    } else {
                        pluginState.logger.debug(
                            `忽略无效的直播间数据 (uid: ${roomStatus?.uid})`,
                        );
                    }
                }
            } catch (err) {
                // 单批失败不影响整轮，记录后继续下一批
                pluginState.logger.error(
                    `拉取直播间状态失败（本批 ${batch.length} 个主播）:`,
                    err,
                );
            }
        }
    }

    /** 处理变化事件并推送 */
    private async handleChange(event: ChangeEvent): Promise<void> {
        try {
            const { uid, type } = event;
            pluginState.logger.debug(
                `收到直播间变化事件: uid=${uid}, type=${type}`,
            );

            // 1. 过滤未启用的推送类型
            const pushTypes = pluginState.config.pushTypes;
            if (!pushTypes || !pushTypes.includes(type)) {
                pluginState.logger.debug(
                    `推送类型 ${type} 未启用, 跳过 uid=${uid}`,
                );
                return;
            }

            // 2. 查询该主播绑定的推送目标
            const monitor = this.liveStore
                .get()
                .find((m) => m.uid === uid);
            if (!monitor || monitor.to.length === 0) {
                pluginState.logger.debug(
                    `主播 ${uid} 未绑定推送目标, 跳过`,
                );
                return;
            }

            // 3. 渲染推送文本
            const message = renderMessage(event, this.roomStore);
            if (!message) {
                pluginState.logger.debug(
                    `事件 ${type} 无法渲染推送文本, 跳过 uid=${uid}`,
                );
                return;
            }

            // 4. 逐个目标发送
            for (const toInfo of monitor.to) {
                pluginState.logger.debug(
                    `推送 ${type} 通知到 ${toInfo.type}: ${toInfo.id}（uid=${uid}）`,
                );
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
            }
        } catch (err) {
            pluginState.logger.error('处理直播间变化事件出错:', err);
        }
    }
}

// ==================== 映射与渲染工具 ====================

/** 将 B站接口返回的房间状态映射为内部 BiliLiveRoomInfo */
function mapToRoomInfo(
    room: RoomStatusInfo,
): BiliLiveRoomInfo | null {
    if (!room || typeof room.uid !== 'number') return null;
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
        cover_from_user: room.cover_from_user || '',
        keyframe: room.keyframe || '',
    };
}

/** 按事件类型渲染推送消息（文本字符串或消息段数组），无法渲染时返回 null */
function renderMessage(
    event: ChangeEvent,
    roomStore: BiliLiveRoomStore,
): OB11PostSendMsg['message'] | null {
    const latest = roomStore.get(event.uid);
    const old = event.oldRoomInfo;
    const time = formatTime(Date.now());
    const nowSec = Math.floor(Date.now() / 1000);

    switch (event.type) {
        case 'start_stream': {
            if (!latest) return null;
            const text = [
                `[${time}] ${latest.uname} 开始了直播`,
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                `链接: ${roomUrl(latest.room_id)}`,
            ].join('\n');
            // 附带图片（放最后）：优先直播间封面，缺失时回退到关键帧
            const imageUrl = latest.cover_from_user || latest.keyframe;
            if (!imageUrl) return text;
            return [
                { type: 'text' as OB11MessageDataType.text, data: { text } },
                { type: 'image' as OB11MessageDataType.image, data: { file: imageUrl } },
            ];
        }
        case 'end_stream': {
            if (!old) return null;
            return [
                `[${time}] ${old.uname} 结束了直播`,
                durationLine(nowSec - old.live_time),
                `标题: ${old.title}`,
                `分区: ${formatArea(old.parent_area_name, old.area_name)}`,
                `链接: ${roomUrl(old.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        case 'title_changed': {
            if (!latest) return null;
            return [
                `[${time}] ${latest.uname} 修改了直播标题 「${event.oldValue ?? ''}」->「${event.newValue ?? ''}」`,
                durationLine(nowSec - latest.live_time),
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                `链接: ${roomUrl(latest.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        case 'area_changed': {
            if (!latest) return null;
            const oldArea = event.oldValue as
                | { parent?: string; area?: string }
                | undefined;
            const newArea = event.newValue as
                | { parent?: string; area?: string }
                | undefined;
            return [
                `[${time}] ${latest.uname} 修改了直播分区 「${formatArea(oldArea?.parent, oldArea?.area)}」->「${formatArea(newArea?.parent, newArea?.area)}」`,
                durationLine(nowSec - latest.live_time),
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                `链接: ${roomUrl(latest.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        default:
            return null;
    }
}

/** 时长行（非直播中或开播时间为 0 时返回 null，以便过滤掉） */
function durationLine(durationSec: number): string | null {
    if (durationSec <= 0) return null;
    return `时长: ${formatDuration(durationSec)}`;
}

/** 格式化时间: YYYY/M/D HH:mm:ss */
function formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 格式化时长: H:MM:SS */
function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${h}:${pad(m)}:${pad(s)}`;
}

/** 复合分区文本: 父-子；父为空或等于子只显示子；都为空显示"未知分区" */
function formatArea(parent?: string, area?: string): string {
    const parentName = parent?.trim() || '';
    const areaName = area?.trim() || '';
    if (!parentName && !areaName) return '未知分区';
    if (!parentName || parentName === areaName)
        return areaName || parentName;
    return `${parentName}-${areaName}`;
}

/** 直播间链接 */
function roomUrl(roomId?: number): string {
    return roomId ? `https://live.bilibili.com/${roomId}` : '';
}
