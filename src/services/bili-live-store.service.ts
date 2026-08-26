import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import {
    BiliLiveMonitorToInfo,
    biliLiveStore,
} from '../store/bili-live.store';
import { sendReplyByToInfo } from '../handlers/message.handler';

/**
 * Bilibili 直播变化监听器
 */
class BiliLiveStoreService {
    constructor() {}

    /**
     * 添加直播间推送
     */
    async add(roomId: number, toInfo: BiliLiveMonitorToInfo) {
        try {
            const isAdded = biliLiveStore.add(roomId, toInfo);
            const message = isAdded
                ? `直播间信息添加完成, 开始监听: ${roomId}`
                : `直播间信息存在, 请勿重复添加: ${roomId}`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            const errorMessage = `直播间添加失败: ${roomId}`;
            pluginState.ctx.logger.error(errorMessage);
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
    async remove(roomId: number, toInfo: BiliLiveMonitorToInfo) {
        try {
            const isRemoved = biliLiveStore.remove(roomId, toInfo);
            const message = isRemoved
                ? `直播间信息删除完毕, 已停止监听: ${roomId}`
                : `不存在该直播间的监听信息: ${roomId}`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            const errorMessage = `直播间监听移除失败: ${roomId}`;
            pluginState.ctx.logger.error(errorMessage);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                errorMessage,
            );
        }
    }
}

export const biliLiveStoreService = new BiliLiveStoreService();
