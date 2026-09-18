/**
 * buildMigrationPlan 旧数据迁移的纯函数部分
 *
 * 覆盖设计稿 §8 的全部映射规则: 合并、去重、清洗、丢弃、校验与备份命名。
 * 这里不碰 fs 与 pluginState —— 输入就是"文件名 → 已解析的旧内容"。
 */

import { describe, expect, it } from 'vitest';
import {
    LEGACY_FILES,
    MIGRATION_TARGETS,
    MigrationValidationError,
    TARGET_FILES,
    buildBackupName,
    buildMigrationPlan,
    formatStamp,
} from '../../src/store/migration/plan';

/** 固定的迁移时刻, 让备份名可断言 */
const NOW = new Date(2026, 8, 19, 14, 30, 5); // 2026-09-19 14:30:05 本地时间

/** 默认上下文: 无目标存在、无占用文件名 */
function ctx(overrides: Partial<Parameters<typeof buildMigrationPlan>[1]> = {}) {
    return {
        skipTargets: new Set<string>(),
        takenNames: new Set<string>(),
        now: NOW,
        ...overrides,
    };
}

/** 取出某个目标文件的写入内容 (不存在返回 undefined) */
function written(
    plan: ReturnType<typeof buildMigrationPlan>,
    name: string,
): unknown {
    return plan.writes.find((w) => w.name === name)?.data;
}

describe('迁移目标清单', () => {
    it('目标与源的关系固定', () => {
        expect(
            MIGRATION_TARGETS.map((t) => [t.name, t.sources]),
        ).toEqual([
            [
                'bilibiliLimits.json',
                [
                    'bilibiliLiveLimits.json',
                    'bilibiliLiveOnlineLimits.json',
                    'bilibiliDynLimits.json',
                ],
            ],
            [
                'bilibiliLiveMonitors.json',
                [
                    'bilibiliLiveData.json',
                    'bilibiliOnlineMonitors.json',
                ],
            ],
            ['bilibiliDynMonitors.json', ['bilibiliDynData.json']],
            ['bilibiliDynRuntimeData.json', ['bilibiliDynData.json']],
            ['bilibiliLiveRoomData.json', ['bilibiliLiveRoomData.json']],
        ]);
    });
});

describe('直播与同接监听合并', () => {
    it('同接目标并入 onlineTo, 直播目标保持 to', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
                [LEGACY_FILES.onlineMonitors]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
            },
            ctx(),
        );

        expect(written(plan, TARGET_FILES.liveMonitors)).toEqual({
            version: 1,
            data: [
                {
                    uid: '1',
                    uname: '主播A',
                    to: [{ id: '100', type: 'group' }],
                    onlineTo: [{ id: '100', type: 'group' }],
                },
            ],
        });
        expect(plan.summary.liveMonitors).toBe(1);
        expect(plan.summary.onlineMonitors).toBe(1);
    });

    it('mentionUsers 随直播目标保留, 空数组不落盘', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [
                            {
                                id: '100',
                                type: 'group',
                                mentionUsers: ['555'],
                            },
                            {
                                id: '200',
                                type: 'group',
                                mentionUsers: [],
                            },
                        ],
                    },
                ],
            },
            ctx(),
        );

        expect(
            (written(plan, TARGET_FILES.liveMonitors) as any).data[0]
                .to,
        ).toEqual([
            { id: '100', type: 'group', mentionUsers: ['555'] },
            { id: '200', type: 'group' },
        ]);
    });

    it('同接无对应直播监听时丢弃并警告', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.onlineMonitors]: [
                    {
                        uid: '9',
                        uname: '孤儿',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
            },
            ctx(),
        );

        expect(written(plan, TARGET_FILES.liveMonitors)).toEqual({
            version: 1,
            data: [],
        });
        expect(plan.summary.onlineDropped).toBe(1);
        expect(plan.warnings.join()).toContain('无对应直播监听');
    });

    it('uname 冲突以直播监听为准', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '直播名',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
                [LEGACY_FILES.onlineMonitors]: [
                    {
                        uid: '1',
                        uname: '同接名',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
            },
            ctx(),
        );

        expect(
            (written(plan, TARGET_FILES.liveMonitors) as any).data[0]
                .uname,
        ).toBe('直播名');
    });

    it('同一 uid 重复出现时 to 取并集', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                    },
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '200', type: 'group' }],
                    },
                ],
            },
            ctx(),
        );

        expect(
            (written(plan, TARGET_FILES.liveMonitors) as any).data,
        ).toEqual([
            {
                uid: '1',
                uname: '主播A',
                to: [
                    { id: '100', type: 'group' },
                    { id: '200', type: 'group' },
                ],
            },
        ]);
    });

    it('to 为空的直播记录被丢弃', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    { uid: '1', uname: '空目标', to: [] },
                ],
            },
            ctx(),
        );

        expect(
            (written(plan, TARGET_FILES.liveMonitors) as any).data,
        ).toEqual([]);
        expect(plan.summary.liveMonitors).toBe(0);
    });
});

describe('动态监听与运行时拆分', () => {
    const dynSource = {
        [LEGACY_FILES.dynData]: [
            {
                uid: '1',
                uname: '主播A',
                to: [{ id: '100', type: 'group' }],
                cachedIds: ['a', 'b'],
            },
        ],
    };

    it('监听文件不含 cachedIds', () => {
        const plan = buildMigrationPlan(dynSource, ctx());
        expect(written(plan, TARGET_FILES.dynMonitors)).toEqual({
            version: 1,
            data: [
                {
                    uid: '1',
                    uname: '主播A',
                    to: [{ id: '100', type: 'group' }],
                },
            ],
        });
    });

    it('cachedIds 移入运行时文件', () => {
        const plan = buildMigrationPlan(dynSource, ctx());
        expect(written(plan, TARGET_FILES.dynRuntime)).toEqual({
            version: 1,
            data: { 1: { cachedIds: ['a', 'b'] } },
        });
        expect(plan.summary.dynRuntime).toBe(1);
    });

    it('to 为空的动态监听被丢弃, 但缓存仍保留', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynData]: [
                    {
                        uid: '1',
                        uname: '空目标',
                        to: [],
                        cachedIds: ['a'],
                    },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.dynMonitors) as any).data,
        ).toEqual([]);
        expect(
            (written(plan, TARGET_FILES.dynRuntime) as any).data,
        ).toEqual({ 1: { cachedIds: ['a'] } });
    });

    it('缓存清洗: 剔除非字符串 / 去重保留最后出现位置', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                        cachedIds: ['a', 42, 'b', 'a', null, 'c'],
                    },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.dynRuntime) as any).data,
        ).toEqual({ 1: { cachedIds: ['b', 'a', 'c'] } });
    });

    it('缓存超过 100 时保留最后 100 条', () => {
        const ids = Array.from({ length: 105 }, (_, i) => `id${i}`);
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                        cachedIds: ids,
                    },
                ],
            },
            ctx(),
        );
        const data = (written(plan, TARGET_FILES.dynRuntime) as any)
            .data;
        expect(data['1'].cachedIds).toHaveLength(100);
        expect(data['1'].cachedIds[0]).toBe('id5');
        expect(data['1'].cachedIds[99]).toBe('id104');
    });

    it('缓存为空时不为该 uid 建条目', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                        cachedIds: [],
                    },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.dynRuntime) as any).data,
        ).toEqual({});
        expect(plan.summary.dynRuntime).toBe(0);
    });
});

describe('上限合并', () => {
    it('三类上限合并到同一会话记录', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveLimits]: [
                    { id: '100', type: 'group', max: 5 },
                ],
                [LEGACY_FILES.onlineLimits]: [
                    { id: '100', type: 'group', max: 1 },
                ],
                [LEGACY_FILES.dynLimits]: [
                    { id: '100', type: 'group', max: 0 },
                ],
            },
            ctx(),
        );

        expect(written(plan, TARGET_FILES.limits)).toEqual({
            version: 1,
            data: [
                {
                    id: '100',
                    type: 'group',
                    limits: { live: 5, online: 1, dyn: 0 },
                },
            ],
        });
        expect(plan.summary.limits).toBe(1);
    });

    it('0 是有效上限值, 不得当作缺省丢弃', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynLimits]: [
                    { id: '100', type: 'group', max: 0 },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.limits) as any).data,
        ).toEqual([
            { id: '100', type: 'group', limits: { dyn: 0 } },
        ]);
    });

    it('同 (id, type) 在不同文件重复时按类型各自落位', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveLimits]: [
                    { id: '100', type: 'group', max: 1 },
                    { id: '100', type: 'group', max: 9 },
                ],
            },
            ctx(),
        );
        // 同一文件内重复取最后
        expect(
            (written(plan, TARGET_FILES.limits) as any).data,
        ).toEqual([
            { id: '100', type: 'group', limits: { live: 9 } },
        ]);
    });

    it('非有限数的 max 被丢弃并警告', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveLimits]: [
                    { id: '100', type: 'group', max: null },
                    { id: '200', type: 'group', max: 3 },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.limits) as any).data,
        ).toEqual([
            { id: '200', type: 'group', limits: { live: 3 } },
        ]);
        expect(plan.warnings.join()).toContain('max 非有限数');
    });

    it('type 非法或顶层不是数组时忽略并警告', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveLimits]: 'oops',
                [LEGACY_FILES.dynLimits]: [
                    { id: '100', type: 'channel', max: 3 },
                ],
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.limits) as any).data,
        ).toEqual([]);
        expect(plan.warnings.join()).toContain('顶层不是数组');
        expect(plan.warnings.join()).toContain('type 非法');
    });
});

describe('直播间快照原地包裹', () => {
    it('数字 uid 归一化为字符串, 并作为键', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.roomData]: {
                    123: {
                        room_id: 9527,
                        uid: 123,
                        live_status: 'streaming',
                    },
                },
            },
            ctx(),
        );

        expect(written(plan, TARGET_FILES.roomData)).toEqual({
            version: 1,
            data: {
                123: {
                    room_id: 9527,
                    uid: '123',
                    live_status: 'streaming',
                },
            },
        });
        expect(plan.summary.roomRecords).toBe(1);
    });

    it('键与 uid 不一致时按 uid 归一', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.roomData]: {
                    999: { room_id: 9527, uid: 123 },
                },
            },
            ctx(),
        );
        expect(
            (written(plan, TARGET_FILES.roomData) as any).data,
        ).toEqual({ 123: { room_id: 9527, uid: '123' } });
        expect(plan.warnings.join()).toContain('与键不一致');
    });

    it('uid 既非数字也非字符串时计入校验问题', () => {
        expect(() =>
            buildMigrationPlan(
                {
                    [LEGACY_FILES.roomData]: {
                        1: { room_id: 9527, uid: { nested: true } },
                    },
                },
                ctx(),
            ),
        ).toThrow(MigrationValidationError);
    });
});

describe('严格校验', () => {
    it('uid 为数字时抛错并携带定位信息', () => {
        try {
            buildMigrationPlan(
                {
                    [LEGACY_FILES.liveData]: [
                        { uid: 123, uname: '主播A', to: [] },
                    ],
                },
                ctx(),
            );
            expect.unreachable('应当抛出 MigrationValidationError');
        } catch (error) {
            const err = error as MigrationValidationError;
            expect(err).toBeInstanceOf(MigrationValidationError);
            expect(err.issues).toEqual([
                {
                    file: 'bilibiliLiveData.json',
                    path: '[0]',
                    field: 'uid',
                    actual: 'number',
                },
            ]);
        }
    });

    it('to 目标的 id 非字符串同样抛错', () => {
        try {
            buildMigrationPlan(
                {
                    [LEGACY_FILES.liveData]: [
                        {
                            uid: '1',
                            uname: '主播A',
                            to: [{ id: 100, type: 'group' }],
                        },
                    ],
                },
                ctx(),
            );
            expect.unreachable('应当抛出 MigrationValidationError');
        } catch (error) {
            const err = error as MigrationValidationError;
            expect(err.issues).toEqual([
                {
                    file: 'bilibiliLiveData.json',
                    path: '[0].to[0]',
                    field: 'id',
                    actual: 'number',
                },
            ]);
        }
    });

    it('多处问题一次性收集后抛出 (不部分迁移)', () => {
        try {
            buildMigrationPlan(
                {
                    [LEGACY_FILES.liveData]: [
                        { uid: 123, uname: 'A', to: [] },
                    ],
                    [LEGACY_FILES.dynData]: [
                        { uid: 456, uname: 'B', to: [] },
                    ],
                },
                ctx(),
            );
            expect.unreachable('应当抛出 MigrationValidationError');
        } catch (error) {
            const err = error as MigrationValidationError;
            expect(err.issues).toHaveLength(2);
            expect(err.issues.map((i) => i.file)).toEqual([
                'bilibiliLiveData.json',
                'bilibiliDynData.json',
            ]);
        }
    });
});

describe('幂等与备份', () => {
    it('已跳过的目标不写入、不消费其源文件', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
            },
            ctx({ skipTargets: new Set([TARGET_FILES.liveMonitors]) }),
        );

        expect(plan.writes).toEqual([]);
        expect(plan.backups).toEqual([]);
    });

    it('多个目标共享同一源文件时只备份一次', () => {
        const plan = buildMigrationPlan(
            {
                [LEGACY_FILES.dynData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                        cachedIds: ['a'],
                    },
                ],
            },
            ctx(),
        );

        expect(plan.backups).toEqual([
            {
                from: LEGACY_FILES.dynData,
                to: 'bilibiliDynData.json.20260919143005.bak',
                mode: 'rename',
            },
        ]);
    });

    it('同名源与目标 (直播间快照) 采用 copy 备份', () => {
        const plan = buildMigrationPlan(
            { [LEGACY_FILES.roomData]: { 1: { uid: 1 } } },
            ctx(),
        );
        expect(plan.backups).toEqual([
            {
                from: LEGACY_FILES.roomData,
                to: 'bilibiliLiveRoomData.json.20260919143005.bak',
                mode: 'copy',
            },
        ]);
    });

    it('无任何旧文件时不产生写入与备份', () => {
        const plan = buildMigrationPlan({}, ctx());
        expect(plan.writes).toEqual([]);
        expect(plan.backups).toEqual([]);
    });
});

describe('buildBackupName 命名', () => {
    it('追加本地时间戳与 .bak 后缀', () => {
        expect(formatStamp(NOW)).toBe('20260919143005');
        expect(buildBackupName('a.json', new Set(), NOW)).toBe(
            'a.json.20260919143005.bak',
        );
    });

    it('同名备份已存在时追加序号', () => {
        const taken = new Set(['a.json.20260919143005.bak']);
        expect(buildBackupName('a.json', taken, NOW)).toBe(
            'a.json.20260919143005.1.bak',
        );
    });

    it('序号继续递增', () => {
        const taken = new Set([
            'a.json.20260919143005.bak',
            'a.json.20260919143005.1.bak',
        ]);
        expect(buildBackupName('a.json', taken, NOW)).toBe(
            'a.json.20260919143005.2.bak',
        );
    });
});
