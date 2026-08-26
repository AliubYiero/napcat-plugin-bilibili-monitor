import { pluginState } from '../core/state';
import {
    type BiliLiveMonitor,
    type BiliLiveMonitorToInfo,
    BiliLiveStore,
} from '../store/bili-live.store';
import { sendReplyByToInfo } from '../handlers/message.handler';
import { api_getStatusInfoByUids } from '../api/api_getStatusInfoByUids';

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

    /**
     * 添加直播间推送
     */
    async add(uid: string, toInfo: BiliLiveMonitorToInfo) {
        try {
            // 检查 UID 是否已存在在存储中
            const hasUid = this.biliLiveStore.has(uid, toInfo);
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

            this.biliLiveStore.add(uid, liveInfo.uname, toInfo);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                `已开始监听主播「${liveInfo.uname}」(${uid})`,
            );
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
}

export const biliLiveStoreService = new BiliLiveStoreService();
