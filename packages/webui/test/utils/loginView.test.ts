/**
 * 登录块视图解析 (纯函数)
 *
 * 合同: 状态映射与按钮可用性见 docs/webui-config-pattern.md 的登录 kind 一节。
 */

import type { LoginSessionSnapshot, LoginStatus } from 'shared';
import { describe, expect, it } from 'vitest';
import { resolveLoginView } from '../../src/utils/loginView';

const LOGGED_OUT: LoginStatus = {
    loggedIn: false,
    cookieExpired: false,
    user: null,
    loginTime: null,
};

const LOGGED_IN: LoginStatus = {
    loggedIn: true,
    cookieExpired: false,
    user: { uid: '1', name: '测试', avatar: 'https://x/a.png' },
    loginTime: 1,
};

const session = (
    patch: Partial<LoginSessionSnapshot> = {},
): LoginSessionSnapshot => ({
    status: 'waiting',
    active: true,
    source: 'webui',
    refreshed: 0,
    qrVersion: 1,
    hasQr: true,
    message: '请使用 B 站手机客户端扫码登录',
    ...patch,
});

const view = (
    input: Partial<Parameters<typeof resolveLoginView>[0]> = {},
) =>
    resolveLoginView({
        loading: false,
        account: LOGGED_OUT,
        accountFailed: false,
        session: null,
        description: '仅动态/视频监听需要登录',
        ...input,
    });

describe('resolveLoginView 账号态', () => {
    it('加载中', () => {
        const result = view({ loading: true, account: null });
        expect(result.kind).toBe('loading');
        expect(result.action).toBeNull();
    });

    it('账号态查询失败可重试', () => {
        const result = view({ accountFailed: true, account: null });
        expect(result.kind).toBe('account-error');
        expect(result.action).toEqual({
            label: '重试',
            kind: 'retry',
        });
    });

    it('已登录时展示账号卡片', () => {
        expect(view({ account: LOGGED_IN }).kind).toBe('logged-in');
    });

    it('未登录时空闲态展示说明与扫码按钮', () => {
        const result = view();
        expect(result.kind).toBe('idle');
        expect(result.message).toBe('仅动态/视频监听需要登录');
        expect(result.action).toEqual({
            label: '扫码登录',
            kind: 'start',
        });
    });
});

describe('resolveLoginView 扫码会话', () => {
    it('WebUI 会话待扫码: 展示二维码且允许刷新', () => {
        const result = view({ session: session() });
        expect(result.kind).toBe('waiting');
        expect(result.showQr).toBe(true);
        expect(result.action).toEqual({
            label: '刷新二维码',
            kind: 'refresh',
        });
        expect(result.actionDisabled).toBe(false);
    });

    it('二维码尚未生成: 刷新禁用且不展示图片', () => {
        const result = view({ session: session({ hasQr: false }) });
        expect(result.kind).toBe('generating');
        expect(result.showQr).toBe(false);
        expect(result.actionDisabled).toBe(true);
    });

    it('已扫码待确认: 刷新禁用', () => {
        const result = view({
            session: session({
                status: 'scanned',
                message: '请确认',
            }),
        });
        expect(result.kind).toBe('scanned');
        expect(result.actionDisabled).toBe(true);
    });

    it('指令发起的会话: 刷新禁用并提示', () => {
        const result = view({
            session: session({ source: 'instruction' }),
        });
        expect(result.actionDisabled).toBe(true);
        expect(result.hint).toContain('私聊发起的登录流程进行中');
    });

    it('过期终态: 提供重新获取入口', () => {
        const result = view({
            session: session({
                status: 'expired',
                active: false,
                hasQr: false,
                message: '二维码已失效, 请重新获取',
            }),
        });
        expect(result.kind).toBe('expired');
        expect(result.action).toEqual({
            label: '重新获取二维码',
            kind: 'start',
        });
    });

    it('出错终态: 提供重新获取入口', () => {
        const result = view({
            session: session({ status: 'error', active: false }),
        });
        expect(result.kind).toBe('error');
        expect(result.action?.kind).toBe('start');
    });

    it('进行中的会话优先于账号态', () => {
        const result = view({
            account: LOGGED_IN,
            session: session({ source: 'instruction' }),
        });
        expect(result.kind).toBe('waiting');
        expect(result.hint).not.toBeNull();
    });
});
