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
import { pluginState } from '../../core/state';
import {
    BiliLiveMonitorStore,
    type BiliLiveMonitorToInfo,
} from '../../store/biliLiveMonitor.store';
import {
    BiliLiveRoomStore,
    type BiliLiveContent,
    type ChangeEvent,
    mapToRoomInfo,
} from '../../store/biliLiveRoom.store';
import { api_getStatusInfoByUids } from '../../api/getStatusInfoByUids';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../../handlers/utils';
import { buildChangeMessage } from './pushCard.service';
import { onlineSnapshotService } from './onlineSnapshots.service';
import {
    buildOnlineChartImageMessage,
    type OnlineChartData,
} from './onlineChart.service';

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

    private _liveStore: BiliLiveMonitorStore | null = null;

    /** 惰性获取监控存储（延迟到 plugin_init 之后实例化） */
    private get liveStore(): BiliLiveMonitorStore {
        if (!this._liveStore) {
            this._liveStore = BiliLiveMonitorStore.getInstance();
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
            // 直播状态更新完成后顺带采集同接快照（跟随轮询节拍, 无独立定时器）
            await this.captureOnlineSnapshots();
        } catch (err) {
            pluginState.logger.error('轮询执行出错:', err);
        } finally {
            this.scheduleNext();
        }
    }

    /** 对"开播且开启同接监听"的主播串行采集同接快照（失败静默） */
    private async captureOnlineSnapshots(): Promise<void> {
        try {
            const uids = this.liveStore.get().map((m) => m.uid);
            await onlineSnapshotService.captureBatch(uids);
        } catch (err) {
            pluginState.logger.warn('同接数批量采集出错:', err);
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
            pluginState.logger.debug(
                '当前无被监控主播，跳过本轮拉取',
            );
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
                        // 累积观众：轮询接口 online 为累积观看人数, 每轮覆盖更新
                        if (roomInfo.live_status === 'streaming') {
                            this.roomStore.updateAccumulatedAudience(
                                roomInfo.uid,
                                roomStatus.online,
                            );
                        }
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

            // 同接监听的运行时数据维护（先于推送, 供推送读取计算）
            this.maintainOnlineRuntimeData(event);

            // 重新开播: 独立处理（先推结束信息, 再推重新开播卡片）
            if (event.type === 'restart_stream') {
                await this.handleRestart(event);
                return;
            }

            // 1. 过滤未启用的推送类型
            const pushTypes = pluginState.config.pushTypes;
            if (!pushTypes || !pushTypes.includes(type)) {
                pluginState.logger.debug(
                    `推送类型 ${type} 未启用, 跳过 uid=${uid}`,
                );
                return;
            }

            // 2. 查询该主播绑定的推送目标
            const monitor = this.liveStore.getByUid(uid);
            if (!monitor || monitor.to.length === 0) {
                pluginState.logger.debug(
                    `主播 ${uid} 未绑定推送目标, 跳过`,
                );
                return;
            }

            // 3. 渲染推送消息: 优先图片卡片, SVG 渲染失败时回退纯文本
            const message = await buildChangeMessage(
                event,
                this.roomStore,
            );
            if (!message) {
                pluginState.logger.debug(
                    `事件 ${type} 无法渲染推送消息, 跳过 uid=${uid}`,
                );
                return;
            }

            // 4. 逐个目标发送
            for (const toInfo of monitor.to) {
                pluginState.logger.debug(
                    `推送 ${type} 通知到 ${toInfo.type}: ${toInfo.id}（uid=${uid}）`,
                );

                // 开播事件: 群目标存在开播 @ 订阅时, 按 10 人一组额外发送 @ 提醒
                if (
                    event.type === 'start_stream' &&
                    toInfo.type === 'group'
                ) {
                    const mentionUsers = toInfo.mentionUsers ?? [];
                    if (mentionUsers.length > 0) {
                        const uname = monitor.uname || uid;
                        await sendMentionMessages(
                            pluginState.ctx,
                            toInfo,
                            mentionUsers,
                            uname,
                        );
                    }
                }

                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
            }

            // 5. 下播推送完成后清理同接运行时数据（推送时仍需读取快照计算平均同接）
            if (event.type === 'end_stream') {
                await this.pushOnlineChart(
                    event,
                    monitor.to,
                );
                this.roomStore.clearRuntimeData(event.uid);
            }
        } catch (err) {
            pluginState.logger.error('处理直播间变化事件出错:', err);
        }
    }

    /**
     * 重新开播事件处理：
     * 1. 视为上一场直播结束, 推送一次结束信息
     *    （时长/同接平均的结束时刻取新开播时间）
     * 2. 推送完成后清理旧场运行时数据（快照/历史/累计观众）
     * 3. 触发新一场首点同接采集, 再推送重新开播卡片
     *
     * 两段推送互为独立通知, 各自捕获错误, 单段失败不影响另一段;
     * 都受 restart_stream 推送类型门控, 门控关闭时仍执行运行时清理
     */
    private async handleRestart(event: ChangeEvent): Promise<void> {
        const { uid } = event;
        const pushTypes = pluginState.config.pushTypes;
        const pushEnabled =
            !!pushTypes && pushTypes.includes('restart_stream');

        const monitor = this.liveStore.getByUid(uid);
        if (!monitor || monitor.to.length === 0) {
            pluginState.logger.debug(
                `主播 ${uid} 未绑定推送目标, 跳过重新开播推送`,
            );
            return;
        }

        if (pushEnabled) {
            // 1. 推送上一场的结束信息（结束时 = 新开播时间）
            try {
                const endEvent: ChangeEvent = {
                    ...event,
                    type: 'end_stream',
                    endTimeSec: event.newValue as number,
                };
                const endMessage = await buildChangeMessage(
                    endEvent,
                    this.roomStore,
                );
                if (endMessage) {
                    for (const toInfo of monitor.to) {
                        await sendReplyByToInfo(
                            pluginState.ctx,
                            toInfo,
                            endMessage,
                        );
                    }
                }
            } catch (err) {
                pluginState.logger.error(
                    `推送重新开播(结束信息)失败 uid=${uid}:`,
                    err,
                );
            }

            // 2. 推送本场同接变化图表, 之后清理旧场运行时数据（快照/历史/累计观众）
            await this.pushOnlineChart(event, monitor.to);
            this.roomStore.clearRuntimeData(uid);
        }

        // 3. 触发新一场首点同接采集（不受门控影响）
        void onlineSnapshotService.captureOnStart(uid);

        // 4. 推送重新开播卡片
        if (pushEnabled) {
            try {
                const restartMessage = await buildChangeMessage(
                    event,
                    this.roomStore,
                );
                if (restartMessage) {
                    for (const toInfo of monitor.to) {
                        await sendReplyByToInfo(
                            pluginState.ctx,
                            toInfo,
                            restartMessage,
                        );
                    }
                }
            } catch (err) {
                pluginState.logger.error(
                    `推送重新开播卡片失败 uid=${uid}:`,
                    err,
                );
            }
        }
    }

    /**
     * 推送本场同接变化图表（纯图片, 渲染一次复用 base64）：
     * 挂在下播/重新开播链路的结束信息之后、运行时数据清理之前,
     * 仅对开启了同接监听的主播触发（快照不足 2 点时静默跳过,
     * 渲染失败也静默, 不回退文本）
     *
     * 数据源分工：快照与内容历史取自存储（事件维护层刚补录最后一段）;
     * 标题/分区/开播时间取变更前信息（下播后 live_time 为 0,
     * restart 时存储顶层字段已是新场）
     */
    private async pushOnlineChart(
        event: ChangeEvent,
        toList: BiliLiveMonitorToInfo[],
    ): Promise<void> {
        try {
            const { uid } = event;
            const stored = this.roomStore.get(uid);
            if (!stored) return;
            const old = event.oldRoomInfo;
            const snapshots = stored.onlineSnapshots ?? [];
            if (snapshots.length < 2) return;

            const endTimeSec =
                event.type === 'restart_stream'
                    ? (event.newValue as number)
                    : event.endTimeSec;
            const data: OnlineChartData = {
                uname: old?.uname || stored.uname,
                liveTimeSec: old?.live_time || 0,
                endTimeSec:
                    endTimeSec && endTimeSec > 0
                        ? endTimeSec
                        : Math.floor(Date.now() / 1000),
                title: old?.title ?? stored.title,
                parentAreaName:
                    old?.parent_area_name ??
                    stored.parent_area_name,
                areaName: old?.area_name ?? stored.area_name,
                liveContents: stored.liveContents ?? [],
                onlineSnapshots: snapshots,
            };
            const message =
                await buildOnlineChartImageMessage(data);
            if (!message) return;
            for (const toInfo of toList) {
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
            }
        } catch (err) {
            pluginState.logger.warn(
                `推送同接变化图表出错 uid=${event.uid}:`,
                err,
            );
        }
    }

    /**
     * 将一段直播内容记入历史，写入前与历史末条做重复检测：
     * 同一次 updateOrAdd 可能因标题+分区同时变化触发多个事件，
     * 各事件携带同一份 oldRoomInfo，会导致相同内容被写入多次。
     * 判定键：title + parent_area_name + area_name + startTime 全部相同。
     */
    private pushLiveContentDeduped(
        uid: string,
        content: BiliLiveContent,
    ): void {
        const contents =
            this.roomStore.get(uid)?.liveContents ?? [];
        const last = contents[contents.length - 1];
        if (
            last &&
            last.title === content.title &&
            last.parent_area_name === content.parent_area_name &&
            last.area_name === content.area_name &&
            last.startTime === content.startTime
        ) {
            pluginState.logger.debug(
                `直播内容历史重复写入，跳过 uid=${uid}`,
            );
            return;
        }
        this.roomStore.pushLiveContent(uid, content);
    }

    /**
     * 同接监听运行时数据维护：
     * - 开播：触发首点同接采集
     * - 直播中改标题/分区：将变更前内容记入直播内容历史
     * - 重新开播：补录旧场最后一段内容（endTime = 新开播时间）,
     *   清理与采集在 handleRestart 中按推送顺序处理
     * - 下播：先把最后一段内容补录进历史（endTime = 下播时间）,
     *   推送完成后再清空快照/历史并重置累计观众（见 afterPushCleanup）
     */
    private maintainOnlineRuntimeData(event: ChangeEvent): void {
        try {
            const nowSec = Math.floor(Date.now() / 1000);
            const old = event.oldRoomInfo;

            switch (event.type) {
                case 'start_stream': {
                    // 兜底清理上一场的残留（end_stream 推送未启用时不会触发清理）
                    this.roomStore.clearRuntimeData(event.uid);
                    void onlineSnapshotService.captureOnStart(
                        event.uid,
                    );
                    break;
                }
                case 'title_changed':
                case 'area_changed': {
                    if (!old) break;
                    this.pushLiveContentDeduped(event.uid, {
                        title: old.title,
                        parent_area_name: old.parent_area_name,
                        area_name: old.area_name,
                        startTime: old.live_time,
                        endTime: nowSec,
                    });
                    break;
                }
                case 'restart_stream': {
                    if (!old) break;
                    // 上一场结束时刻 = 新开播时间（轮询间隙内的
                    // 精确下播时刻拿不到, 取新开播时间近似）
                    const restartEnd =
                        (event.newValue as number) || nowSec;
                    this.pushLiveContentDeduped(event.uid, {
                        title: old.title,
                        parent_area_name: old.parent_area_name,
                        area_name: old.area_name,
                        startTime: old.live_time,
                        endTime: restartEnd,
                    });
                    break;
                }
                case 'end_stream': {
                    if (!old) break;
                    const contents =
                        this.roomStore.get(event.uid)?.liveContents ??
                        [];
                    const lastEnd =
                        contents.length > 0
                            ? contents[contents.length - 1].endTime
                            : old.live_time;
                    this.pushLiveContentDeduped(event.uid, {
                        title: old.title,
                        parent_area_name: old.parent_area_name,
                        area_name: old.area_name,
                        startTime: lastEnd,
                        endTime: nowSec,
                    });
                    break;
                }
                default:
                    break;
            }
        } catch (err) {
            pluginState.logger.warn('同接运行时数据维护出错:', err);
        }
    }
}

// ==================== 开播 @ 订阅消息 ====================

/** 每条 mention 消息最多 @ 的用户数 */
const MENTION_GROUP_SIZE = 10;

/**
 * 向群目标按 10 人一组发送开播 @ 提醒消息
 * 每条消息格式：第一行 @ 用户们，第二行「主播名」开始直播了
 */
async function sendMentionMessages(
    ctx: NapCatPluginContext,
    toInfo: BiliLiveMonitorToInfo,
    mentionUsers: string[],
    uname: string,
): Promise<void> {
    for (
        let i = 0;
        i < mentionUsers.length;
        i += MENTION_GROUP_SIZE
    ) {
        const chunk = mentionUsers.slice(i, i + MENTION_GROUP_SIZE);
        const message: OB11PostSendMsg['message'] = [
            ...chunk.map((qq) => ({
                type: 'at' as OB11MessageDataType.at,
                data: { qq },
            })),
            {
                type: 'text' as OB11MessageDataType.text,
                data: { text: `\n「${uname}」开始直播了` },
            },
        ];
        await sendReplyByToInfo(ctx, toInfo, message);
    }
}
