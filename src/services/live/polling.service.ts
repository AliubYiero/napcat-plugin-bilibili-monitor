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
    BiliLiveStore,
    type BiliLiveMonitorToInfo,
} from '../../store/biliLive.store';
import {
    BiliLiveRoomStore,
    type ChangeEvent,
    mapToRoomInfo,
} from '../../store/biliLiveRoom.store';
import { api_getStatusInfoByUids } from '../../api/getStatusInfoByUids';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../../handlers/message.handler';
import { buildChangeMessage } from './pushCard.service';

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
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
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
            }
        } catch (err) {
            pluginState.logger.error('处理直播间变化事件出错:', err);
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
