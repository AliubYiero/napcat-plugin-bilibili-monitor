import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthSnapshot } from '../../src/services/health/healthSnapshot';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('HealthSnapshot 轮询状态', () => {
    it('开始一轮时记录运行态并清空空闲/跳过标记', () => {
        const snapshot = new HealthSnapshot();
        snapshot.markIdle('dyn');
        snapshot.markSkipped('dyn');

        snapshot.beginPoll('dyn');

        const health = snapshot.getPollHealth('dyn');
        expect(health.running).toBe(true);
        expect(health.idle).toBe(false);
        expect(health.skippedNotLoggedIn).toBe(false);
        expect(health.lastRunAt).not.toBeNull();
    });

    it('完成一轮记录成功时间并保留非致命错误', () => {
        const snapshot = new HealthSnapshot();
        snapshot.beginPoll('live');
        snapshot.completePoll('live', '批次 2 失败');

        const health = snapshot.getPollHealth('live');
        expect(health.running).toBe(false);
        expect(health.lastSuccessAt).not.toBeNull();
        expect(health.lastError).toBe('批次 2 失败');
    });

    it('异常轮询记录错误且不算成功', () => {
        const snapshot = new HealthSnapshot();
        snapshot.beginPoll('live');
        snapshot.failPoll('live', new Error('网络错误'));

        const health = snapshot.getPollHealth('live');
        expect(health.running).toBe(false);
        expect(health.lastSuccessAt).toBeNull();
        expect(health.lastError).toBe('网络错误');
    });

    it('下次执行时间可写入并在停止时清空', () => {
        const snapshot = new HealthSnapshot();
        snapshot.setNextPoll('live', 123);
        expect(snapshot.getPollHealth('live').nextRunAt).toBe(123);

        snapshot.stopPoll('live');
        expect(snapshot.getPollHealth('live').nextRunAt).toBeNull();
    });
});

describe('HealthSnapshot 动态逐主播', () => {
    it('记录检查、成功与失败', () => {
        const snapshot = new HealthSnapshot();
        snapshot.beginDynUidCheck('1');
        snapshot.failDynUid('1', '接口异常');

        expect(snapshot.getDynUidHealth('1')).toMatchObject({
            lastError: '接口异常',
            lastSuccessAt: null,
        });

        snapshot.successDynUid('1');
        expect(snapshot.getDynUidHealth('1').lastError).toBeNull();
        expect(
            snapshot.getDynUidHealth('1').lastSuccessAt,
        ).not.toBeNull();
    });

    it('未知 uid 返回空健康视图', () => {
        const snapshot = new HealthSnapshot();
        expect(snapshot.getDynUidHealth('404')).toEqual({
            lastCheckAt: null,
            lastSuccessAt: null,
            lastError: null,
        });
    });
});

describe('HealthSnapshot 渲染探测', () => {
    it('成功探测后缓存结果, 不重复请求', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({
                code: 0,
                data: { imageBase64: 'x', format: 'png' },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const snapshot = new HealthSnapshot();
        const first = await snapshot.probeRender();
        const second = await snapshot.probeRender();

        expect(first.available).toBe(true);
        expect(second.available).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('探测异常时标记不可用并返回原因', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('连接失败')),
        );

        const snapshot = new HealthSnapshot();
        const result = await snapshot.probeRender(true);

        expect(result.available).toBe(false);
        expect(result.message).toBe('连接失败');
        expect(result.probedAt).not.toBeNull();
    });
});

describe('HealthSnapshot 重置', () => {
    it('清空轮询、逐主播与渲染状态', () => {
        const snapshot = new HealthSnapshot();
        snapshot.beginPoll('live');
        snapshot.beginDynUidCheck('1');
        snapshot.reset();

        expect(snapshot.getPollHealth('live').running).toBe(false);
        expect(snapshot.getPollHealth('live').lastRunAt).toBeNull();
        expect(snapshot.getDynUidHealth('1').lastCheckAt).toBeNull();
        expect(snapshot.getRenderHealth()).toEqual({
            probedAt: null,
            available: null,
            message: null,
        });
    });
});
