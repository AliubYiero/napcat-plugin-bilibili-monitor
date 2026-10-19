/**
 * SessionConfigStore 会话配置存储
 *
 * 领域规则:
 * - 键为 `<type>:<id>`
 * - 默认开启: 只有显式 enabled:false 才落盘, enabled:true 归一化为"无记录"
 * - liveMentionAll 默认关闭: 只有显式 true 才落盘, 且仅群会话保留
 * - 两者皆无的会话整条删除, 文件保持精简
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import {
    SessionConfigStore,
    sessionConfigKey,
} from '../../src/store/sessionConfigStore';
import {
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliSessionConfig.json';
const store = SessionConfigStore.getInstance();

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('sessionConfigKey', () => {
    it('键为 <type>:<id>', () => {
        expect(sessionConfigKey('123', 'group')).toBe('group:123');
        expect(sessionConfigKey('10001', 'private')).toBe(
            'private:10001',
        );
    });
});

describe('默认开启语义', () => {
    it('缺记录时 find 返回 undefined', () => {
        expect(store.find('123', 'group')).toBeUndefined();
    });

    it('显式 enabled:true 不落盘 (归一化为无记录)', () => {
        store.upsert([
            { id: '123', type: 'group', config: { enabled: true } },
        ]);
        expect(store.find('123', 'group')).toBeUndefined();
        expect(readFile(FILE)).toEqual({ version: 1, data: {} });
    });

    it('显式 enabled:false 落盘', () => {
        store.upsert([
            { id: '123', type: 'group', config: { enabled: false } },
        ]);
        expect(store.find('123', 'group')).toEqual({
            id: '123',
            type: 'group',
            enabled: false,
        });
    });

    it('从 false 改回 true 会删除整条记录', () => {
        store.upsert([
            { id: '123', type: 'group', config: { enabled: false } },
        ]);
        store.upsert([
            { id: '123', type: 'group', config: { enabled: true } },
        ]);
        expect(store.find('123', 'group')).toBeUndefined();
    });
});

describe('liveMentionAll 语义', () => {
    it('群会话 liveMentionAll:true 落盘', () => {
        store.upsert([
            {
                id: '123',
                type: 'group',
                config: { liveMentionAll: true },
            },
        ]);
        expect(store.find('123', 'group')).toEqual({
            id: '123',
            type: 'group',
            liveMentionAll: true,
        });
    });

    it('liveMentionAll:false 不落盘', () => {
        store.upsert([
            {
                id: '123',
                type: 'group',
                config: { liveMentionAll: false },
            },
        ]);
        expect(store.find('123', 'group')).toBeUndefined();
    });

    it('私聊会话的 liveMentionAll 被丢弃', () => {
        store.upsert([
            {
                id: '10001',
                type: 'private',
                config: { liveMentionAll: true },
            },
        ]);
        expect(store.find('10001', 'private')).toBeUndefined();
    });
});

describe('合并与落盘', () => {
    it('enabled 与 liveMentionAll 相互独立保留', () => {
        store.upsert([
            {
                id: '123',
                type: 'group',
                config: { enabled: false, liveMentionAll: true },
            },
        ]);
        expect(store.find('123', 'group')).toEqual({
            id: '123',
            type: 'group',
            enabled: false,
            liveMentionAll: true,
        });
    });

    it('批量 upsert 一次写入多条', () => {
        store.upsert([
            { id: '1', type: 'group', config: { enabled: false } },
            { id: '2', type: 'group', config: { enabled: false } },
        ]);
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: {
                'group:1': { id: '1', type: 'group', enabled: false },
                'group:2': { id: '2', type: 'group', enabled: false },
            },
        });
    });

    it('getConfig 缺记录时返回默认形态', () => {
        expect(store.getConfig('999', 'group')).toEqual({
            id: '999',
            type: 'group',
        });
    });
});

describe('loadFromFile 清洗', () => {
    it('丢弃键与值不自洽的记录', () => {
        seedFile(FILE, {
            version: 1,
            data: {
                'group:123': {
                    id: '456',
                    type: 'group',
                    enabled: false,
                },
                'group:789': {
                    id: '789',
                    type: 'group',
                    enabled: false,
                },
            },
        });
        store.reload();
        expect(store.keys()).toEqual(['group:789']);
    });

    it('丢弃类型非法的记录', () => {
        seedFile(FILE, {
            version: 1,
            data: {
                'group:1': { id: '1', type: 'bogus', enabled: false },
                'group:2': 'nope',
            },
        });
        store.reload();
        expect(store.keys()).toEqual([]);
    });

    it('读入时归一化: 无有效取值的记录被剔除', () => {
        seedFile(FILE, {
            version: 1,
            data: {
                'group:1': { id: '1', type: 'group', enabled: true },
                'group:2': { id: '2', type: 'group', enabled: false },
            },
        });
        store.reload();
        expect(store.keys()).toEqual(['group:2']);
    });
});
