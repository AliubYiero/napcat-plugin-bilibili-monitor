/**
 * `@机器人` 触发判定 (纯函数)
 *
 * 覆盖: at 段剥离 (引号/属性顺序/额外属性/非本机/仅第一个)、
 * 触发方式相互独立、未启用即不触发、大小写与空白。
 */

import { describe, expect, it } from 'vitest';
import {
    resolveTriggerCommand,
    stripAtBotPrefix,
} from '../../src/utils/atBotPrefix';

const SELF = '10000';

describe('stripAtBotPrefix', () => {
    it('剥离开头匹配 selfId 的 at 段', () => {
        expect(
            stripAtBotPrefix(`[CQ:at,qq=${SELF}] help`, SELF),
        ).toBe(' help');
    });

    it('qq 带双引号/单引号/无引号均可', () => {
        expect(
            stripAtBotPrefix(`[CQ:at,qq="${SELF}"] help`, SELF),
        ).toBe(' help');
        expect(
            stripAtBotPrefix(`[CQ:at,qq='${SELF}'] help`, SELF),
        ).toBe(' help');
    });

    it('属性顺序不限且允许额外属性', () => {
        expect(
            stripAtBotPrefix(
                `[CQ:at,name=bot,qq=${SELF}] help`,
                SELF,
            ),
        ).toBe(' help');
        expect(
            stripAtBotPrefix(
                `[CQ:at,qq=${SELF},name=bot] help`,
                SELF,
            ),
        ).toBe(' help');
    });

    it('CQ 标记大小写不敏感', () => {
        expect(
            stripAtBotPrefix(`[cq:at,qq=${SELF}] help`, SELF),
        ).toBe(' help');
    });

    it('非本机 at 段不动', () => {
        expect(stripAtBotPrefix('[CQ:at,qq=20000] help', SELF)).toBe(
            '[CQ:at,qq=20000] help',
        );
    });

    it('只剥离开头第一个 at 段, 后续保留', () => {
        expect(
            stripAtBotPrefix(
                `[CQ:at,qq=${SELF}][CQ:at,qq=20000] help`,
                SELF,
            ),
        ).toBe('[CQ:at,qq=20000] help');
    });

    it('selfId 为空时原样返回', () => {
        const raw = `[CQ:at,qq=${SELF}] help`;
        expect(stripAtBotPrefix(raw, '')).toBe(raw);
    });

    it('开头不是 at 段时原样返回', () => {
        const raw = `help [CQ:at,qq=${SELF}]`;
        expect(stripAtBotPrefix(raw, SELF)).toBe(raw);
    });
});

describe('resolveTriggerCommand', () => {
    it('prefix 方式识别普通前缀消息', () => {
        expect(
            resolveTriggerCommand('#bili live list', SELF, [
                'prefix',
            ]),
        ).toBe(' live list');
    });

    it('prefix 方式不识别 @机器人 消息', () => {
        expect(
            resolveTriggerCommand(
                `[CQ:at,qq=${SELF}] #bili live list`,
                SELF,
                ['prefix'],
            ),
        ).toBeNull();
    });

    it('atBot 方式识别 @机器人 + 前缀', () => {
        expect(
            resolveTriggerCommand(
                `[CQ:at,qq=${SELF}] #bili live list`,
                SELF,
                ['atBot'],
            ),
        ).toBe(' live list');
    });

    it('atBot 方式不识别不带 @ 的普通前缀消息', () => {
        expect(
            resolveTriggerCommand('#bili live list', SELF, ['atBot']),
        ).toBeNull();
    });

    it('atBot 方式下 @ 之后没有前缀不触发', () => {
        expect(
            resolveTriggerCommand(
                `[CQ:at,qq=${SELF}] live list`,
                SELF,
                ['atBot'],
            ),
        ).toBeNull();
    });

    it('两种方式同时启用时各自都能触发', () => {
        const modes = ['prefix', 'atBot'] as const;
        expect(resolveTriggerCommand('#bili help', SELF, modes)).toBe(
            ' help',
        );
        expect(
            resolveTriggerCommand(
                `[CQ:at,qq=${SELF}] #bili help`,
                SELF,
                modes,
            ),
        ).toBe(' help');
    });

    it('两种方式都未启用时恒不触发', () => {
        expect(
            resolveTriggerCommand('#bili help', SELF, []),
        ).toBeNull();
        expect(
            resolveTriggerCommand(
                `[CQ:at,qq=${SELF}] #bili help`,
                SELF,
                [],
            ),
        ).toBeNull();
    });

    it('前后空白不影响判定', () => {
        expect(
            resolveTriggerCommand('  #bili help  ', SELF, ['prefix']),
        ).toBe(' help');
    });
});
