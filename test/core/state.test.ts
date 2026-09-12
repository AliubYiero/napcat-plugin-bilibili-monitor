/**
 * 配置清洗测试
 *
 * 清洗是配置全链路唯一的外部输入收口 (铁律: 一切外部输入的配置写回
 * 必须经过 sanitizeConfig)。这里断言的是"输入什么配置、得到什么配置",
 * 不关心清洗内部的判定顺序。
 *
 * 期望值一律写字面量, 不引用 DEFAULT_CONFIG / VALID_PUSH_TYPES——
 * 引用它们等于让断言重算一遍被测代码的输入, 那样改了默认值测试也不会红。
 * 字面量来自 src/config.ts 的声明, 属独立于清洗实现的规格。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeConfig } from '../../src/core/state';

/** 清洗函数在输入缺失/非法时应回填的完整默认值 */
const DEFAULTS = {
    enabled: true,
    debug: false,
    commandPrefix: '#bili',
    groupConfigs: {},
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
    adminUsers: [],
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
    it('类型不符的布尔字段回退默认, 不被强制转换', () => {
        // 字符串 'false' 是真值, 若被强制转换会意外关掉插件
        expect(sanitizeConfig({ enabled: 'false' }).enabled).toBe(
            true,
        );
        expect(sanitizeConfig({ debug: 1 }).debug).toBe(false);
    });

    it('类型不符的字符串字段回退默认', () => {
        expect(sanitizeConfig({ commandPrefix: 123 }).commandPrefix)
            .toBe('#bili');
    });

    it('非正数的轮询间隔回退默认', () => {
        expect(
            sanitizeConfig({ pollIntervalSeconds: 0 })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ pollIntervalSeconds: -5 })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ pollIntervalSeconds: Number.NaN })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ pollIntervalSeconds: 'fast' })
                .pollIntervalSeconds,
        ).toBe(60);
        expect(
            sanitizeConfig({ dynPollIntervalSeconds: -1 })
                .dynPollIntervalSeconds,
        ).toBe(300);
    });

    it('合法值原样保留', () => {
        const cfg = sanitizeConfig({
            enabled: false,
            debug: true,
            commandPrefix: '#x',
            pollIntervalSeconds: 30,
            dynPollIntervalSeconds: 120,
        });
        expect(cfg.enabled).toBe(false);
        expect(cfg.debug).toBe(true);
        expect(cfg.commandPrefix).toBe('#x');
        expect(cfg.pollIntervalSeconds).toBe(30);
        expect(cfg.dynPollIntervalSeconds).toBe(120);
    });

    it('丢弃未知字段', () => {
        expect(sanitizeConfig({ hack: 'x' })).not.toHaveProperty(
            'hack',
        );
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

    it('兼容旧字段名 adminUser', () => {
        expect(
            sanitizeConfig({ adminUser: '111,222' }).adminUsers,
        ).toEqual(['111', '222']);
    });

    it('新字段名优先于旧字段名', () => {
        expect(
            sanitizeConfig({
                adminUsers: '111',
                adminUser: '999',
            }).adminUsers,
        ).toEqual(['111']);
    });

    it('两者皆非字符串或数组时回退空名单', () => {
        expect(
            sanitizeConfig({ adminUsers: 42 }).adminUsers,
        ).toEqual([]);
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

describe('sanitizeConfig 群配置收敛', () => {
    it('保留显式 false 的会话级开关', () => {
        const cfg = sanitizeConfig({
            groupConfigs: { '123': { enabled: false } },
        });
        expect(cfg.groupConfigs['123'].enabled).toBe(false);
    });

    it('非布尔的开关被丢弃而非留作可疑真值', () => {
        // 消费侧按 enabled !== false 判定, 留下字符串 'no' 会被当成启用
        const cfg = sanitizeConfig({
            groupConfigs: { '123': { enabled: 'no' } },
        });
        expect(cfg.groupConfigs['123']).not.toHaveProperty(
            'enabled',
        );
    });

    it('丢弃非对象的群配置项', () => {
        const cfg = sanitizeConfig({
            groupConfigs: { '123': 'nope', '456': null },
        });
        expect(cfg.groupConfigs).toEqual({});
    });

    it('群配置非对象时收敛为空表', () => {
        expect(
            sanitizeConfig({ groupConfigs: null }).groupConfigs,
        ).toEqual({});
        expect(
            sanitizeConfig({ groupConfigs: [] }).groupConfigs,
        ).toEqual({});
        expect(sanitizeConfig({}).groupConfigs).toEqual({});
    });
});
