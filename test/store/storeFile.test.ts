/**
 * storeFile 数据文件顶层格式
 *
 * 领域规则来源: 除 Cookie 外所有 store 数据文件统一包裹为
 * `{ version: 1, data: ... }`; 读取侧兼容未包裹的旧结构 (自愈),
 * 写入侧强制包裹。见 docs/store-pattern.md 与 ADR 0007。
 *
 * 期望值一律写死字面量, 不引用被测代码里的常量 —— 引用它们等于让
 * 断言重算一遍被测代码的输入。
 */

import { describe, expect, it } from 'vitest';
import {
    hasVersionField,
    isCurrentVersionFile,
    isPlainObject,
    unwrapData,
    wrapData,
} from '../../src/store/storeFile';

describe('wrapData 顶层包裹', () => {
    it('数组数据包裹为 version 1', () => {
        expect(wrapData([{ id: 'a' }])).toEqual({
            version: 1,
            data: [{ id: 'a' }],
        });
    });

    it('对象数据包裹为 version 1', () => {
        expect(wrapData({ 123: { cachedIds: ['x'] } })).toEqual({
            version: 1,
            data: { 123: { cachedIds: ['x'] } },
        });
    });

    it('空数组同样包裹 (而非直接落盘裸数组)', () => {
        expect(wrapData([])).toEqual({ version: 1, data: [] });
    });
});

describe('unwrapData 解包', () => {
    it('文件缺失 (null / undefined) 返回 null', () => {
        expect(unwrapData(null)).toBeNull();
        expect(unwrapData(undefined)).toBeNull();
    });

    it('当前版本包裹按原样取出, legacy 为 false', () => {
        expect(unwrapData({ version: 1, data: ['a'] })).toEqual({
            data: ['a'],
            legacy: false,
        });
    });

    it('更高版本仍能解包 (版本判定由调用方负责)', () => {
        expect(unwrapData({ version: 2, data: ['a'] })).toEqual({
            data: ['a'],
            legacy: false,
        });
    });

    it('裸数组视为旧结构, legacy 为 true', () => {
        expect(unwrapData([{ uid: '1' }])).toEqual({
            data: [{ uid: '1' }],
            legacy: true,
        });
    });

    it('无 version 的裸对象视为旧结构', () => {
        expect(unwrapData({ 123: { live_status: 'offline' } })).toEqual({
            data: { 123: { live_status: 'offline' } },
            legacy: true,
        });
    });

    it('非对象标量视为旧结构 (由调用方按结构回退)', () => {
        expect(unwrapData(42)).toEqual({ data: 42, legacy: true });
        expect(unwrapData('oops')).toEqual({
            data: 'oops',
            legacy: true,
        });
    });
});

describe('isCurrentVersionFile 幂等判定', () => {
    it('version 恰为 1 且含 data 时为真', () => {
        expect(isCurrentVersionFile({ version: 1, data: [] })).toBe(true);
    });

    it('version 非 1 时为假 (未知版本不得被当作已迁移)', () => {
        expect(isCurrentVersionFile({ version: 2, data: [] })).toBe(
            false,
        );
    });

    it('无 version 的旧结构为假', () => {
        expect(isCurrentVersionFile([{ uid: '1' }])).toBe(false);
        expect(isCurrentVersionFile({ 123: {} })).toBe(false);
    });

    it('只有 version 没有 data 时为假', () => {
        expect(isCurrentVersionFile({ version: 1 })).toBe(false);
    });
});

describe('hasVersionField 版本字段探测', () => {
    it('version 为数字即为真, 不论取值', () => {
        expect(hasVersionField({ version: 1 })).toBe(true);
        expect(hasVersionField({ version: 9 })).toBe(true);
    });

    it('无 version 或非数字为假', () => {
        expect(hasVersionField([1, 2])).toBe(false);
        expect(hasVersionField({ version: '1' })).toBe(false);
    });
});

describe('isPlainObject 普通对象判定', () => {
    it('排除 null 与数组', () => {
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject([1])).toBe(false);
        expect(isPlainObject('x')).toBe(false);
        expect(isPlainObject({})).toBe(true);
    });
});
