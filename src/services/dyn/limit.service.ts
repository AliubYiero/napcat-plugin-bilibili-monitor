/**
 * 动态监听上限服务
 *
 * 与 limit.service 同范式, 独立存储 (默认值不同):
 * 群聊默认 1, 私聊默认 0; 超级管理员本人的私聊无上限。
 */

import { pluginState } from '../../core/state';
import { isSuperAdmin } from '../../core/admin';
import type { BiliDynamicMonitorToInfo } from '../../store/biliDynamic.store';
import { BiliDynLimitStore } from '../../store/biliDynLimit.store';

/** 上限允许设置的最小值 (0 表示禁止新增订阅) */
export const MIN_LIMIT = 0;
/** 上限允许设置的最大值 */
export const MAX_LIMIT = 50;
/** 私聊默认动态监听上限 */
export const DEFAULT_PRIVATE_LIMIT = 0;
/** 群聊默认动态监听上限 */
export const DEFAULT_GROUP_LIMIT = 1;

/**
 * 获取指定会话的动态监听上限
 * - 超级管理员本人的私聊无上限 (返回 Infinity)
 * - 其余会话优先取自定义上限, 未设置时取默认上限
 */
export function getDynLimit(
    toInfo: BiliDynamicMonitorToInfo,
): number {
    if (toInfo.type === 'private' && isSuperAdmin(toInfo.id)) {
        return Infinity;
    }
    return (
        BiliDynLimitStore.getInstance().find(toInfo.id, toInfo.type)
            ?.max ??
        (toInfo.type === 'group'
            ? DEFAULT_GROUP_LIMIT
            : DEFAULT_PRIVATE_LIMIT)
    );
}

/**
 * 判断动态订阅是否达到上限
 */
export function isDynLimitReached(
    toInfo: BiliDynamicMonitorToInfo,
    currentCount: number,
): boolean {
    return currentCount >= getDynLimit(toInfo);
}

/**
 * 设置指定会话的动态监听上限 (0~50, 由调用方保证范围合法)
 */
export function setDynLimit(
    id: string,
    type: 'private' | 'group',
    max: number,
): void {
    BiliDynLimitStore.getInstance().set(id, type, max);
}
