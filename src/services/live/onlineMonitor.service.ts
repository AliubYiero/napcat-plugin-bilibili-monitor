/**
 * 同接监听管理服务
 *
 * 同接监听是直播状态监听的附属功能：
 * - online add 前置校验：该主播必须在当前会话的直播监听列表中
 * - 上限校验：当前会话同接监听数未达上限（默认群 1 / 私 0）
 * - 级联语义：直播监听 remove 时级联移除同接监听（由 store 的 remove 完成）
 */

import { pluginState } from '../../core/state';
import {
    type BiliLiveMonitor,
    type BiliLiveMonitorToInfo,
    BiliLiveMonitorStore,
} from '../../store/biliLiveMonitor.store';
import { sendReplyByToInfo } from '../../handlers/utils';
import { biliLiveStoreService } from './store.service';
import {
    getOnlineLimit,
    isOnlineLimitReached,
} from './onlineLimit.service';

class BiliOnlineMonitorService {
    private _store: BiliLiveMonitorStore | null = null;

    private get store(): BiliLiveMonitorStore {
        if (!this._store) {
            this._store = BiliLiveMonitorStore.getInstance();
        }
        return this._store;
    }

    /** 指定会话的同接监听列表 */
    list(toInfo: BiliLiveMonitorToInfo): BiliLiveMonitor[] {
        return this.store.listForOnlineTarget(toInfo);
    }

    /** 添加同接监听（含直播监听前置与上限校验），并回复结果 */
    async add(uid: string, toInfo: BiliLiveMonitorToInfo) {
        try {
            // 前置：必须先开启该主播的直播状态监听
            if (!biliLiveStoreService.hasInLiveMonitor(uid, toInfo)) {
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `主播 ${uid} 未开启直播状态监听, 请先使用 #bili live add <主播uid> 添加`,
                );
                return;
            }

            // 重复添加检查
            if (this.store.hasOnlineForTarget(uid, toInfo)) {
                const uname = this.getUname(uid);
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    `主播「${uname || uid}」(${uid}) 已开启同接监听, 请勿重复添加`,
                );
                return;
            }

            // 上限校验
            const current = this.list(toInfo).length;
            if (isOnlineLimitReached(toInfo, current)) {
                const limit = getOnlineLimit(toInfo);
                const message =
                    toInfo.type === 'private'
                        ? `私聊同接监听上限为 ${limit}, 当前已达上限 (${current}/${limit}), 请联系机器人管理员提额`
                        : `当前群同接监听数已达上限 (${current}/${limit}), 请联系机器人管理员提额`;
                await sendReplyByToInfo(
                    pluginState.ctx,
                    toInfo,
                    message,
                );
                return;
            }

            const uname = this.getUname(uid);
            this.store.addOnline(uid, toInfo);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                `已开启主播「${uname || uid}」(${uid}) 的同接监听`,
            );
        } catch (e) {
            const errorMessage = `主播 ${uid} 开启同接监听失败`;
            pluginState.ctx.logger.error(errorMessage, e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                errorMessage,
            );
        }
    }

    /** 移除同接监听，并回复结果 */
    async remove(uid: string, toInfo: BiliLiveMonitorToInfo) {
        try {
            const uname = this.getUname(uid);
            const removed = this.store.removeOnline(uid, toInfo);
            const message = removed
                ? `已关闭主播「${uname || uid}」(${uid}) 的同接监听`
                : `主播「${uname || uid}」(${uid}) 未开启同接监听, 移除失败`;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (e) {
            const errorMessage = `主播 ${uid} 移除同接监听失败`;
            pluginState.ctx.logger.error(errorMessage, e);
            await sendReplyByToInfo(
                pluginState.ctx,
                toInfo,
                errorMessage,
            );
        }
    }

    /** 查询主播名称 (直播与同接同存于一条记录) */
    private getUname(uid: string): string {
        return this.store.getByUid(uid)?.uname ?? '';
    }
}

export const biliOnlineMonitorService =
    new BiliOnlineMonitorService();
