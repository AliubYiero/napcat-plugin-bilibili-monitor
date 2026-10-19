/**
 * 配置清洗测试 (shared 的 sanitizeConfig)
 *
 * 清洗是配置全链路唯一的外部输入收口 (铁律: 一切外部输入的配置写回
 * 必须经过 sanitizeConfig)。这里断言的是"输入什么配置、得到什么配置",
 * 不关心清洗内部的判定顺序。
 *
 * 期望值一律写字面量, 不引用 getDefaultConfig()——引用它等于让断言重算
 * 一遍被测代码的输入, 那样改了默认值测试也不会红。字面量来自
 * packages/shared/src/config.ts 的声明, 属独立于清洗实现的规格。
 */

import { sanitizeConfig } from 'shared';
import { describe, expect, it } from 'vitest';

/** 清洗函数在输入缺失/非法时应回填的完整默认值 */
const DEFAULTS = {
    adminUsers: [],
    triggerModes: ['prefix', 'atBot'],
    pollIntervalSeconds: 60,
    dynPollIntervalSeconds: 300,
    pushTypes: [
        'start_stream',
        'end_stream',
        'restart_stream',
        'title_changed',
        'area_changed',
        'offline_title_changed',
        'offline_area_changed',
    ],
    mentionGroupSize: 10,
};

describe('sanitizeConfig 非对象输入', () => {
    it.each([
        ['null', null],
        ['undefined', undefined],
        ['字符串', 'enabled=false'],
        ['数字', 42],
        ['数组', []],
        ['布尔', true],
    ])('%s 整体回退默认配置', (_label, input) => {
        expect(sanitizeConfig(input)).toEqual(DEFAULTS);
    });
});

describe('sanitizeConfig 字段级类型收敛', () => {
    it('类型不符的数字字段回退默认', () => {
        expect(
            sanitizeConfig({ pollIntervalSeconds: 'fast' })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ pollIntervalSeconds: Number.NaN })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ dynPollIntervalSeconds: 'slow' })
                .dynPollIntervalSeconds,
        ).toBe(300);
    });

    it('低于下限的数字被夹到下限而非回退默认', () => {
        // 字段声明了 min: 1, 故 0 / 负数夹到 1 (仍是有效轮询间隔)
        expect(
            sanitizeConfig({ pollIntervalSeconds: 0 })
                .pollIntervalSeconds,
        ).toBe(1);
        expect(
            sanitizeConfig({ pollIntervalSeconds: -5 })
                .pollIntervalSeconds,
        ).toBe(1);
        expect(
            sanitizeConfig({ dynPollIntervalSeconds: -1 })
                .dynPollIntervalSeconds,
        ).toBe(1);
        expect(
            sanitizeConfig({ mentionGroupSize: 0 }).mentionGroupSize,
        ).toBe(1);
    });

    it('合法值原样保留', () => {
        const cfg = sanitizeConfig({
            pollIntervalSeconds: 30,
            dynPollIntervalSeconds: 120,
            mentionGroupSize: 5,
        });
        expect(cfg.pollIntervalSeconds).toBe(30);
        expect(cfg.dynPollIntervalSeconds).toBe(120);
        expect(cfg.mentionGroupSize).toBe(5);
    });

    it('丢弃未知字段', () => {
        expect(sanitizeConfig({ hack: 'x' })).not.toHaveProperty(
            'hack',
        );
        // 已移除的旧字段同样被丢弃
        expect(sanitizeConfig({ enabled: true })).not.toHaveProperty(
            'enabled',
        );
        expect(
            sanitizeConfig({ groupConfigs: { '1': {} } }),
        ).not.toHaveProperty('groupConfigs');
    });
});

describe('sanitizeConfig adminUsers 多形态收敛', () => {
    it('逗号分隔字符串拆成数组, 去空白并剔除空段', () => {
        expect(
            sanitizeConfig({ adminUsers: '111, 222 ,, 333 ' })
                .adminUsers,
        ).toEqual(['111', '222', '333']);
    });

    it('数组元素统一转为字符串', () => {
        expect(
            sanitizeConfig({ adminUsers: [111, '222'] }).adminUsers,
        ).toEqual(['111', '222']);
    });

    it('数组中的空串被剔除', () => {
        expect(
            sanitizeConfig({ adminUsers: ['111', '', '  '] })
                .adminUsers,
        ).toEqual(['111']);
    });

    it('非字符串/数组时回退空名单', () => {
        expect(sanitizeConfig({ adminUsers: 42 }).adminUsers).toEqual(
            [],
        );
        expect(sanitizeConfig({}).adminUsers).toEqual([]);
    });
});

describe('sanitizeConfig pushTypes 取值收敛', () => {
    it('剔除不在有效集合内的取值', () => {
        expect(
            sanitizeConfig({
                pushTypes: ['start_stream', 'bogus', 'end_stream'],
            }).pushTypes,
        ).toEqual(['start_stream', 'end_stream']);
    });

    it('剔除不是字符串的元素', () => {
        expect(
            sanitizeConfig({ pushTypes: [1, 'end_stream', null] })
                .pushTypes,
        ).toEqual(['end_stream']);
    });

    it('空数组表示不推送任何类型, 不回退默认', () => {
        // 与"字段缺失"语义不同: 缺失才是"没配过", 用默认全量
        expect(sanitizeConfig({ pushTypes: [] }).pushTypes).toEqual(
            [],
        );
    });

    it('非数组时回退默认全量', () => {
        expect(
            sanitizeConfig({ pushTypes: 'start_stream' }).pushTypes,
        ).toEqual(DEFAULTS.pushTypes);
        expect(sanitizeConfig({}).pushTypes).toEqual(
            DEFAULTS.pushTypes,
        );
    });
});

describe('sanitizeConfig triggerModes 取值收敛', () => {
    it('剔除非法触发方式, 保留合法的', () => {
        expect(
            sanitizeConfig({
                triggerModes: ['prefix', 'bogus', 'atBot'],
            }).triggerModes,
        ).toEqual(['prefix', 'atBot']);
    });

    it('空数组表示任何消息都不触发, 不回退默认', () => {
        expect(
            sanitizeConfig({ triggerModes: [] }).triggerModes,
        ).toEqual([]);
    });

    it('非数组时回退默认', () => {
        expect(
            sanitizeConfig({ triggerModes: 'prefix' }).triggerModes,
        ).toEqual(DEFAULTS.triggerModes);
    });
});
