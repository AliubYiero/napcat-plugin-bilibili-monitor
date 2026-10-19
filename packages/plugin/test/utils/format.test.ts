/**
 * 文本格式化工具测试
 *
 * 这四段文本会直接出现在推送卡片与纯文本回退里, 格式一变用户就能
 * 看见。期望值是手算/独立换算出的字面量, 不从实现反抄。
 *
 * 分区规则取自 CONTEXT.md「分区 (area)」: 父分区为空或与子分区相同
 * 时只显示子分区。
 */
import { describe, expect, it } from 'vitest';
import {
    formatArea,
    formatDuration,
    formatTime,
    roomUrl,
} from '../../src/utils/format';

describe('formatTime', () => {
    it('按东八区输出 YYYY/M/D HH:mm:ss, 月日不补零', () => {
        // 2024-01-01T00:00:00Z
        expect(formatTime(1704067200000)).toBe('2024/1/1 08:00:00');
        // 2025-01-01T00:00:00Z
        expect(formatTime(1735689600000)).toBe('2025/1/1 08:00:00');
    });

    it('时分秒补零', () => {
        // 2024-03-04T20:05:06Z, 东八区为次日 04:05:06
        expect(formatTime(1709582706000)).toBe('2024/3/5 04:05:06');
    });
});

describe('formatDuration', () => {
    it('不足一小时只显示分秒', () => {
        expect(formatDuration(0)).toBe('00:00:00');
        expect(formatDuration(59)).toBe('00:00:59');
        expect(formatDuration(61)).toBe('00:01:01');
    });

    it('超过一小时显示时分秒', () => {
        expect(formatDuration(3600)).toBe('01:00:00');
        expect(formatDuration(3661)).toBe('01:01:01');
        expect(formatDuration(86399)).toBe('23:59:59');
    });

    it('超过 24 小时不回卷为天数', () => {
        expect(formatDuration(90061)).toBe('25:01:01');
    });
});

describe('formatArea', () => {
    it('父子都非空且不同时以连字符拼接', () => {
        expect(formatArea('娱乐', '视频唱见')).toBe(
            '娱乐 - 视频唱见',
        );
    });

    it('父分区与子分区相同时只显示子分区', () => {
        expect(formatArea('虚拟主播', '虚拟主播')).toBe('虚拟主播');
    });

    it('父分区缺失或为空时只显示子分区', () => {
        expect(formatArea(undefined, '网游')).toBe('网游');
        expect(formatArea('', '网游')).toBe('网游');
    });

    it('子分区缺失或为空时只显示父分区', () => {
        expect(formatArea('网游', '')).toBe('网游');
    });

    it('两者都为空时显示未知分区', () => {
        expect(formatArea(undefined, undefined)).toBe('未知分区');
        expect(formatArea('', '')).toBe('未知分区');
    });
});

describe('roomUrl', () => {
    it('有房间号时拼出直播间链接', () => {
        expect(roomUrl(12345)).toBe(
            'https://live.bilibili.com/12345',
        );
    });

    it('无房间号时返回空串而不是残缺链接', () => {
        expect(roomUrl(0)).toBe('');
        expect(roomUrl(undefined)).toBe('');
    });
});
