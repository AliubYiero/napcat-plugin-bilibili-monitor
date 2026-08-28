import { pluginState } from '../core/state';
import {
    type BiliLiveMonitor,
    type BiliLiveMonitorToInfo,
    BiliLiveStore,
} from '../store/bili-live.store';
import {
    BiliLiveRoomStore,
    type ChangeEvent,
    mapToRoomInfo,
} from '../store/bili-live-room.store';
import { sendReplyByToInfo } from '../handlers/message.handler';
import {
    getLiveLimit,
    isLiveLimitReached,
} from './live-limit.service';
import { api_getStatusInfoByUids } from '../api/api_getStatusInfoByUids';
import { buildChangeMessage } from './live-push-card.service';

/**
 * Bilibili 直播变化监听器
 */
class BiliLiveStoreService {
    private _biliLiveStore: BiliLiveStore | null = null;

    /** 惰性获取存储实例（避免模块加载期触达未初始化的 pluginState.ctx） */
    private get biliLiveStore(): BiliLiveStore {
        if (!this._biliLiveStore) {
            this._biliLiveStore = BiliLiveStore.getInstance();
        }
        return this._biliLiveStore;
    }

    private _roomStore: BiliLiveRoomStore | null = null;

    /** 惰性获取房间存储（add 立即推送时同步/读取房间基线） */
    private get roomStore(): BiliLiveRoomStore {
        if (!this._roomStore) {
            this._roomStore = BiliLiveRoomStore.getInstance();
        }
        return this._roomStore;
    }

    /**
     * 添加直播间推送
     */
    async add(uid: string, toInfo: BiliLiveMonitorToInfo) {
        try {
            // 检查 UID 是否已存在在存储中
            const hasUid = this.biliLiveStore.has(uid, toInfo);
            if (!hasUid && isLiveLimitReached(toInfo, this.list(toInfo).length)) {
                // 达到监听上限, 拒绝新增
                const limit = getLiveLimit(toInfo);
                const message =
                    toInfo.type === 'private'
                        ? `私聊仅支持监听 ${limit} 个主播, 当前监听数已达上限 (${this.list(toInfo).length}/${limit}), 请先使用 #bili live remove 移除现有订阅`
                        : `当前监听数已达上限 (${this.list(toInfo).length}/${limit})，请联系机器人管理员或使用 #bili live remove 移除现有订阅`;
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
                return;
            }
            if (hasUid) {
                // 已存在则直接返回, 并带上已保存的主播名称
                const uname = this.getUname(uid);
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `主播「${uname || uid}」(${uid}) 已在监听列表中, 请勿重复添加`,
                );
                return;
            }
            // 如果 UID 不存在在存储中, 检查该 UID 是否为有效的主播
            const response = await api_getStatusInfoByUids([uid]);
            const liveInfo = response.data?.[uid];
            if (!liveInfo) {
                pluginState.ctx.logger.error(
                    response.code,
                    response.message,
                );
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `未找到主播 ${uid} 的信息, 添加失败`,
                );
                return;
            }

            // 同步房间状态到 roomStore, 作为轮询基线
            // （先于加入监听, 避免此处触发的开播事件重复推送给新目标）
            const roomInfo = mapToRoomInfo(liveInfo);
            if (roomInfo) {
                this.roomStore.updateOrAdd(roomInfo);
            }

            this.biliLiveStore.add(uid, liveInfo.uname, toInfo);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                `已开始监听主播「${liveInfo.uname}」(${uid})`,
            );

            // 添加时主播正在直播 → 立即推送一次开播通知（受推送类型开关约束）
            if (
                liveInfo.live_status === 1 &&
                this.isStartStreamPushEnabled()
            ) {
                await this.pushStartStreamToTarget(uid, toInfo);
            }
        } catch (_e) {
            const errorMessage = `主播 ${uid} 添加失败`;
            pluginState.ctx.logger.error(errorMessage, _e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                errorMessage,
            );
        }
    }

    /**
     * 删除直播间推送
     */
    async remove(uid: string, toInfo: BiliLiveMonitorToInfo) {
        try {
            const uname = this.getUname(uid);
            const isRemoved = this.biliLiveStore.remove(uid, toInfo);
            const message = isRemoved
                ? `已停止监听主播「${uname || uid}」(${uid})`
                : `未找到主播「${uname || uid}」(${uid}) 的监听信息, 移除失败`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            const errorMessage = `主播 ${uid} 移除监听失败`;
            pluginState.ctx.logger.error(errorMessage, e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                errorMessage,
            );
        }
    }

    /**
     * 获取指定会话正在监听的主播列表
     */
    list(toInfo: BiliLiveMonitorToInfo): BiliLiveMonitor[] {
        return this.biliLiveStore
            .get()
            .filter((monitor) =>
                monitor.to.some(
                    (t) => t.type === toInfo.type && t.id === toInfo.id,
                ),
            );
    }

    /**
     * 根据 UID 获取已保存的主播名称, 未保存时返回空字符串
     */
    private getUname(uid: string): string {
        return (
            this.biliLiveStore
                .get()
                .find((monitor) => monitor.uid === uid)?.uname ?? ''
        );
    }

    /**
     * 添加开播 @ 订阅（仅群聊, 由 handler 保证）
     */
    async addMention(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
        qq: string,
    ) {
        try {
            if (!this.biliLiveStore.has(uid, toInfo)) {
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `当前群未监听此主播 (uid: ${uid})`,
                );
                return;
            }
            const uname = this.getUname(uid);
            const isAdded = this.biliLiveStore.addMention(uid, toInfo, qq);
            const message = isAdded
                ? `已订阅「${uname || uid}」(${uid}) 开播 @ 提醒`
                : `已订阅过「${uname || uid}」(${uid}) 开播 @ 提醒`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            pluginState.ctx.logger.error('订阅开播 @ 失败:', e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                '订阅开播 @ 失败',
            );
        }
    }

    /**
     * 取消开播 @ 订阅（仅群聊, 由 handler 保证）
     */
    async removeMention(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
        qq: string,
    ) {
        try {
            if (!this.biliLiveStore.has(uid, toInfo)) {
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `当前群未监听此主播 (uid: ${uid})`,
                );
                return;
            }
            const uname = this.getUname(uid);
            const isRemoved = this.biliLiveStore.removeMention(
                uid,
                toInfo,
                qq,
            );
            const message = isRemoved
                ? `已取消订阅「${uname || uid}」(${uid}) 开播 @ 提醒`
                : `未订阅「${uname || uid}」(${uid}) 开播 @ 提醒`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            pluginState.ctx.logger.error('取消订阅开播 @ 失败:', e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                '取消订阅开播 @ 失败',
            );
        }
    }

    /**
     * 是否启用了"开始直播"推送类型（配置缺失时默认启用）
     */
    private isStartStreamPushEnabled(): boolean {
        return (
            pluginState.config.pushTypes?.includes('start_stream') ?? true
        );
    }

    /**
     * 向单个目标推送一条开播通知（复用卡片/文本渲染）
     * 渲染失败时静默, 不影响添加流程
     */
    private async pushStartStreamToTarget(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
    ): Promise<void> {
        try {
            const event: ChangeEvent = {
                uid,
                type: 'start_stream',
                newValue: 'streaming',
            };
            const message = await buildChangeMessage(
                event,
                this.roomStore,
            );
            if (message) {
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
            }
        } catch (err) {
            pluginState.ctx.logger.debug(
                'add 立即推送开播通知失败:',
                err,
            );
        }
    }
}

export const biliLiveStoreService = new BiliLiveStoreService();
