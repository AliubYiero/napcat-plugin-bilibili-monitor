/**
 * 帮助面板搜索过滤与选中: 纯函数
 *
 * 范式: docs/webui-config-pattern.md 的帮助文档页。
 * 分组 / 方法 / 步骤粒度的文本过滤 + 搜索后选中首个有命中的面板。
 */

import { describe, expect, it } from 'vitest';
import type {
    Cmd,
    ContentHelp,
    InstructionSet,
} from '../../src/types';
import {
    filterCmd,
    filterContentHelp,
    filterInstructionSet,
    isInstructionSet,
    matches,
    resolveActivePanel,
    stripHtml,
} from '../../src/utils/helpFilter';

const INSTRUCTION_SET: InstructionSet = {
    groupName: '基础指令',
    instructions: [
        { cmd: '#cmd help', desc: '查看帮助' },
        { cmd: '#cmd ping', desc: '连通测试' },
    ],
};

const CONTENT_HELP: ContentHelp = {
    groupName: '图文指南',
    methods: [
        { name: '安装', steps: ['打开设置', '点击安装'] },
        { name: '配置', steps: [['第一步', '子步骤说明']] },
    ],
};

describe('isInstructionSet', () => {
    it('按 instructions 字段区分两种分组', () => {
        expect(isInstructionSet(INSTRUCTION_SET)).toBe(true);
        expect(isInstructionSet(CONTENT_HELP)).toBe(false);
    });
});

describe('stripHtml', () => {
    it('剥离内联 HTML 标签', () => {
        expect(stripHtml('<b>hi</b>')).toBe('hi');
    });
});

describe('matches', () => {
    it('大小写不敏感且剥离 HTML 后匹配', () => {
        expect(matches('<b>Hello</b>', 'hello')).toBe(true);
        expect(matches('查看帮助', 'ping')).toBe(false);
    });
});

describe('filterInstructionSet', () => {
    it('空查询原样返回', () => {
        expect(filterInstructionSet(INSTRUCTION_SET, '')).toBe(
            INSTRUCTION_SET,
        );
    });

    it('命中 groupName 保留整组', () => {
        expect(filterInstructionSet(INSTRUCTION_SET, '基础')).toBe(
            INSTRUCTION_SET,
        );
    });

    it('否则按 cmd / desc 过滤子项', () => {
        const out = filterInstructionSet(INSTRUCTION_SET, 'ping');
        expect(out?.instructions).toHaveLength(1);
        expect(out?.instructions[0].cmd).toBe('#cmd ping');
    });

    it('无命中返回 null', () => {
        expect(
            filterInstructionSet(INSTRUCTION_SET, 'zzz'),
        ).toBeNull();
    });
});

describe('filterContentHelp', () => {
    it('命中 groupName 保留整组', () => {
        expect(filterContentHelp(CONTENT_HELP, '图文')).toBe(
            CONTENT_HELP,
        );
    });

    it('命中方法名保留整个方法', () => {
        const out = filterContentHelp(CONTENT_HELP, '安装');
        expect(out?.methods).toHaveLength(1);
        expect(out?.methods[0].steps).toHaveLength(2);
    });

    it('命中步骤时过滤步骤 (含数组步骤 join 匹配)', () => {
        const out = filterContentHelp(CONTENT_HELP, '子步骤');
        expect(out?.methods).toHaveLength(1);
        expect(out?.methods[0].steps).toEqual([
            ['第一步', '子步骤说明'],
        ]);
    });

    it('无命中返回 null', () => {
        expect(filterContentHelp(CONTENT_HELP, 'zzz')).toBeNull();
    });
});

describe('filterCmd', () => {
    const CMD: Cmd = {
        id: 'p',
        title: '面板',
        cmd: [INSTRUCTION_SET, CONTENT_HELP],
    };

    it('汇总过滤后的分组', () => {
        const out = filterCmd(CMD, 'ping');
        expect(out.cmd).toHaveLength(1);
        expect(isInstructionSet(out.cmd[0])).toBe(true);
    });

    it('空查询保留全部分组', () => {
        expect(filterCmd(CMD, '').cmd).toEqual([
            INSTRUCTION_SET,
            CONTENT_HELP,
        ]);
    });
});

describe('resolveActivePanel', () => {
    it('无搜索词保持当前面板', () => {
        expect(resolveActivePanel([1, 2], 0, false)).toBe(0);
    });

    it('当前面板有命中则保持', () => {
        expect(resolveActivePanel([1, 2], 1, true)).toBe(1);
    });

    it('当前面板无命中则切首个有命中', () => {
        expect(resolveActivePanel([0, 2], 0, true)).toBe(1);
    });

    it('全无命中保持当前', () => {
        expect(resolveActivePanel([0, 0], 1, true)).toBe(1);
    });
});
