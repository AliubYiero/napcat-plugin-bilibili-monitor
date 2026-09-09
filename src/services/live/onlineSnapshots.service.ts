/**
 * 同接数快照服务
 *
 * 职责：
 * 1. 采集调度：开播事件立即抓首点；每轮直播轮询后对"开播且开启同接监听"
 *    的主播串行采集，相邻请求间隔 500ms（跟随轮询节拍，无独立定时器）
 * 2. 快照写入房间存储（[同接数, 秒级时间戳]，失败静默跳过并 warn）
 * 3. 导出平均同接数纯函数：时间加权、单点取值、区间端点容差、可选剪切开头
 */

import { pluginState } from '../../core/state';
import {
    BiliLiveRoomStore,
    type BiliOnlineSnapshot,
} from '../../store/biliLiveRoom.store';
import { BiliOnlineMonitorStore } from '../../store/biliOnlineMonitor.store';
import { api_getOnlineGoldRank } from '../../api/getOnlineGoldRank';

/** 相邻同接采集请求的间隔（毫秒） */
const SNAPSHOT_REQUEST_INTERVAL_MS = 500;

/** 快照纳入区间的端点容差（秒）：把紧贴区间边界的快照点算进去 */
export const SNAPSHOT_INTERVAL_TOLERANCE_SEC = 300;

/**
 * 计算区间内平均同接数（时间加权）
 *
 * - 快照纳入规则：时间戳 ∈ [start, end + tolerance]
 * - 区间内仅 1 点时直接取该值；0 点（或剪切后无点）返回 null（不显示）
 * - trimStartSec > 0 时丢弃时间戳 < start + trimStartSec 的点（剪切直播
 *   开头的预热期），剪切在计算时进行，不影响快照存储
 *
 * @param toleranceSec 端点容差（秒），通常取采集节拍间隔
 */
export function calcAverageOnline(
    snapshots: BiliOnlineSnapshot[],
    start: number,
    end: number,
    toleranceSec: number,
    trimStartSec = 0,
): number | null {
    if (!Array.isArray(snapshots) || snapshots.length === 0)
        return null;

    const effectiveStart = start + trimStartSec;
    const points = snapshots.filter(
        ([, ts]) => ts >= effectiveStart && ts <= end + toleranceSec,
    );
    if (points.length === 0) return null;

    if (points.length === 1) return points[0][0];

    // 时间加权平均：相邻点间隔作为权重，首点权重与其到下一点的间隔一致
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < points.length; i++) {
        const [value, ts] = points[i];
        const nextTs = points[i + 1]?.[1] ?? ts;
        const weight = Math.max(1, nextTs - ts);
        weightedSum += value * weight;
        totalWeight += weight;
    }
    return Math.round(weightedSum / totalWeight);
}

/** 同接快照采集服务（单例，惰性初始化以规避模块加载期 ctx 未就绪） */
export class BiliOnlineSnapshotService {
    private static instance: BiliOnlineSnapshotService | null = null;
    private _roomStore: BiliLiveRoomStore | null = null;
    private _monitorStore: BiliOnlineMonitorStore | null = null;

    private get roomStore(): BiliLiveRoomStore {
        if (!this._roomStore) {
            this._roomStore = BiliLiveRoomStore.getInstance();
        }
        return this._roomStore;
    }

    private get monitorStore(): BiliOnlineMonitorStore {
        if (!this._monitorStore) {
            this._monitorStore = BiliOnlineMonitorStore.getInstance();
        }
        return this._monitorStore;
    }

    static getInstance(): BiliOnlineSnapshotService {
        if (!BiliOnlineSnapshotService.instance) {
            BiliOnlineSnapshotService.instance =
                new BiliOnlineSnapshotService();
        }
        return BiliOnlineSnapshotService.instance;
    }

    /**
     * 开播事件触发的首点采集：立即抓一次快照
     * 仅当该主播开启了同接监听时执行
     */
    async captureOnStart(uid: string): Promise<void> {
        if (!this.monitorStore.has(uid)) return;
        await this.captureOne(uid);
    }

    /**
     * 每轮直播轮询后调用的批量采集：
     * 对所有"正在直播且开启同接监听"的主播串行采集，请求间隔 500ms
     */
    async captureBatch(uids: string[]): Promise<void> {
        let isFirst = true;
        for (const uid of uids) {
            // 仅采集开播中的主播（下播不发请求）
            const room = this.roomStore.get(uid);
            if (!room || room.live_status !== 'streaming') continue;
            if (!this.monitorStore.has(uid)) continue;

            if (!isFirst) {
                await sleep(SNAPSHOT_REQUEST_INTERVAL_MS);
            }
            isFirst = false;
            await this.captureOne(uid);
        }
    }

    /** 采集单个主播的快照并写入存储，失败静默跳过 */
    private async captureOne(uid: string): Promise<void> {
        try {
            const room = this.roomStore.get(uid);
            if (!room || room.live_status !== 'streaming') return;

            const onlineNum = await api_getOnlineGoldRank(
                uid,
                room.room_id,
            );
            if (onlineNum === null) {
                pluginState.logger.warn(
                    `获取同接数失败, 本次快照跳过 (uid: ${uid})`,
                );
                return;
            }
            this.roomStore.appendOnlineSnapshot(uid, [
                onlineNum,
                Math.floor(Date.now() / 1000),
            ]);
        } catch (err) {
            pluginState.logger.warn(
                `同接数采集出错 (uid: ${uid}):`,
                err,
            );
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const onlineSnapshotService =
    BiliOnlineSnapshotService.getInstance();
