/**
 * 动态运行时快照服务
 *
 * 动态运行时快照 (已推送动态 id 缓存) 与动态监听配置分属两个存储,
 * 两者之间不得互相 import —— 孤立数据清理与删除级联在这里编排,
 * 由服务层负责 store 之间的对话。
 */

import { pluginState } from '../../core/state';
import { BiliDynMonitorStore } from '../../store/biliDynMonitor.store';
import { BiliDynRuntimeStore } from '../../store/biliDynRuntime.store';

/** 惰性获取监听存储 (避免模块加载期触达未初始化的 pluginState.ctx) */
let _monitorStore: BiliDynMonitorStore | null = null;
function monitorStore(): BiliDynMonitorStore {
    if (!_monitorStore) {
        _monitorStore = BiliDynMonitorStore.getInstance();
    }
    return _monitorStore;
}

/** 惰性获取运行时存储 */
let _runtimeStore: BiliDynRuntimeStore | null = null;
function runtimeStore(): BiliDynRuntimeStore {
    if (!_runtimeStore) {
        _runtimeStore = BiliDynRuntimeStore.getInstance();
    }
    return _runtimeStore;
}

/**
 * 初始化动态运行时: 清理已不在动态监听中的孤立 uid
 *
 * 必须在两个 store 都已实例化之后、动态轮询启动之前调用一次。
 * 只做内存清理, 不落盘 (孤立项在下次真正写入时自然消失)。
 * @returns 被清理的 uid 列表
 */
export function initDynRuntime(): string[] {
    const validUids = new Set(
        monitorStore()
            .get()
            .map((monitor) => monitor.uid),
    );
    const pruned = runtimeStore().pruneOrphans((uid) =>
        validUids.has(uid),
    );
    if (pruned.length > 0) {
        pluginState.logger.warn(
            `动态运行时存在 ${pruned.length} 条孤立记录, 已从内存清理 (未落盘): ${pruned.join(', ')}`,
        );
    }
    return pruned;
}

/** 获取某 uid 的已缓存动态 id (返回副本, 可安全作为本轮请求前快照) */
export function getDynCachedIds(uid: string): string[] {
    return runtimeStore().getCachedIds(uid);
}

/**
 * 批量记录已缓存的动态 id (去重 + FIFO 上限 100, 立即落盘)
 * @returns 是否有新增
 */
export function addDynCachedIds(uid: string, ids: string[]): boolean {
    return runtimeStore().addCachedIds(uid, ids);
}

/** 删除某 uid 的动态运行时快照 (动态监听整条删除时调用) */
export function removeDynRuntime(uid: string): void {
    runtimeStore().removeRuntime(uid);
}
