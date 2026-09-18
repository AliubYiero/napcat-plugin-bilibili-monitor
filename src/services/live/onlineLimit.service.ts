/**
 * 同接监听上限服务
 *
 * 与直播监听上限（limit.service.ts）同构, 同存于 bilibiliLimits.json 的
 * `online` kind：每个会话可设置自定义同接监听上限, 未设置时使用默认值
 * （群 1 / 私 0）；超级管理员本人的私聊无上限。
 */

import { isSuperAdmin } from '../../core/admin';
import type { BiliLiveMonitorToInfo } from '../../store/biliLiveMonitor.store';
import { BiliLimitStore } from '../../store/biliLimit.store';

/** 同接监听上限允许设置的最小值（0 表示禁止新增订阅） */
export const MIN_ONLINE_LIMIT = 0;
/** 同接监听上限允许设置的最大值 */
export const MAX_ONLINE_LIMIT = 50;
/** 私聊默认同接监听上限（默认不可用，需超管提额） */
export const DEFAULT_PRIVATE_ONLINE_LIMIT = 0;
/** 群聊默认同接监听上限 */
export const DEFAULT_GROUP_ONLINE_LIMIT = 1;

/** 供上限查看指令展示的单条自定义上限 */
export interface OnlineLimitEntry {
    id: string;
    type: 'private' | 'group';
    max: number;
}

/**
 * 获取指定会话的同接监听上限
 * - 超级管理员本人的私聊无上限（返回 Infinity）
 * - 其余会话优先取显式设置值, 未设置时取默认上限
 */
export function getOnlineLimit(
    toInfo: BiliLiveMonitorToInfo,
): number {
    if (toInfo.type === 'private' && isSuperAdmin(toInfo.id)) {
        return Infinity;
    }
    const explicit = BiliLimitStore.getInstance().getLimit(
        toInfo.id,
        toInfo.type,
        'online',
    );
    return (
        explicit ??
        (toInfo.type === 'group'
            ? DEFAULT_GROUP_ONLINE_LIMIT
            : DEFAULT_PRIVATE_ONLINE_LIMIT)
    );
}

/**
 * 判断同接监听是否达到上限（用于 online add 前校验）
 */
export function isOnlineLimitReached(
    toInfo: BiliLiveMonitorToInfo,
    currentCount: number,
): boolean {
    return currentCount >= getOnlineLimit(toInfo);
}

/**
 * 设置指定会话的同接监听上限（0~50, 由调用方保证范围合法）
 * 显式写入, 即使值等于当前全局默认。
 */
export function setOnlineLimit(
    id: string,
    type: 'private' | 'group',
    max: number,
): void {
    BiliLimitStore.getInstance().setLimit(id, type, 'online', max);
}

/** 列出显式设置过同接上限的会话 (供上限查看指令展示) */
export function listOnlineLimits(): OnlineLimitEntry[] {
    return BiliLimitStore.getInstance()
        .getAll()
        .filter((item) => typeof item.limits.online === 'number')
        .map((item) => ({
            id: item.id,
            type: item.type,
            max: item.limits.online as number,
        }));
}
