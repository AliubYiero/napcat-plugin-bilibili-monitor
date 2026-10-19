/**
 * 无参快捷指令目标解析
 *
 * `#bili live mention` / `#bili live unmention` 省略 uid 时,
 * 依据当前会话直播监听数量决定作用对象, 三分支:
 * - 零监听: 返回添加指引, 不作用
 * - 唯一监听: 返回该主播 uid
 * - 多监听: 返回带编号的监听列表, 不作用
 */

import { describe, expect, it } from 'vitest';
import { resolveSoleLiveMonitor } from '../../../src/handlers/live/utils';
import type { BiliLiveMonitor } from '../../../src/store/biliLiveMonitorStore';

const monitor = (uid: string, uname: string): BiliLiveMonitor => ({
    uid,
    uname,
    to: [{ id: '100', type: 'group' }],
});

describe('resolveSoleLiveMonitor', () => {
    it('零监听返回添加指引', () => {
        const result = resolveSoleLiveMonitor([]);
        expect(result).toEqual({
            message:
                '当前未监听任何主播, 请先使用 #bili live add <主播uid> 添加',
        });
    });

    it('唯一监听直接返回该主播 uid', () => {
        const result = resolveSoleLiveMonitor([monitor('111', '甲')]);
        expect(result).toEqual({ uid: '111' });
    });

    it('多监听返回带编号的监听列表', () => {
        const result = resolveSoleLiveMonitor([
            monitor('111', '甲'),
            monitor('222', '乙'),
        ]);
        expect(result).toEqual({
            message:
                '当前会话监听了 2 个主播, 请指定:\n' +
                '1. 甲 (uid: 111)\n' +
                '2. 乙 (uid: 222)',
        });
    });

    it('主播名缺失时回退为“主播”', () => {
        const result = resolveSoleLiveMonitor([
            monitor('111', ''),
            monitor('222', '乙'),
        ]);
        expect('message' in result && result.message).toContain(
            '1. 主播 (uid: 111)',
        );
    });
});
