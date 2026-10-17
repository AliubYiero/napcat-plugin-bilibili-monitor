/**
 * 发送工具模块: @ 段构造
 *
 * - `createAtMessageWithSeparator`: @ 段 + 分隔文本段的组合工厂
 * - `prependAtAllMessage`: 在消息前插入 @全体成员 段 (默认以空格分隔)
 */

import { describe, expect, it } from 'vitest';
import {
    createAtMessage,
    createAtMessageWithSeparator,
    createImageMessage,
    createTextMessage,
    prependAtAllMessage,
} from '../../src/handlers/utils';

describe('createAtMessageWithSeparator', () => {
    it('默认在 @ 段后追加一个空格文本段', () => {
        expect(createAtMessageWithSeparator('123')).toEqual([
            createAtMessage('123'),
            createTextMessage(' '),
        ]);
    });

    it('自定义分隔文本', () => {
        expect(
            createAtMessageWithSeparator('all', undefined, '\n'),
        ).toEqual([createAtMessage('all'), createTextMessage('\n')]);
    });

    it('传入群昵称时透传给 @ 段', () => {
        expect(createAtMessageWithSeparator('123', '昵称')).toEqual([
            createAtMessage('123', '昵称'),
            createTextMessage(' '),
        ]);
    });
});

describe('prependAtAllMessage', () => {
    it('字符串消息升级为 [@全体, 默认空格, 正文]', () => {
        expect(prependAtAllMessage('正文')).toEqual([
            createAtMessage('all'),
            createTextMessage(' '),
            createTextMessage('正文'),
        ]);
    });

    it('消息段数组前置 [@全体, 分隔]', () => {
        const image = createImageMessage('base64://xxx');
        expect(prependAtAllMessage([image], '\n')).toEqual([
            createAtMessage('all'),
            createTextMessage('\n'),
            image,
        ]);
    });

    it('显式换行分隔', () => {
        expect(prependAtAllMessage('正文', '\n')).toEqual([
            createAtMessage('all'),
            createTextMessage('\n'),
            createTextMessage('正文'),
        ]);
    });
});
