/**
 * 三类会话上限服务层
 *
 * 验收标准 13/14 只有这里能证明:
 * - 用户显式设置的 Limit 值即使等于当前全局默认也保留
 * - 缺省字段才回落全局默认, `0` 保留
 * - 读取有效上限由服务层统一提供, 各调用点不自行回落
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
    getLiveLimit,
    listLiveLimits,
    setLiveLimit,
} from '../../src/services/live/limit.service';
import {
    getOnlineLimit,
    listOnlineLimits,
    setOnlineLimit,
} from '../../src/services/live/onlineLimit.service';
import {
    getDynLimit,
    listDynLimits,
    setDynLimit,
} from '../../src/services/dyn/limit.service';
import { resetFakeState, setAdminUsers } from '../helpers/pluginState';

const GROUP = { id: '100', type: 'group' } as const;
const PRIVATE = { id: '200', type: 'private' } as const;

const store = BiliLimitStore.getInstance();

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('未设置时回落全局默认', () => {
    it('直播: 群 5 / 私聊 1', () => {
        expect(getLiveLimit(GROUP)).toBe(5);
        expect(getLiveLimit(PRIVATE)).toBe(1);
    });

    it('同接: 群 1 / 私聊 0', () => {
        expect(getOnlineLimit(GROUP)).toBe(1);
        expect(getOnlineLimit(PRIVATE)).toBe(0);
    });

    it('动态: 群 1 / 私聊 0', () => {
        expect(getDynLimit(GROUP)).toBe(1);
        expect(getDynLimit(PRIVATE)).toBe(0);
    });
});

describe('显式覆盖', () => {
    it('显式设置的值优先于默认', () => {
        setLiveLimit('100', 'group', 9);
        expect(getLiveLimit(GROUP)).toBe(9);
    });

    it('显式设成等于全局默认时仍被保留 (不是缺省)', () => {
        setLiveLimit('100', 'group', 5);
        // 记录确实写进了存储, 而非依赖默认值
        expect(store.getLimit('100', 'group', 'live')).toBe(5);
        expect(listLiveLimits()).toEqual([
            { id: '100', type: 'group', max: 5 },
        ]);
    });

    it('0 是有效覆盖值, 不得回落默认', () => {
        setDynLimit('100', 'group', 0);
        expect(getDynLimit(GROUP)).toBe(0);
        expect(getDynLimit(PRIVATE)).toBe(0);
    });

    it('三类上限互不干扰', () => {
        setLiveLimit('100', 'group', 3);
        setOnlineLimit('100', 'group', 2);
        setDynLimit('100', 'group', 0);
        expect(getLiveLimit(GROUP)).toBe(3);
        expect(getOnlineLimit(GROUP)).toBe(2);
        expect(getDynLimit(GROUP)).toBe(0);
    });

    it('同 id 的群与私聊互相独立', () => {
        setLiveLimit('100', 'group', 3);
        expect(getLiveLimit({ id: '100', type: 'private' })).toBe(1);
    });
});

describe('超级管理员私聊无上限', () => {
    beforeEach(() => {
        setAdminUsers(['999']);
    });

    it('三类上限对超管私聊均返回 Infinity', () => {
        expect(getLiveLimit({ id: '999', type: 'private' })).toBe(
            Infinity,
        );
        expect(getOnlineLimit({ id: '999', type: 'private' })).toBe(
            Infinity,
        );
        expect(getDynLimit({ id: '999', type: 'private' })).toBe(
            Infinity,
        );
    });

    it('超管私聊的显式设置不改变无上限语义', () => {
        setLiveLimit('999', 'private', 2);
        expect(getLiveLimit({ id: '999', type: 'private' })).toBe(
            Infinity,
        );
    });

    it('超管在群里仍受群上限约束', () => {
        expect(getLiveLimit({ id: '999', type: 'group' })).toBe(5);
    });

    it('非超管私聊按显式值与默认值走', () => {
        expect(getLiveLimit({ id: '998', type: 'private' })).toBe(1);
    });
});

describe('listXxxLimits 只列出设置过该 kind 的会话', () => {
    it('过滤掉只设置了其他 kind 的记录', () => {
        setLiveLimit('100', 'group', 3);
        setDynLimit('200', 'group', 1);

        expect(listLiveLimits()).toEqual([
            { id: '100', type: 'group', max: 3 },
        ]);
        expect(listDynLimits()).toEqual([
            { id: '200', type: 'group', max: 1 },
        ]);
        expect(listOnlineLimits()).toEqual([]);
    });

    it('0 值记录同样被列出', () => {
        setOnlineLimit('100', 'group', 0);
        expect(listOnlineLimits()).toEqual([
            { id: '100', type: 'group', max: 0 },
        ]);
    });
});
