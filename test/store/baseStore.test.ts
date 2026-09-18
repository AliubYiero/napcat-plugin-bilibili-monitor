/**
 * BaseStore 的 version 包裹边界
 *
 * 规则: 写入侧强制 `{ version: 1, data: T[] }`; 读取侧兼容旧裸数组
 * (告警但按原样读取, 下次写入自动升级), 结构不符时回退空列表。
 *
 * 这里用一个最小子类验证基类本身, 不牵涉任何业务 store。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { BaseStore } from '../../src/store/BaseStore';
import {
    fakeLogger,
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

interface Item {
    id: string;
}

const FILE = 'testItems.json';

class TestStore extends BaseStore<Item> {
    constructor() {
        super(FILE);
    }
}

/** 新建实例即构造期读盘, 等价于 store 单例首次被业务调用 */
function load(): TestStore {
    return new TestStore();
}

beforeEach(() => {
    resetFakeState();
});

describe('BaseStore 读取', () => {
    it('文件不存在时为空列表', () => {
        expect(load().getAll()).toEqual([]);
    });

    it('读取当前版本包裹', () => {
        seedFile(FILE, { version: 1, data: [{ id: 'a' }] });
        expect(load().getAll()).toEqual([{ id: 'a' }]);
        expect(fakeLogger.warn).not.toHaveBeenCalled();
    });

    it('读取旧裸数组不丢数据, 并告警', () => {
        seedFile(FILE, [{ id: 'legacy' }]);
        expect(load().getAll()).toEqual([{ id: 'legacy' }]);
        expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('顶层不是数组时回退空列表并报错', () => {
        seedFile(FILE, { version: 1, data: { id: 'a' } });
        expect(load().getAll()).toEqual([]);
        expect(fakeLogger.error).toHaveBeenCalledTimes(1);
    });

    it('残留的裸对象同样回退空列表', () => {
        seedFile(FILE, { id: 'a' });
        expect(load().getAll()).toEqual([]);
    });
});

describe('BaseStore 写入', () => {
    it('addItem 落盘为 version 包裹', () => {
        const store = load();
        store.addItem({ id: 'a' });
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: [{ id: 'a' }],
        });
    });

    it('reset 落盘为空数组包裹', () => {
        const store = load();
        store.addItem({ id: 'a' });
        store.reset();
        expect(readFile(FILE)).toEqual({ version: 1, data: [] });
    });

    it('读取旧结构后再写入即自动升级为包裹格式', () => {
        seedFile(FILE, [{ id: 'legacy' }]);
        const store = load();
        store.addItem({ id: 'new' });
        expect(readFile(FILE)).toEqual({
            version: 1,
            data: [{ id: 'legacy' }, { id: 'new' }],
        });
    });
});
