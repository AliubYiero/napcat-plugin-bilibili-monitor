/**
 * BiliLimitStore 三类会话上限合并存储
 *
 * 领域规则来源 (设计稿 §6 bilibiliLimits.json):
 * - 字段缺省表示跟随全局默认上限, `0` 是有效覆盖值不得视为缺省
 * - 用户显式设置后即写入, 即使值等于当前全局默认
 * - limits 为空对象时删除整条记录
 * - store 只读显式值, 不回落全局默认 (回落由各 kind 的服务层负责)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { BiliLimitStore } from '../../src/store/biliLimit.store';
import {
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliLimits.json';
const store = BiliLimitStore.getInstance();

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('setLimit 显式覆盖', () => {
    it('新会话首条记录落盘为 version 包裹', () => {
        store.setLimit('100', 'group', 'live', 3);
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: [{ id: '100', type: 'group', limits: { live: 3 } }],
        });
    });

    it('0 是有效覆盖值, 读回 0 而非 undefined', () => {
        store.setLimit('100', 'group', 'dyn', 0);
        expect(store.getLimit('100', 'group', 'dyn')).toBe(0);
    });

    it('同一会话不同 kind 相互独立', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.setLimit('100', 'group', 'dyn', 0);
        expect(store.get('100', 'group')).toEqual({
            id: '100',
            type: 'group',
            limits: { live: 5, dyn: 0 },
        });
        expect(store.getLimit('100', 'group', 'online')).toBeUndefined();
    });

    it('重复设置覆盖旧值', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.setLimit('100', 'group', 'live', 2);
        expect(store.getLimit('100', 'group', 'live')).toBe(2);
        expect(store.getAll()).toHaveLength(1);
    });

    it('同 id 不同会话类型互不影响', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.setLimit('100', 'private', 'live', 1);
        expect(store.getAll()).toHaveLength(2);
        expect(store.getLimit('100', 'private', 'live')).toBe(1);
    });

    it('未设置的会话读回 undefined (不回落默认值)', () => {
        expect(store.getLimit('404', 'group', 'live')).toBeUndefined();
        expect(store.get('404', 'group')).toBeUndefined();
    });
});

describe('removeLimit / removeSession', () => {
    it('删除某个 kind 后其他 kind 保留', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.setLimit('100', 'group', 'dyn', 1);
        store.removeLimit('100', 'group', 'live');
        expect(store.get('100', 'group')?.limits).toEqual({ dyn: 1 });
    });

    it('limits 清空后删除整条记录', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.removeLimit('100', 'group', 'live');
        expect(store.get('100', 'group')).toBeUndefined();
        expect(readFile(FILE)).toEqual({ version: 1, data: [] });
    });

    it('删除未设置的 kind 不产生变更', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.removeLimit('100', 'group', 'dyn');
        expect(store.getLimit('100', 'group', 'live')).toBe(5);
    });

    it('removeSession 删除整条记录', () => {
        store.setLimit('100', 'group', 'live', 5);
        store.setLimit('100', 'group', 'dyn', 1);
        store.removeSession('100', 'group');
        expect(store.getAll()).toEqual([]);
    });
});

describe('加载清洗', () => {
    it('读取旧裸数组结构 (单 kind 的 max 形式需由迁移转换, 此处按新结构解析)', () => {
        seedFile(FILE, [
            { id: '100', type: 'group', limits: { live: 3 } },
        ]);
        store.reload();
        expect(store.getLimit('100', 'group', 'live')).toBe(3);
    });

    it('丢弃 id 非字符串、type 非法、limits 非对象的记录', () => {
        seedFile(FILE, {
            version: 1,
            data: [
                { id: 100, type: 'group', limits: { live: 3 } },
                { id: '200', type: 'channel', limits: { live: 3 } },
                { id: '300', type: 'group', limits: [] },
                { id: '400', type: 'group', limits: { live: 3 } },
            ],
        });
        store.reload();
        expect(store.getAll()).toEqual([
            { id: '400', type: 'group', limits: { live: 3 } },
        ]);
    });

    it('丢弃非有限数的值但保留 0', () => {
        seedFile(FILE, {
            version: 1,
            data: [
                {
                    id: '100',
                    type: 'group',
                    limits: { live: 0, online: null, dyn: 'x' },
                },
            ],
        });
        store.reload();
        expect(store.get('100', 'group')?.limits).toEqual({ live: 0 });
    });

    it('清洗后无有效 kind 的记录整体丢弃', () => {
        seedFile(FILE, {
            version: 1,
            data: [
                { id: '100', type: 'group', limits: { live: null } },
            ],
        });
        store.reload();
        expect(store.getAll()).toEqual([]);
    });
});
