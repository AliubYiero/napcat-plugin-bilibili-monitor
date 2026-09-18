/**
 * BiliDynMonitorStore 动态监听配置
 *
 * 领域规则来源 (设计稿 §6 bilibiliDynMonitors.json):
 * - 不再包含 cachedIds (已移入 BiliDynRuntimeStore)
 * - `to` 为空时删除整条记录
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { BiliDynMonitorStore } from '../../src/store/biliDynMonitor.store';
import {
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliDynMonitors.json';
const store = BiliDynMonitorStore.getInstance();

const GROUP = { id: '100', type: 'group' } as const;
const PRIVATE = { id: '200', type: 'private' } as const;

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('add / remove', () => {
    it('新主播落盘为 version 包裹且不含 cachedIds', () => {
        expect(store.add('1', '主播A', GROUP)).toBe(true);
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

    it('重复添加返回 false', () => {
        store.add('1', '主播A', GROUP);
        expect(store.add('1', '主播A', GROUP)).toBe(false);
    });

    it('追加目标并刷新主播名', () => {
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

    it('移除最后一个目标时整条记录删除', () => {
        store.add('1', '主播A', GROUP);
        expect(store.remove('1', GROUP)).toBe(true);
        expect(store.getByUid('1')).toBeUndefined();
        expect(readFile(FILE)).toEqual({ version: 1, data: [] });
    });

    it('移除部分目标时只删该目标', () => {
        store.add('1', '主播A', GROUP);
        store.add('1', '主播A', PRIVATE);
        store.remove('1', GROUP);
        expect(store.getByUid('1')?.to).toEqual([
            { id: '200', type: 'private' },
        ]);
    });

    it('未监听的目标移除返回 false', () => {
        expect(store.remove('404', GROUP)).toBe(false);
    });
});

describe('has 判定', () => {
    it('按目标匹配, 同 id 不同类型不混淆', () => {
        store.add('1', '主播A', GROUP);
        expect(store.has('1', GROUP)).toBe(true);
        expect(store.has('1', { id: '100', type: 'private' })).toBe(
            false,
        );
        expect(store.has('2', GROUP)).toBe(false);
    });
});

describe('加载清洗', () => {
    it('丢弃 to 为空的记录', () => {
        seedFile(FILE, {
            version: 1,
            data: [
                { uid: '1', uname: '空目标', to: [] },
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

    it('读取旧裸数组结构时忽略残留的 cachedIds 字段', () => {
        seedFile(FILE, [
            {
                uid: '1',
                uname: '主播A',
                to: [{ id: '100', type: 'group' }],
                cachedIds: ['x'],
            },
        ]);
        store.reload();
        expect(store.getByUid('1')).toEqual({
            uid: '1',
            uname: '主播A',
            to: [{ id: '100', type: 'group' }],
        });
    });
});
