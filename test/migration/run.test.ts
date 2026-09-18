/**
 * executeMigration 迁移执行层
 *
 * 用内存实现替换文件系统, 断言的是"写什么、按什么顺序写、失败时写不写":
 * - 幂等: 目标已是当前版本 → skipped, 不重跑不覆盖
 * - 崩溃安全顺序: 复制同名备份 → 写新文件 → 重命名其余旧文件
 * - 校验失败: 一个文件都不写、不重命名
 */

import { describe, expect, it } from 'vitest';
import {
    LEGACY_FILES,
    MigrationValidationError,
    TARGET_FILES,
} from '../../src/store/migration/plan';
import {
    type MigrationIo,
    MigrationError,
    executeMigration,
    formatMigrationSummary,
} from '../../src/store/migration/run';

const NOW = new Date(2026, 8, 19, 14, 30, 5);
const STAMP = '20260919143005';

/** 内存文件系统, 记录全部写操作以便断言顺序 */
function createMemoryIo(options: {
    files?: Record<string, unknown>;
    corrupt?: string[];
} = {}) {
    const files = new Map<string, unknown>();
    for (const [name, value] of Object.entries(options.files ?? {})) {
        files.set(name, structuredClone(value));
    }
    const corrupt = new Set(options.corrupt ?? []);
    const calls: string[] = [];

    const io: MigrationIo = {
        list: () => [...files.keys()],
        read(name) {
            if (corrupt.has(name)) {
                return { status: 'invalid', error: 'Unexpected token' };
            }
            if (!files.has(name)) return { status: 'missing' };
            return { status: 'ok', value: structuredClone(files.get(name)) };
        },
        write(name, data) {
            calls.push(`write:${name}`);
            files.set(name, structuredClone(data));
        },
        rename(from, to) {
            calls.push(`rename:${from}->${to}`);
            files.set(to, structuredClone(files.get(from)));
            files.delete(from);
        },
        copy(from, to) {
            calls.push(`copy:${from}->${to}`);
            files.set(to, structuredClone(files.get(from)));
        },
    };
    return { io, files, calls };
}

/** 一份完整的旧数据目录 */
const LEGACY_DIR: Record<string, unknown> = {
    [LEGACY_FILES.liveData]: [
        {
            uid: '1',
            uname: '主播A',
            to: [{ id: '100', type: 'group', mentionUsers: ['555'] }],
        },
    ],
    [LEGACY_FILES.onlineMonitors]: [
        {
            uid: '1',
            uname: '主播A',
            to: [{ id: '100', type: 'group' }],
        },
    ],
    [LEGACY_FILES.dynData]: [
        {
            uid: '2',
            uname: '主播B',
            to: [{ id: '200', type: 'group' }],
            cachedIds: ['a', 'b'],
        },
    ],
    [LEGACY_FILES.liveLimits]: [
        { id: '100', type: 'group', max: 5 },
    ],
    [LEGACY_FILES.onlineLimits]: [
        { id: '100', type: 'group', max: 1 },
    ],
    [LEGACY_FILES.dynLimits]: [
        { id: '200', type: 'group', max: 0 },
    ],
    [LEGACY_FILES.roomData]: {
        1: { room_id: 9527, uid: 1, live_status: 'streaming' },
    },
};

describe('全量迁移', () => {
    it('写入 5 个新文件并备份全部旧文件', () => {
        const { io, files } = createMemoryIo({ files: LEGACY_DIR });
        const result = executeMigration(io, NOW);

        expect(result.status).toBe('migrated');
        expect(result.plan.writes.map((w) => w.name).sort()).toEqual([
            'bilibiliDynMonitors.json',
            'bilibiliDynRuntimeData.json',
            'bilibiliLimits.json',
            'bilibiliLiveMonitors.json',
            'bilibiliLiveRoomData.json',
        ]);
        expect(result.plan.backups.map((b) => b.from).sort()).toEqual(
            Object.keys(LEGACY_DIR).sort(),
        );

        // 旧文件名都已消失 (直播间快照是 copy 备份, 原文件被新内容覆盖)
        for (const name of Object.keys(LEGACY_DIR)) {
            if (name === LEGACY_FILES.roomData) continue;
            expect(files.has(name)).toBe(false);
            expect(files.has(`${name}.${STAMP}.bak`)).toBe(true);
        }
    });

    it('新文件内容带 version 包裹且经合并', () => {
        const { io, files } = createMemoryIo({ files: LEGACY_DIR });
        executeMigration(io, NOW);

        expect(files.get(TARGET_FILES.liveMonitors)).toEqual({
            version: 1,
            data: [
                {
                    uid: '1',
                    uname: '主播A',
                    to: [
                        {
                            id: '100',
                            type: 'group',
                            mentionUsers: ['555'],
                        },
                    ],
                    onlineTo: [{ id: '100', type: 'group' }],
                },
            ],
        });
        expect(files.get(TARGET_FILES.limits)).toEqual({
            version: 1,
            data: [
                {
                    id: '100',
                    type: 'group',
                    limits: { live: 5, online: 1 },
                },
                { id: '200', type: 'group', limits: { dyn: 0 } },
            ],
        });
        expect(files.get(TARGET_FILES.roomData)).toEqual({
            version: 1,
            data: { 1: { room_id: 9527, uid: '1', live_status: 'streaming' } },
        });
    });

    it('执行顺序: 先复制同名备份, 再写新文件, 最后重命名其余旧文件', () => {
        const { io, calls } = createMemoryIo({ files: LEGACY_DIR });
        executeMigration(io, NOW);

        const copyIndex = calls.indexOf(
            `copy:${LEGACY_FILES.roomData}->${LEGACY_FILES.roomData}.${STAMP}.bak`,
        );
        const firstWrite = calls.findIndex((c) => c.startsWith('write:'));
        const firstRename = calls.findIndex((c) =>
            c.startsWith('rename:'),
        );

        expect(copyIndex).toBeGreaterThanOrEqual(0);
        expect(firstWrite).toBeGreaterThan(copyIndex);
        expect(firstRename).toBeGreaterThan(firstWrite);
    });

    it('直播间快照的旧内容保留在同名备份里', () => {
        const { io, files } = createMemoryIo({ files: LEGACY_DIR });
        executeMigration(io, NOW);
        expect(
            files.get(`${LEGACY_FILES.roomData}.${STAMP}.bak`),
        ).toEqual({ 1: { room_id: 9527, uid: 1, live_status: 'streaming' } });
    });

    it('摘要文本包含各计数', () => {
        const { io } = createMemoryIo({ files: LEGACY_DIR });
        const result = executeMigration(io, NOW);
        const text = formatMigrationSummary(result.plan);
        expect(text).toContain('直播监听 1 条 (含同接 1 条)');
        expect(text).toContain('动态监听 1 条 (运行时快照 1 条)');
        expect(text).toContain('会话上限 2 条');
        expect(text).toContain('直播间快照 1 条');
        expect(text).toContain('写入 5 个文件, 备份 7 个文件');
    });
});

describe('幂等', () => {
    it('迁移后再次执行跳过且无任何写操作', () => {
        const { io, calls } = createMemoryIo({ files: LEGACY_DIR });
        executeMigration(io, NOW);

        calls.length = 0;
        const second = executeMigration(io, NOW);

        expect(second.status).toBe('skipped');
        expect(calls).toEqual([]);
    });

    it('目标已是当前版本时只迁移缺失的目标', () => {
        const { io, files } = createMemoryIo({
            files: {
                ...LEGACY_DIR,
                [TARGET_FILES.limits]: { version: 1, data: [] },
            },
        });
        const result = executeMigration(io, NOW);

        expect(
            result.plan.writes.map((w) => w.name),
        ).not.toContain(TARGET_FILES.limits);
        // 已跳过的目标不消费其源: 三个上限文件保持原样, 不进备份
        expect(files.has(LEGACY_FILES.liveLimits)).toBe(true);
        expect(
            result.plan.backups.map((b) => b.from),
        ).not.toContain(LEGACY_FILES.liveLimits);
    });

    it('目标声明了未知版本时跳过并警告, 绝不覆盖', () => {
        const { io, files } = createMemoryIo({
            files: {
                [TARGET_FILES.liveMonitors]: { version: 2, data: ['未来'] },
                [LEGACY_FILES.liveData]: [
                    {
                        uid: '1',
                        uname: '主播A',
                        to: [{ id: '100', type: 'group' }],
                    },
                ],
            },
        });
        const result = executeMigration(io, NOW);

        expect(result.status).toBe('skipped');
        expect(files.get(TARGET_FILES.liveMonitors)).toEqual({
            version: 2,
            data: ['未来'],
        });
        expect(result.warnings.join()).toContain('不是当前版本');
    });

    it('无任何旧文件时跳过', () => {
        const { io, calls } = createMemoryIo();
        const result = executeMigration(io, NOW);
        expect(result.status).toBe('skipped');
        expect(calls).toEqual([]);
    });
});

describe('失败时不做任何写入', () => {
    it('uid 非字符串时抛错, 不写新文件也不重命名', () => {
        const { io, files, calls } = createMemoryIo({
            files: {
                ...LEGACY_DIR,
                [LEGACY_FILES.liveData]: [
                    { uid: 1, uname: '主播A', to: [] },
                ],
            },
        });

        expect(() => executeMigration(io, NOW)).toThrow(
            MigrationValidationError,
        );
        expect(calls).toEqual([]);
        expect(files.has(LEGACY_FILES.liveData)).toBe(true);
        expect(files.has(TARGET_FILES.liveMonitors)).toBe(false);
    });

    it('旧文件解析失败时抛 MigrationError 中止迁移', () => {
        const { io, calls } = createMemoryIo({
            files: LEGACY_DIR,
            corrupt: [LEGACY_FILES.dynData],
        });

        expect(() => executeMigration(io, NOW)).toThrow(MigrationError);
        expect(calls).toEqual([]);
    });

    it('目标文件解析失败时跳过该目标而非终止', () => {
        const { io, files } = createMemoryIo({
            files: LEGACY_DIR,
            corrupt: [TARGET_FILES.limits],
        });
        const result = executeMigration(io, NOW);

        expect(result.warnings.join()).toContain('解析失败');
        expect(
            result.plan.writes.map((w) => w.name),
        ).not.toContain(TARGET_FILES.limits);
        expect(files.has(LEGACY_FILES.liveLimits)).toBe(true);
    });
});
