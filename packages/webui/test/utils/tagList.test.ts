/**
 * 标签输入: 拆分 / 追加去重 / 删除纯函数
 *
 * 范式: docs/webui-config-pattern.md 的 stringList 标签输入。
 * 分隔符为逗号 / 换行; 追加去重; 删除首个匹配项。
 */

import { describe, expect, it } from 'vitest';
import {
    appendTags,
    removeTag,
    splitPending,
} from '../../src/utils/tagList';

describe('splitPending', () => {
    it('无分隔符: 整段留在输入框', () => {
        expect(splitPending('10001')).toEqual({
            complete: [],
            pending: '10001',
        });
    });

    it('尾随分隔符: 完整段成标签, 输入框清空', () => {
        expect(splitPending('10001,')).toEqual({
            complete: ['10001'],
            pending: '',
        });
    });

    it('中间分隔符: 最后一段留在输入框', () => {
        expect(splitPending('10001,10002')).toEqual({
            complete: ['10001'],
            pending: '10002',
        });
    });

    it('换行同样作为分隔符 (含粘贴多行)', () => {
        expect(splitPending('10001\n10002\n10003')).toEqual({
            complete: ['10001', '10002'],
            pending: '10003',
        });
    });

    it('连续分隔符 / 首尾空白: 空段被丢弃', () => {
        expect(splitPending('  10001 ,, 10002 ,')).toEqual({
            complete: ['10001', '10002'],
            pending: '',
        });
    });
});

describe('appendTags', () => {
    it('trim / 去空 / 去重后追加, 已有项原位', () => {
        expect(appendTags(['a', 'b'], [' b ', '', 'c', 'a'])).toEqual(
            ['a', 'b', 'c'],
        );
    });

    it('不修改原数组', () => {
        const list = ['a'];
        appendTags(list, ['b']);
        expect(list).toEqual(['a']);
    });
});

describe('removeTag', () => {
    it('移除首个匹配项', () => {
        expect(removeTag(['a', 'b', 'a'], 'a')).toEqual(['b', 'a']);
    });

    it('未命中时原样复制', () => {
        const list = ['a', 'b'];
        const out = removeTag(list, 'x');
        expect(out).toEqual(['a', 'b']);
        expect(out).not.toBe(list);
    });
});
