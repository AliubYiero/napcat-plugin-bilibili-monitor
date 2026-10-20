import type {
    LimitSessionView,
    LimitsView,
    LiveMonitorView,
    PollHealthView,
} from 'shared';
import { describe, expect, it } from 'vitest';
import {
    buildOnlinePolyline,
    describeLogin,
    describePoll,
    describeRender,
    effectiveLimit,
    filterLiveRows,
    formatDateTime,
    formatRelative,
    formatUptime,
    limitText,
    liveStatusLabel,
    sessionKey,
    sessionName,
} from '../../src/utils/monitorView';

const poll = (
    patch: Partial<PollHealthView> = {},
): PollHealthView => ({
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    nextRunAt: null,
    lastError: null,
    idle: false,
    skippedNotLoggedIn: false,
    ...patch,
});

describe('会话展示', () => {
    it('优先使用会话名, 缺失时回落类型与 ID', () => {
        const sessions = [
            {
                id: '1',
                type: 'group' as const,
                name: '测试群',
                enabled: true,
            },
        ];
        expect(sessionName(sessions, 'group', '1')).toBe('测试群');
        expect(sessionName(sessions, 'private', '2')).toBe('私聊 2');
        expect(sessionKey('group', '1')).toBe('group:1');
    });
});

describe('时间格式化', () => {
    it('空值与运行时长', () => {
        expect(formatDateTime(null)).toBe('—');
        expect(formatUptime(0)).toBe('0 分钟');
        expect(formatUptime(3_660_000)).toBe('1 小时 1 分');
        expect(formatUptime(90_061_000)).toBe('1 天 1 小时');
    });

    it('相对时间按区间切换单位', () => {
        const now = 1_000_000_000;
        expect(formatRelative(null, now)).toBe('—');
        expect(formatRelative(now - 3_000, now)).toBe('刚刚');
        expect(formatRelative(now - 30_000, now)).toBe('30 秒前');
        expect(formatRelative(now - 120_000, now)).toBe('2 分钟前');
        expect(formatRelative(now - 7_200_000, now)).toBe('2 小时前');
    });

    it('直播状态文案', () => {
        expect(liveStatusLabel('streaming')).toBe('直播中');
        expect(liveStatusLabel('offline')).toBe('未开播');
    });
});

describe('健康视图', () => {
    it('轮询按空闲/跳过/异常/正常优先级展示', () => {
        expect(describePoll('dyn', poll({ idle: true })).label).toBe(
            '空闲（无监听）',
        );
        expect(
            describePoll('dyn', poll({ skippedNotLoggedIn: true }))
                .label,
        ).toBe('跳过（未登录）');
        expect(
            describePoll('live', poll({ lastError: '失败' })).tone,
        ).toBe('error');
        expect(
            describePoll('live', poll({ lastSuccessAt: Date.now() }))
                .tone,
        ).toBe('ok');
    });

    it('登录态与渲染服务', () => {
        expect(describeLogin(false, false).label).toBe('未登录');
        expect(describeLogin(true, true).label).toBe('Cookie 已失效');
        expect(describeLogin(true, false, '测试').detail).toContain(
            '测试',
        );

        expect(
            describeRender({
                probedAt: null,
                available: null,
                message: null,
            }).label,
        ).toBe('未探测');
        expect(
            describeRender({
                probedAt: Date.now(),
                available: false,
                message: '超时',
            }).label,
        ).toBe('不可用');
    });
});

describe('上限与图表', () => {
    const session: LimitSessionView = {
        type: 'group',
        id: '1',
        used: { live: 1, online: 0, dyn: 0 },
        limits: { live: 3 },
        unlimited: false,
    };
    const limits: LimitsView = {
        meta: {
            min: 0,
            max: 50,
            defaults: {
                live: { group: 5, private: 1 },
                online: { group: 1, private: 0 },
                dyn: { group: 1, private: 0 },
            },
        },
        sessions: [session],
    };

    it('显式上限优先, 缺省回落默认, 无上限显示 ∞', () => {
        expect(
            effectiveLimit(session, 'live', limits.meta.defaults),
        ).toBe(3);
        expect(
            effectiveLimit(session, 'online', limits.meta.defaults),
        ).toBe(1);
        expect(limitText(null)).toBe('∞');
        expect(
            effectiveLimit(
                { ...session, unlimited: true },
                'live',
                limits.meta.defaults,
            ),
        ).toBeNull();
    });

    it('少于两个采样点不生成折线', () => {
        expect(buildOnlinePolyline([], 100, 50)).toBe('');
        expect(buildOnlinePolyline([[10, 100]], 100, 50)).toBe('');
        const points = buildOnlinePolyline(
            [
                [10, 100],
                [20, 200],
            ],
            100,
            50,
        );
        expect(points.split(' ')).toHaveLength(2);
    });
});

describe('直播筛选', () => {
    const row = (
        uid: string,
        status: 'streaming' | 'offline',
        target: { type: 'group' | 'private'; id: string },
    ): LiveMonitorView => ({
        uid,
        uname: `主播${uid}`,
        avatar: '',
        status,
        title: `标题${uid}`,
        parentAreaName: '',
        areaName: '',
        liveTime: 0,
        durationSec: 0,
        onlineCurrent: null,
        onlinePeak: null,
        targets: [
            {
                ...target,
                mentionCount: 0,
                onlineEnabled: false,
            },
        ],
        liveContents: [],
        onlineSnapshots: [],
    });

    const rows = [
        row('1', 'streaming', { type: 'group', id: '100' }),
        row('2', 'offline', { type: 'private', id: '200' }),
    ];

    it('按状态、会话与关键词组合筛选', () => {
        expect(
            filterLiveRows(rows, {
                search: '',
                status: 'streaming',
                session: '',
            }),
        ).toHaveLength(1);
        expect(
            filterLiveRows(rows, {
                search: '',
                status: 'all',
                session: 'private:200',
            })[0].uid,
        ).toBe('2');
        expect(
            filterLiveRows(rows, {
                search: '标题2',
                status: 'all',
                session: '',
            })[0].uid,
        ).toBe('2');
        expect(
            filterLiveRows(rows, {
                search: '不存在',
                status: 'all',
                session: '',
            }),
        ).toHaveLength(0);
    });
});
