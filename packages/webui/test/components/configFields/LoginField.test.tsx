// @vitest-environment happy-dom
/**
 * LoginField 行为
 *
 * 合同: 扫码入口 / 会话接管 / 刷新禁用 / 登出二次确认, 见 docs/webui-config-pattern.md。
 */

import {
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import type { LoginSessionSnapshot, LoginStatus } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginField from '../../../src/components/configFields/LoginField';

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    url: vi.fn((path: string) => path),
}));

vi.mock('../../../src/utils/api', () => ({
    noAuthFetch: mocks.fetch,
    noAuthUrl: mocks.url,
}));

const FIELD = {
    kind: 'login' as const,
    description: '仅动态/视频监听需要登录',
};

const LOGGED_OUT: LoginStatus = {
    loggedIn: false,
    cookieExpired: false,
    user: null,
    loginTime: null,
};

const LOGGED_IN: LoginStatus = {
    loggedIn: true,
    cookieExpired: false,
    user: {
        uid: '10001',
        name: '测试用户',
        avatar: 'https://example.com/a.png',
    },
    loginTime: 1,
};

const IDLE_SESSION: LoginSessionSnapshot = {
    status: 'expired',
    active: false,
    source: 'webui',
    refreshed: 0,
    qrVersion: 0,
    hasQr: false,
    message: '当前没有进行中的登录流程',
};

const ACTIVE_SESSION: LoginSessionSnapshot = {
    status: 'waiting',
    active: true,
    source: 'webui',
    refreshed: 0,
    qrVersion: 7,
    hasQr: true,
    message: '请使用 B 站手机客户端扫码登录',
};

/** 按路径返回预设响应, POST 返回指定快照 */
function mockApi(options: {
    status: LoginStatus;
    session?: LoginSessionSnapshot;
    postSession?: LoginSessionSnapshot;
    onLogout?: () => void;
}) {
    mocks.fetch.mockImplementation(
        async (path: string, init?: RequestInit) => {
            if (init?.method === 'POST') {
                if (path === '/logout') {
                    options.onLogout?.();
                    return { code: 0 };
                }
                return {
                    code: 0,
                    data: options.postSession ?? ACTIVE_SESSION,
                };
            }
            if (path === '/login/status') {
                return { code: 0, data: options.status };
            }
            if (path === '/login/qrcode/poll') {
                return {
                    code: 0,
                    data: options.session ?? IDLE_SESSION,
                };
            }
            return { code: 0 };
        },
    );
}

describe('LoginField', () => {
    beforeEach(() => {
        mocks.fetch.mockReset();
        mocks.url.mockClear();
    });

    it('未登录: 展示说明与扫码入口', async () => {
        mockApi({ status: LOGGED_OUT });
        render(<LoginField field={FIELD} />);

        expect(
            await screen.findByText('仅动态/视频监听需要登录'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '扫码登录' }),
        ).toBeEnabled();
    });

    it('点击扫码登录后发起会话', async () => {
        mockApi({ status: LOGGED_OUT });
        render(<LoginField field={FIELD} />);

        fireEvent.click(
            await screen.findByRole('button', { name: '扫码登录' }),
        );

        await waitFor(() =>
            expect(mocks.fetch).toHaveBeenCalledWith(
                '/login/qrcode',
                {
                    method: 'POST',
                },
            ),
        );
    });

    it('接管进行中的会话并展示二维码', async () => {
        mockApi({ status: LOGGED_OUT, session: ACTIVE_SESSION });
        render(<LoginField field={FIELD} />);

        const qr = await screen.findByAltText('B 站登录二维码');
        expect(qr.getAttribute('src')).toContain(
            '/login/qrcode/image?v=7',
        );
        expect(
            screen.getByRole('button', { name: '刷新二维码' }),
        ).toBeEnabled();
    });

    it('指令发起的会话: 刷新禁用并提示', async () => {
        mockApi({
            status: LOGGED_OUT,
            session: { ...ACTIVE_SESSION, source: 'instruction' },
        });
        render(<LoginField field={FIELD} />);

        expect(
            await screen.findByText(/私聊发起的登录流程进行中/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '刷新二维码' }),
        ).toBeDisabled();
    });

    it('已登录: 展示账号信息, 登出需二次确认', async () => {
        const onLogout = vi.fn();
        mockApi({ status: LOGGED_IN, onLogout });
        render(<LoginField field={FIELD} />);

        expect(
            await screen.findByText('测试用户'),
        ).toBeInTheDocument();
        expect(screen.getByText('UID: 10001')).toBeInTheDocument();
        expect(screen.queryByText(/登录于/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '登出' }));
        expect(
            screen.getByRole('button', { name: '确认登出' }),
        ).toBeInTheDocument();
        expect(onLogout).not.toHaveBeenCalled();

        fireEvent.click(
            screen.getByRole('button', { name: '确认登出' }),
        );
        await waitFor(() => expect(onLogout).toHaveBeenCalled());
    });

    it('Cookie 有效但用户信息缺失时仍展示已登录卡片', async () => {
        mockApi({ status: { ...LOGGED_IN, user: null } });
        render(<LoginField field={FIELD} />);

        expect(
            await screen.findByText('用户信息获取失败'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '登出' }),
        ).toBeInTheDocument();
    });

    it('会话进行到过期后展示重新获取入口', async () => {
        let pollCount = 0;
        mocks.fetch.mockImplementation(
            async (path: string, init?: RequestInit) => {
                if (init?.method === 'POST') {
                    return { code: 0, data: ACTIVE_SESSION };
                }
                if (path === '/login/status') {
                    return { code: 0, data: LOGGED_OUT };
                }
                if (path === '/login/qrcode/poll') {
                    pollCount++;
                    return {
                        code: 0,
                        data:
                            pollCount === 1
                                ? ACTIVE_SESSION
                                : {
                                      ...ACTIVE_SESSION,
                                      status: 'expired',
                                      active: false,
                                      hasQr: false,
                                      message:
                                          '二维码已失效, 请重新获取',
                                  },
                    };
                }
                return { code: 0 };
            },
        );

        render(<LoginField field={FIELD} />);

        expect(
            await screen.findByText('二维码已失效, 请重新获取'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '重新获取二维码' }),
        ).toBeEnabled();
    });
});
