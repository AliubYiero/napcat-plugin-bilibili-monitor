/**
 * 动态监听上限服务
 *
 * 与 limit.service 同范式, 同存于 bilibiliLimits.json 的 `dyn` kind
 * (默认值不同): 群聊默认 1, 私聊默认 0；超级管理员本人的私聊无上限。
 */

import { isSuperAdmin } from '../../core/admin';
import type { BiliDynamicMonitorToInfo } from '../../store/biliDynMonitor.store';
import { BiliLimitStore } from '../../store/biliLimit.store';

/** 上限允许设置的最小值 (0 表示禁止新增订阅) */
export const MIN_LIMIT = 0;
/** 上限允许设置的最大值 */
export const MAX_LIMIT = 50;
/** 私聊默认动态监听上限 */
export const DEFAULT_PRIVATE_LIMIT = 0;
/** 群聊默认动态监听上限 */
export const DEFAULT_GROUP_LIMIT = 1;

/** 供上限查看指令展示的单条自定义上限 */
export interface DynLimitEntry {
    id: string;
    type: 'private' | 'group';
    max: number;
}

/**
 * 获取指定会话的动态监听上限
 * - 超级管理员本人的私聊无上限 (返回 Infinity)
 * - 其余会话优先取显式设置值, 未设置时取默认上限
 */
export function getDynLimit(
    toInfo: BiliDynamicMonitorToInfo,
): number {
    if (toInfo.type === 'private' && isSuperAdmin(toInfo.id)) {
        return Infinity;
    }
    const explicit = BiliLimitStore.getInstance().getLimit(
        toInfo.id,
        toInfo.type,
        'dyn',
    );
    return (
        explicit ??
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
 * 显式写入, 即使值等于当前全局默认。
 */
export function setDynLimit(
    id: string,
    type: 'private' | 'group',
    max: number,
): void {
    BiliLimitStore.getInstance().setLimit(id, type, 'dyn', max);
}

/** 列出显式设置过动态上限的会话 (供上限查看指令展示) */
export function listDynLimits(): DynLimitEntry[] {
    return BiliLimitStore.getInstance()
        .getAll()
        .filter((item) => typeof item.limits.dyn === 'number')
        .map((item) => ({
            id: item.id,
            type: item.type,
            max: item.limits.dyn as number,
        }));
}
