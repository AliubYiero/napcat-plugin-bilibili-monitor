/**
 * 直播监听上限服务
 *
 * 每个会话可设置自定义监听上限（持久化到 bilibiliLiveLimits.json），
 * 未设置时使用默认值；超级管理员本人的私聊无上限。
 */

import { pluginState } from '../core/state';
import { isSuperAdmin } from '../core/admin';
import type { BiliLiveMonitorToInfo } from '../store/bili-live.store';
import { BiliLiveLimitStore } from '../store/bili-live-limit.store';

/** 监听上限允许设置的最小值（0 表示禁止新增订阅） */
export const MIN_LIMIT = 0;
/** 监听上限允许设置的最大值 */
export const MAX_LIMIT = 50;
/** 私聊默认监听上限 */
export const DEFAULT_PRIVATE_LIMIT = 1;
/** 群聊默认监听上限 */
export const DEFAULT_GROUP_LIMIT = 5;

/**
 * 获取指定会话的监听上限
 * - 超级管理员本人的私聊无上限（返回 Infinity）
 * - 其余会话优先取自定义上限, 未设置时取默认上限
 */
export function getLiveLimit(toInfo: BiliLiveMonitorToInfo): number {
    if (toInfo.type === 'private' && isSuperAdmin(toInfo.id)) {
        return Infinity;
    }
    return (
        BiliLiveLimitStore.getInstance().find(toInfo.id, toInfo.type)
            ?.max ??
        (toInfo.type === 'group'
            ? DEFAULT_GROUP_LIMIT
            : DEFAULT_PRIVATE_LIMIT)
    );
}

/**
 * 判断订阅是否达到上限（用于 live add 前校验）
 */
export function isLiveLimitReached(
    toInfo: BiliLiveMonitorToInfo,
    currentCount: number,
): boolean {
    return currentCount >= getLiveLimit(toInfo);
}

/**
 * 设置指定会话的监听上限（0~50, 由调用方保证范围合法）
 */
export function setLiveLimit(
    id: string,
    type: 'private' | 'group',
    max: number,
): void {
    BiliLiveLimitStore.getInstance().set(id, type, max);
}
