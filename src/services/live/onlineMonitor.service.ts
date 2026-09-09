/**
 * 同接监听管理服务
 *
 * 同接监听是直播状态监听的附属功能：
 * - online add 前置校验：该主播必须在当前会话的直播监听列表中
 * - 上限校验：当前会话同接监听数未达上限（默认群 1 / 私 0）
 * - 级联语义：直播监听 remove 时级联移除同接监听（由调用方触发）
 */

import { pluginState } from '../../core/state';
import type { BiliLiveMonitorToInfo } from '../../store/biliLive.store';
import { BiliOnlineMonitorStore } from '../../store/biliOnlineMonitor.store';
import { BiliLiveRoomStore } from '../../store/biliLiveRoom.store';
import { sendReplyByToInfo } from '../../handlers/utils';
import { biliLiveStoreService } from './store.service';
import {
    getOnlineLimit,
    isOnlineLimitReached,
} from './onlineLimit.service';

class BiliOnlineMonitorService {
    private _store: BiliOnlineMonitorStore | null = null;
    private _roomStore: BiliLiveRoomStore | null = null;

    private get store(): BiliOnlineMonitorStore {
        if (!this._store) {
            this._store = BiliOnlineMonitorStore.getInstance();
        }
        return this._store;
    }

    private get roomStore(): BiliLiveRoomStore {
        if (!this._roomStore) {
            this._roomStore = BiliLiveRoomStore.getInstance();
        }
        return this._roomStore;
    }

    /** 指定会话的同接监听列表 */
    list(toInfo: BiliLiveMonitorToInfo) {
        return this.store.listForTarget(toInfo);
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
            if (this.store.hasForTarget(uid, toInfo)) {
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
            this.store.add(uid, uname, toInfo);
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
            const removed = this.store.remove(uid, toInfo);
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

    /**
     * 直播监听移除时的级联移除（静默, 不单独回复）
     * @returns 是否发生了级联移除
     */
    cascadeRemoveIfPresent(
        uid: string,
        toInfo: BiliLiveMonitorToInfo,
    ): boolean {
        return this.store.remove(uid, toInfo);
    }

    /** 查询主播名称（同接记录优先, 其次直播监听记录） */
    private getUname(uid: string): string {
        const fromOnline = this.store
            .get()
            .find((m) => m.uid === uid)?.uname;
        if (fromOnline) return fromOnline;
        const monitor = biliLiveStoreService
            .listAll()
            .find((m) => m.uid === uid);
        return monitor?.uname ?? '';
    }
}

export const biliOnlineMonitorService =
    new BiliOnlineMonitorService();
