/**
 * 测试环境守卫
 *
 * 不镜像 src/ 的任何模块: 这里断言的是测试基础设施自身的不变量。
 *
 * 时区必须在 vitest 配置中钉死, 否则时间格式化断言会因本机与 CI
 * 的时区差异给出不同结果。这条守卫是该前提的唯一可执行证据——
 * 一旦钉死失效, 它先红, 而不是让一批格式化用例悄悄变成"看运气"。
 */
import { describe, expect, it } from 'vitest';

/** 2024-01-01T00:00:00Z, 东八区即当日 08:00 */
const UTC_MIDNIGHT_2024 = 1704067200000;

describe('测试环境', () => {
    it('时区钉死为东八区', () => {
        // getTimezoneOffset 返回 UTC 与本地时间的分钟差, 东八区为 -480
        expect(new Date(UTC_MIDNIGHT_2024).getTimezoneOffset()).toBe(
            -480,
        );
    });

    it('UTC 午夜在东八区落在当日 08:00', () => {
        expect(new Date(UTC_MIDNIGHT_2024).getHours()).toBe(8);
    });
});
