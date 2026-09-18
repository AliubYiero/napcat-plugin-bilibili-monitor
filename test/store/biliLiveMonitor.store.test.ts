/**
 * BiliLiveMonitorStore 直播监听 + 同接监听合并存储
 *
 * 领域规则来源 (设计稿 §6 bilibiliLiveMonitors.json):
 * - `to` 为空时删除整条记录, `onlineTo` 一并删除
 * - 不允许存在只有 onlineTo 没有 to 的记录
 * - `mentionUsers` / `onlineTo` 为空时不落盘该字段
 * - has(uid, toInfo) 判"直播目标", hasOnline(uid) 判"任意同接目标"
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { BiliLiveMonitorStore } from '../../src/store/biliLiveMonitor.store';
import {
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliLiveMonitors.json';
const store = BiliLiveMonitorStore.getInstance();

const GROUP = { id: '100', type: 'group' } as const;
const PRIVATE = { id: '200', type: 'private' } as const;

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('add 直播目标', () => {
    it('新主播落盘为 version 包裹且在 to 中', () => {
        expect(store.add('1', '主播A', GROUP)).toBe(true);
        expect(store.getByUid('1')).toEqual({
            uid: '1',
            uname: '主播A',
            to: [{ id: '100', type: 'group' }],
        });
        expect(readFile(FILE)).toEqual({
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

    it('同一目标重复添加返回 false', () => {
        store.add('1', '主播A', GROUP);
        expect(store.add('1', '主播A', GROUP)).toBe(false);
        expect(store.getByUid('1')?.to).toHaveLength(1);
    });

    it('追加新目标并刷新主播名', () => {
        store.add('1', '主播A', GROUP);
        expect(store.add('1', '主播A-改名', PRIVATE)).toBe(true);
        expect(store.getByUid('1')).toEqual({
            uid: '1',
            uname: '主播A-改名',
            to: [
                { id: '100', type: 'group' },
                { id: '200', type: 'private' },
            ],
        });
    });

    it('同 id 不同类型视为不同目标', () => {
        store.add('1', '主播A', { id: '100', type: 'group' });
        expect(
            store.add('1', '主播A', { id: '100', type: 'private' }),
        ).toBe(true);
        expect(store.getByUid('1')?.to).toHaveLength(2);
    });
});

describe('remove 直播目标', () => {
    it('移除后仍有其他目标时只删该目标', () => {
        store.add('1', '主播A', GROUP);
        store.add('1', '主播A', PRIVATE);
        expect(store.remove('1', GROUP)).toBe(true);
        expect(store.getByUid('1')?.to).toEqual([
            { id: '200', type: 'private' },
        ]);
    });

    it('移除最后一个目标时整条记录删除 (onlineTo 一并删除)', () => {
        store.add('1', '主播A', GROUP);
        store.addOnline('1', GROUP);
        expect(store.getByUid('1')?.onlineTo).toEqual([
            { id: '100', type: 'group' },
        ]);

        expect(store.remove('1', GROUP)).toBe(true);
        expect(store.getByUid('1')).toBeUndefined();
        expect(readFile(FILE)).toEqual({ version: 1, data: [] });
    });

    it('移除直播目标时级联移除同目标上的同接监听', () => {
        store.add('1', '主播A', GROUP);
        store.add('1', '主播A', PRIVATE);
        store.addOnline('1', GROUP);
        store.addOnline('1', PRIVATE);

        store.remove('1', GROUP);
        expect(store.getByUid('1')?.onlineTo).toEqual([
            { id: '200', type: 'private' },
        ]);
    });

    it('未监听的目标移除返回 false', () => {
        store.add('1', '主播A', GROUP);
        expect(store.remove('1', PRIVATE)).toBe(false);
    });
});

describe('has / hasOnline / hasOnlineForTarget 三种语义', () => {
    beforeEach(() => {
        store.add('1', '主播A', GROUP);
        store.addOnline('1', PRIVATE);
    });

    it('has 只看直播目标', () => {
        expect(store.has('1', GROUP)).toBe(true);
        expect(store.has('1', PRIVATE)).toBe(false);
    });

    it('hasOnline 看是否有任意同接目标', () => {
        expect(store.hasOnline('1')).toBe(true);
        expect(store.hasOnline('2')).toBe(false);
    });

    it('hasOnlineForTarget 看指定会话的同接目标', () => {
        expect(store.hasOnlineForTarget('1', PRIVATE)).toBe(true);
        expect(store.hasOnlineForTarget('1', GROUP)).toBe(false);
    });
});

describe('onlineTo 同接目标', () => {
    it('无直播监听时拒绝添加且不落盘', () => {
        const before = readFile(FILE);
        expect(store.addOnline('9', GROUP)).toBe(false);
        expect(store.getByUid('9')).toBeUndefined();
        expect(readFile(FILE)).toEqual(before);
    });

    it('重复添加返回 false', () => {
        store.add('1', '主播A', GROUP);
        expect(store.addOnline('1', PRIVATE)).toBe(true);
        expect(store.addOnline('1', PRIVATE)).toBe(false);
    });

    it('清除最后一个同接目标时字段置 undefined, 不落盘空数组', () => {
        store.add('1', '主播A', GROUP);
        store.addOnline('1', PRIVATE);
        expect(store.removeOnline('1', PRIVATE)).toBe(true);
        expect(store.getByUid('1')).not.toHaveProperty('onlineTo');
        expect(readFile(FILE)).toEqual({
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
});

describe('mentionUsers 开播 @ 订阅', () => {
    beforeEach(() => {
        store.add('1', '主播A', GROUP);
    });

    it('订阅与取消订阅', () => {
        expect(store.addMention('1', GROUP, '555')).toBe(true);
        expect(store.addMention('1', GROUP, '555')).toBe(false);
        expect(store.getMentionUsers('1', GROUP)).toEqual(['555']);

        expect(store.removeMention('1', GROUP, '555')).toBe(true);
        expect(store.getMentionUsers('1', GROUP)).toEqual([]);
    });

    it('清空后不落盘空数组', () => {
        store.addMention('1', GROUP, '555');
        store.removeMention('1', GROUP, '555');
        expect(readFile(FILE)).toEqual({
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

    it('对不存在的目标订阅返回 false', () => {
        expect(store.addMention('1', PRIVATE, '555')).toBe(false);
    });
});

describe('加载清洗', () => {
    it('丢弃 to 为空的记录 (不允许只有 onlineTo 没有 to)', () => {
        seedFile(FILE, {
            version: 1,
            data: [
                {
                    uid: '1',
                    uname: '孤儿',
                    to: [],
                    onlineTo: [{ id: '100', type: 'group' }],
                },
                {
                    uid: '2',
                    uname: '正常',
                    to: [{ id: '100', type: 'group' }],
                },
            ],
        });
        store.reload();
        expect(store.get().map((m) => m.uid)).toEqual(['2']);
    });

    it('读取旧裸数组结构', () => {
        seedFile(FILE, [
            {
                uid: '1',
                uname: '主播A',
                to: [{ id: '100', type: 'group' }],
            },
        ]);
        store.reload();
        expect(store.getByUid('1')?.uname).toBe('主播A');
    });

    it('列表中查询按会话过滤 (live 与 online 各自独立)', () => {
        store.add('1', '主播A', GROUP);
        store.add('2', '主播B', GROUP);
        store.addOnline('2', GROUP);

        expect(
            store.listForLiveTarget(GROUP).map((m) => m.uid),
        ).toEqual(['1', '2']);
        expect(
            store.listForOnlineTarget(GROUP).map((m) => m.uid),
        ).toEqual(['2']);
    });
});
