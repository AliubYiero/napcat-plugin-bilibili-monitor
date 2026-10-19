/**
 * SessionConfigService 会话配置查询/写入
 *
 * 默认开启语义: 缺记录即视为启用, 仅显式 enabled:false 才禁用。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { sessionConfigService } from '../../src/services/sessionConfigService';
import { SessionConfigStore } from '../../src/store/sessionConfigStore';
import { resetFakeState } from '../helpers/pluginState';

beforeEach(() => {
    resetFakeState();
    SessionConfigStore.getInstance().reset();
});

describe('isSessionEnabled 默认开启', () => {
    it('缺记录的群视为启用', () => {
        expect(
            sessionConfigService.isSessionEnabled('1', 'group'),
        ).toBe(true);
        expect(sessionConfigService.isGroupEnabled('1')).toBe(true);
    });

    it('缺记录的私聊视为启用', () => {
        expect(
            sessionConfigService.isSessionEnabled('1', 'private'),
        ).toBe(true);
    });

    it('显式禁用后返回 false', () => {
        sessionConfigService.setSessionEnabled('1', 'group', false);
        expect(sessionConfigService.isGroupEnabled('1')).toBe(false);
        expect(
            sessionConfigService.isSessionEnabled('1', 'private'),
        ).toBe(true);
    });

    it('禁用后再启用恢复默认', () => {
        sessionConfigService.setSessionEnabled('1', 'group', false);
        sessionConfigService.setSessionEnabled('1', 'group', true);
        expect(sessionConfigService.isGroupEnabled('1')).toBe(true);
    });
});

describe('isLiveMentionAllEnabled 默认关闭', () => {
    it('缺记录返回 false', () => {
        expect(
            sessionConfigService.isLiveMentionAllEnabled('1'),
        ).toBe(false);
    });

    it('开启后返回 true', () => {
        sessionConfigService.setLiveMentionAll('1', true);
        expect(
            sessionConfigService.isLiveMentionAllEnabled('1'),
        ).toBe(true);
    });

    it('与启用开关相互独立', () => {
        sessionConfigService.setSessionEnabled('1', 'group', false);
        sessionConfigService.setLiveMentionAll('1', true);
        expect(sessionConfigService.isGroupEnabled('1')).toBe(false);
        expect(
            sessionConfigService.isLiveMentionAllEnabled('1'),
        ).toBe(true);
    });
});

describe('批量设置', () => {
    it('一次禁用多个会话', () => {
        sessionConfigService.setSessionsEnabled(
            ['1', '2', '3'],
            'group',
            false,
        );
        expect(sessionConfigService.isGroupEnabled('1')).toBe(false);
        expect(sessionConfigService.isGroupEnabled('2')).toBe(false);
        expect(sessionConfigService.isGroupEnabled('3')).toBe(false);
    });
});
