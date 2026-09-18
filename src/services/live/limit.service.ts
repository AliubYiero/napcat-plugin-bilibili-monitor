/**
 * 直播监听上限服务
 *
 * 每个会话可设置自定义监听上限 (与其他 kind 同存于 bilibiliLimits.json),
 * 未设置时使用默认值；超级管理员本人的私聊无上限。
 *
 * 上限的读值统一经此处的 getLiveLimit: 显式值 (含 0) 优先, 否则回落
 * 全局默认。各调用点不得自行回落。
 */

import { isSuperAdmin } from '../../core/admin';
import type { BiliLiveMonitorToInfo } from '../../store/biliLiveMonitor.store';
import { BiliLimitStore } from '../../store/biliLimit.store';

/** 监听上限允许设置的最小值（0 表示禁止新增订阅） */
export const MIN_LIMIT = 0;
/** 监听上限允许设置的最大值 */
export const MAX_LIMIT = 50;
/** 私聊默认监听上限 */
export const DEFAULT_PRIVATE_LIMIT = 1;
/** 群聊默认监听上限 */
export const DEFAULT_GROUP_LIMIT = 5;

/** 供上限查看指令展示的单条自定义上限 */
export interface LiveLimitEntry {
    id: string;
    type: 'private' | 'group';
    max: number;
}

/**
 * 获取指定会话的监听上限
 * - 超级管理员本人的私聊无上限（返回 Infinity）
 * - 其余会话优先取显式设置值, 未设置时取默认上限
 */
export function getLiveLimit(toInfo: BiliLiveMonitorToInfo): number {
    if (toInfo.type === 'private' && isSuperAdmin(toInfo.id)) {
        return Infinity;
    }
    const explicit = BiliLimitStore.getInstance().getLimit(
        toInfo.id,
        toInfo.type,
        'live',
    );
    return (
        explicit ??
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
 * 显式写入, 即使值等于当前全局默认。
 */
export function setLiveLimit(
    id: string,
    type: 'private' | 'group',
    max: number,
): void {
    BiliLimitStore.getInstance().setLimit(id, type, 'live', max);
}

/** 列出显式设置过直播上限的会话 (供上限查看指令展示) */
export function listLiveLimits(): LiveLimitEntry[] {
    return BiliLimitStore.getInstance()
        .getAll()
        .filter((item) => typeof item.limits.live === 'number')
        .map((item) => ({
            id: item.id,
            type: item.type,
            max: item.limits.live as number,
        }));
}
