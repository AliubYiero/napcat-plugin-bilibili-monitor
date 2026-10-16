/**
 * 平均同接数纯函数测试
 *
 * calcAverageOnline 是纯函数: 快照序列 + 区间 + 首尾剪切窗口进,
 * 平均同接数或 null 出。这里断言的是「推送卡片最终显示的数字」口径,
 * 不检查内部实现。
 *
 * 领域规则来源: CONTEXT.md 的「同接数」「同接快照」。
 * - 时间加权: 相邻点间隔作为权重 (末点权重退化为 1)
 * - 区间 = [start + trimStart, end - trimEnd], 边界点含入
 * - 仅 1 点直接取值; 0 点或剪切后无点返回 null
 */
import { describe, expect, it } from 'vitest';
import { calcAverageOnline } from '../../../src/services/live/onlineSnapshots.service';
import type { BiliOnlineSnapshot } from '../../../src/store/biliLiveRoom.store';

/** 造快照序列: [同接数, 时间戳] */
function snapshots(
    ...pairs: [number, number][]
): BiliOnlineSnapshot[] {
    return pairs;
}

describe('calcAverageOnline 基础行为', () => {
    it('无快照返回 null', () => {
        expect(calcAverageOnline([], 0, 100)).toBeNull();
    });

    it('区间内仅 1 点直接取该值', () => {
        const s = snapshots([300, 50]);
        expect(calcAverageOnline(s, 0, 100)).toBe(300);
    });

    it('按相邻点间隔加权 (末点权重退化为 1)', () => {
        const s = snapshots([100, 0], [200, 10]);
        // (100*10 + 200*1) / 11 = 109.09 → 109
        expect(calcAverageOnline(s, 0, 10)).toBe(109);
    });
});

describe('calcAverageOnline 首尾剪切', () => {
    it('trimStart 丢弃区间头部之前的点', () => {
        const s = snapshots([999, 0], [100, 60], [200, 70]);
        // 仅保留 ts ∈ [50, 70]
        expect(calcAverageOnline(s, 0, 70, 50)).toBe(109);
    });

    it('trimEnd 丢弃区间尾部之后的点', () => {
        const s = snapshots([100, 0], [200, 10], [999, 100]);
        // 仅保留 ts ∈ [0, 50]
        expect(calcAverageOnline(s, 0, 100, 0, 50)).toBe(109);
    });

    it('同时剪切首尾', () => {
        const s = snapshots(
            [999, 0],
            [100, 60],
            [200, 70],
            [999, 999],
        );
        // 仅保留 ts ∈ [50, 80]
        expect(calcAverageOnline(s, 0, 100, 50, 20)).toBe(109);
    });

    it('剪切后无点返回 null', () => {
        const s = snapshots([1, 0], [2, 10]);
        expect(calcAverageOnline(s, 0, 10, 100)).toBeNull();
    });

    it('剪切导致区间倒置返回 null', () => {
        const s = snapshots([1, 0], [2, 10]);
        expect(calcAverageOnline(s, 0, 10, 20)).toBeNull();
    });
});

describe('calcAverageOnline 区间边界', () => {
    it('左右边界点均含入', () => {
        const s = snapshots([5, 100], [7, 150], [9, 200]);
        // [0, 200]: 5*50 + 7*50 + 9*1 = 609 / 101 = 6.03 → 6
        expect(calcAverageOnline(s, 0, 200)).toBe(6);
    });

    it('trimEnd 后 end - trimEnd 边界点含入, 其后排除', () => {
        const s = snapshots([5, 100], [7, 150], [9, 200]);
        // [0, 150]: 5*50 + 7*1 = 257 / 51 = 5.04 → 5
        expect(calcAverageOnline(s, 0, 200, 0, 50)).toBe(5);
    });
});
