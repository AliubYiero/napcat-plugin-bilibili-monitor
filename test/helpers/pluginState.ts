/**
 * pluginState 的内存替身 (store 层测试基建)
 *
 * 本项目的 store 只经 `pluginState.loadDataFile / saveDataFile` 触达
 * 文件系统, 因此把这个单例换成"内存文件表"即可在无 fs、无 ctx 的前提下
 * 测 store 与迁移层。
 *
 * 三条使用约束 (踩过就知道疼):
 *
 * 1. `vi.mock` 的工厂里必须**动态 import 本模块**, 不能在别处代为注册 ——
 *    vi.mock 的提升只作用于写下它的那个文件。
 *    ```ts
 *    vi.mock('../../src/core/state', async () => {
 *        const { createFakePluginState } = await import('../helpers/pluginState');
 *        return { pluginState: createFakePluginState() };
 *    });
 *    ```
 * 2. 读写的值**必须深拷贝**: 否则 store 的内存对象与"磁盘"是同一个引用,
 *    `saveDataFile` 变成空操作, 改内存就等于改文件, 用例会假绿。
 * 3. store 是单例 (`private constructor` + 静态实例), 用例之间无法重建:
 *    前态清理统一用 `store.reset()`; 需要"从文件加载"的场景用
 *    `seedFile(...)` + `store.reload()` (与构造走同一条 loadFromFile 路径)。
 */

import { vi } from 'vitest';

/** 内存"磁盘": 文件名 → 原始 JSON 值 */
const files = new Map<string, unknown>();

/** 替身 logger (断言日志输出用) */
export const fakeLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

/** 深拷贝, 保证"磁盘"与内存不共享引用 */
function clone<T>(value: T): T {
    return value === undefined ? value : structuredClone(value);
}

/** 替身配置 (与 pluginState.config 同一个对象, 供用例直接改) */
const fakeConfig = {
    enabled: true,
    adminUsers: [] as string[],
};

/** 设置超管名单 (isSuperAdmin 的唯一数据来源) */
export function setAdminUsers(users: string[]): void {
    fakeConfig.adminUsers = [...users];
}

/** 每个用例前调用: 清空内存磁盘与 mock 调用记录 */
export function resetFakeState(): void {
    files.clear();
    fakeConfig.adminUsers = [];
    vi.clearAllMocks();
}

/** 预置"磁盘上已有内容"(可写旧结构 / 损坏结构 / 目标新文件) */
export function seedFile(name: string, raw: unknown): void {
    files.set(name, clone(raw));
}

/** 读回"磁盘"上现在的内容 (断言写入了什么) */
export function readFile(name: string): unknown {
    return clone(files.get(name));
}

/** 当前"磁盘"上的全部文件名 */
export function listFiles(): string[] {
    return [...files.keys()];
}

/** 供 vi.mock 工厂使用的 pluginState 形状 (只覆盖被测代码用到的面) */
export function createFakePluginState() {
    return {
        loadDataFile<T>(name: string, defaultValue: T): T {
            return files.has(name)
                ? (clone(files.get(name)) as T)
                : defaultValue;
        },
        saveDataFile<T>(name: string, data: T): void {
            files.set(name, clone(data));
        },
        getDataFilePath(name: string): string {
            return `/fake-data/${name}`;
        },
        logger: fakeLogger,
        config: fakeConfig,
        startTime: 0,
        selfId: '',
        timers: new Map(),
    };
}
