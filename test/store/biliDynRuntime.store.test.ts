/**
 * BiliDynRuntimeStore 动态运行时快照
 *
 * 领域规则来源 (设计稿 §6 bilibiliDynRuntimeData.json):
 * - 键为 uid, 每个 uid 独立维护 FIFO, 上限 100, 超出从头部淘汰
 * - 每次新增已推送动态 id 后立即保存
 * - 空 cachedIds 视为无记录, 可删除该 uid 运行时项
 * - 孤立 uid 加载时内存清理, 不立即落盘
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { BiliDynRuntimeStore } from '../../src/store/biliDynRuntime.store';
import {
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliDynRuntimeData.json';
const store = BiliDynRuntimeStore.getInstance();

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('addCachedIds 写入', () => {
    it('新增 id 立即落盘, 键为 uid', () => {
        expect(store.addCachedIds('1', ['a', 'b'])).toBe(true);
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: { 1: { cachedIds: ['a', 'b'] } },
        });
        expect(store.getCachedIds('1')).toEqual(['a', 'b']);
    });

    it('全部已存在时返回 false 且内容不变', () => {
        store.addCachedIds('1', ['a']);
        expect(store.addCachedIds('1', ['a'])).toBe(false);
        expect(store.getCachedIds('1')).toEqual(['a']);
    });

    it('重复 id 只保留一份', () => {
        store.addCachedIds('1', ['a', 'b', 'a']);
        expect(store.getCachedIds('1')).toEqual(['a', 'b']);
    });

    it('addCachedId 单条写入', () => {
        expect(store.addCachedId('1', 'a')).toBe(true);
        expect(store.getCachedIds('1')).toEqual(['a']);
    });

    it('不同 uid 各自独立', () => {
        store.addCachedIds('1', ['a']);
        store.addCachedIds('2', ['b']);
        expect(store.getCachedIds('1')).toEqual(['a']);
        expect(store.getCachedIds('2')).toEqual(['b']);
    });

    it('超过 100 从头部淘汰', () => {
        const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
        store.addCachedIds('1', ids);
        const cached = store.getCachedIds('1');
        expect(cached).toHaveLength(100);
        expect(cached[0]).toBe('id1');
        expect(cached[99]).toBe('id100');
    });

    it('分批累加同样受上限约束', () => {
        store.addCachedIds('1', ['a', 'b']);
        store.addCachedIds('1', ['c']);
        expect(store.getCachedIds('1')).toEqual(['a', 'b', 'c']);
    });

    it('非字符串 id 被忽略', () => {
        store.addCachedIds('1', ['a', 42 as unknown as string]);
        expect(store.getCachedIds('1')).toEqual(['a']);
    });
});

describe('getCachedIds 返回副本', () => {
    it('外部改动不污染存储', () => {
        store.addCachedIds('1', ['a']);
        const ids = store.getCachedIds('1');
        ids.push('b');
        expect(store.getCachedIds('1')).toEqual(['a']);
    });

    it('无记录的 uid 返回空数组', () => {
        expect(store.getCachedIds('404')).toEqual([]);
    });
});

describe('removeRuntime 删除', () => {
    it('删除后不再有记录', () => {
        store.addCachedIds('1', ['a']);
        store.removeRuntime('1');
        expect(store.has('1')).toBe(false);
        expect(readFile(FILE)).toEqual({ version: 1, data: {} });
    });

    it('删除不存在的 uid 不落盘', () => {
        store.addCachedIds('1', ['a']);
        const before = readFile(FILE);
        store.removeRuntime('404');
        expect(readFile(FILE)).toEqual(before);
    });
});

describe('pruneOrphans 孤立清理', () => {
    it('只清内存, 不落盘', () => {
        store.addCachedIds('1', ['a']);
        store.addCachedIds('2', ['b']);
        const onDisk = readFile(FILE);

        const pruned = store.pruneOrphans((uid) => uid === '1');

        expect(pruned).toEqual(['2']);
        expect(store.getCachedIds('2')).toEqual([]);
        // 磁盘内容保持原样 (孤立项在下次真正写入时才消失)
        expect(readFile(FILE)).toEqual(onDisk);
    });

    it('全部有效时不清理', () => {
        store.addCachedIds('1', ['a']);
        expect(store.pruneOrphans(() => true)).toEqual([]);
        expect(store.getCachedIds('1')).toEqual(['a']);
    });

    it('清理后再写入才落盘', () => {
        store.addCachedIds('1', ['a']);
        store.addCachedIds('2', ['b']);
        store.pruneOrphans((uid) => uid === '1');
        store.addCachedIds('1', ['c']);
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: { 1: { cachedIds: ['a', 'c'] } },
        });
    });
});

describe('加载清洗', () => {
    it('空 cachedIds 的 uid 不加载', () => {
        seedFile(FILE, {
            version: 1,
            data: {
                1: { cachedIds: [] },
                2: { cachedIds: ['a'] },
            },
        });
        store.reload();
        expect(store.keys()).toEqual(['2']);
    });

    it('剔除非字符串缓存项并对超限数据截尾', () => {
        const ids = [
            ...Array.from({ length: 101 }, (_, i) => `id${i}`),
            42,
        ];
        seedFile(FILE, { version: 1, data: { 1: { cachedIds: ids } } });
        store.reload();
        const cached = store.getCachedIds('1');
        expect(cached).toHaveLength(100);
        expect(cached[0]).toBe('id1');
    });

    it('cachedIds 非数组的记录被丢弃', () => {
        seedFile(FILE, {
            version: 1,
            data: { 1: { cachedIds: 'oops' }, 2: {} },
        });
        store.reload();
        expect(store.keys()).toEqual([]);
    });
});
