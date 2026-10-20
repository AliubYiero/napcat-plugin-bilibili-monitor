/**
 * 登录块 (kind: login)
 *
 * 自包含的运行时控件: 自行获取账号态、承担扫码会话轮询, 不参与配置落盘。
 * 视图判定集中在纯函数 `utils/loginView.ts`。
 */

import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {
    LoginFieldDescriptor,
    LoginSessionSnapshot,
    LoginStatus,
} from 'shared';
import { showToast } from '../../hooks/useToast';
import { noAuthFetch, noAuthUrl } from '../../utils/api';
import {
    type LoginViewKind,
    resolveLoginView,
} from '../../utils/loginView';
import { IconAlert, IconRefresh } from '../Icons';

/** 扫码会话轮询间隔 (与后端轮询节奏一致) */
const POLL_INTERVAL_MS = 2000;

/** 行内二次确认的自动复原时长 */
const CONFIRM_RESET_MS = 5000;

/** 会话态视图 (用于挑图标与排版) */
const SESSION_KINDS: ReadonlySet<LoginViewKind> = new Set([
    'generating',
    'waiting',
    'scanned',
    'expired',
    'error',
]);

/** 会话态的胶囊文案 */
const SESSION_BADGES: Partial<Record<LoginViewKind, string>> = {
    generating: '生成中',
    waiting: '待扫码',
    scanned: '已扫码',
    expired: '已失效',
    error: '出错',
};

const CARD_CLASS =
    'rounded-2xl border border-[#FB7299]/25 bg-gradient-to-br from-[#fff5f8] to-[#ffe9f0] p-5 shadow-[0_4px_16px_rgba(251,114,153,0.08)] dark:border-[#FB7299]/20 dark:from-[#2a1c22] dark:to-[#241a1f]';
const ICON_BOX_CLASS =
    'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FB7299] to-[#FC9DB8] shadow-[0_4px_10px_rgba(251,114,153,0.3)]';
const TITLE_CLASS =
    'text-[15px] font-bold text-[#d6336c] dark:text-[#f49ab5]';
const DESC_CLASS =
    'text-[13px] leading-relaxed text-[#8b5566] dark:text-[#c9a3b0]';
const ACTION_CLASS =
    'inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-br from-[#FB7299] to-[#ff8fb3] px-[18px] py-2 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(251,114,153,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';
const GHOST_BUTTON_CLASS =
    'rounded-lg border border-[#FB7299]/30 px-3 py-1.5 text-xs font-semibold text-[#d6336c] transition hover:bg-[#FB7299]/10 disabled:opacity-50 dark:text-[#f49ab5]';
const CONFIRM_BUTTON_CLASS =
    'rounded-lg bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#e64444] disabled:opacity-50';
const CODE_CLASS =
    'rounded-[5px] bg-[#FB7299]/[0.12] px-1.5 py-0.5 font-mono text-xs text-[#d6336c] dark:text-[#f49ab5]';

/** 状态胶囊 */
function LoginBadge({
    children,
    tone = 'pink',
}: {
    children: ReactNode;
    tone?: 'pink' | 'red';
}) {
    const toneClass =
        tone === 'red'
            ? 'bg-[#ff4d4f] text-white'
            : 'bg-[#FB7299]/[0.12] text-[#FB7299] dark:text-[#f49ab5]';
    return (
        <span
            className={`inline-block whitespace-nowrap rounded-full px-2.5 py-[1px] text-[11px] font-semibold leading-[18px] ${toneClass}`}
        >
            {children}
        </span>
    );
}

/** B 站账号图标 (与原生面板同一图形) */
function BiliIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <title>B 站账号</title>
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
        </svg>
    );
}

/** 从 noAuthFetch 抛出的错误文本中提取后端 message */
function errorMessage(error: unknown): string {
    if (!(error instanceof Error)) return '操作失败';
    try {
        const parsed = JSON.parse(error.message) as {
            message?: unknown;
        };
        if (typeof parsed.message === 'string') return parsed.message;
    } catch {
        /* 非 JSON 响应, 直接用原文 */
    }
    return error.message || '操作失败';
}

export default function LoginField({
    field,
}: {
    field: LoginFieldDescriptor;
}) {
    const description =
        field.description ?? '仅动态 / 视频监听需要登录后使用';

    const [account, setAccount] = useState<LoginStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [accountFailed, setAccountFailed] = useState(false);
    const [session, setSession] =
        useState<LoginSessionSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmingLogout, setConfirmingLogout] = useState(false);
    const [visible, setVisible] = useState(() => !document.hidden);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const fetchAccount = useCallback(async () => {
        setLoading(true);
        try {
            const res =
                await noAuthFetch<LoginStatus>('/login/status');
            if (!mounted.current) return;
            if (res.code === 0 && res.data) {
                setAccount(res.data);
                setAccountFailed(false);
            } else {
                setAccountFailed(true);
            }
        } catch {
            if (mounted.current) setAccountFailed(true);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    // 首次进入: 拉账号态, 并接管已在进行的扫码会话 (如私聊指令发起)
    useEffect(() => {
        void fetchAccount();
        void (async () => {
            try {
                const res = await noAuthFetch<LoginSessionSnapshot>(
                    '/login/qrcode/poll',
                );
                if (!mounted.current) return;
                if (res.code === 0 && res.data?.active) {
                    setSession(res.data);
                }
            } catch {
                /* 无会话或请求失败: 保持空闲态 */
            }
        })();
    }, [fetchAccount]);

    // 标签页可见性: 隐藏时暂停轮询, 恢复时立刻补一次
    useEffect(() => {
        const onVisibilityChange = () => setVisible(!document.hidden);
        document.addEventListener(
            'visibilitychange',
            onVisibilityChange,
        );
        return () =>
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange,
            );
    }, []);

    // 扫码轮询: 仅会话进行中且页面可见时运行
    useEffect(() => {
        if (!session?.active || !visible) return;

        let cancelled = false;
        const tick = async () => {
            try {
                const res = await noAuthFetch<LoginSessionSnapshot>(
                    '/login/qrcode/poll',
                );
                if (cancelled || !mounted.current) return;
                const next = res.data;
                if (!next) return;

                if (next.active) {
                    setSession(next);
                    return;
                }

                // 终态: 成功则切回账号卡片, 失败则就地展示
                if (next.status === 'success') {
                    setSession(null);
                    showToast('登录成功', 'success');
                    await fetchAccount();
                } else {
                    setSession(next);
                }
            } catch {
                /* 网络抖动: 下轮重试 */
            }
        };

        void tick();
        const timer = setInterval(() => {
            void tick();
        }, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [session?.active, visible, fetchAccount]);

    // 二次确认超时自动复原
    useEffect(() => {
        if (!confirmingLogout) return;
        const timer = setTimeout(
            () => setConfirmingLogout(false),
            CONFIRM_RESET_MS,
        );
        return () => clearTimeout(timer);
    }, [confirmingLogout]);

    const runAction = useCallback(
        async (kind: 'start' | 'refresh' | 'retry') => {
            if (kind === 'retry') {
                await fetchAccount();
                return;
            }

            setBusy(true);
            try {
                const res = await noAuthFetch<LoginSessionSnapshot>(
                    kind === 'refresh'
                        ? '/login/qrcode/refresh'
                        : '/login/qrcode',
                    { method: 'POST' },
                );
                if (res.data?.active) setSession(res.data);
            } catch (error) {
                showToast(errorMessage(error), 'error');
            } finally {
                setBusy(false);
            }
        },
        [fetchAccount],
    );

    const handleLogout = useCallback(async () => {
        setBusy(true);
        try {
            await noAuthFetch('/logout', { method: 'POST' });
            setConfirmingLogout(false);
            setSession(null);
            showToast('已登出 B 站账号', 'success');
            await fetchAccount();
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setBusy(false);
        }
    }, [fetchAccount]);

    const view = useMemo(
        () =>
            resolveLoginView({
                loading,
                account,
                accountFailed,
                session,
                description,
            }),
        [loading, account, accountFailed, session, description],
    );

    if (view.kind === 'loading') {
        return (
            <div className={CARD_CLASS}>
                <div className="flex items-start gap-3.5">
                    <div className={ICON_BOX_CLASS}>
                        <div className="loading-spinner !h-4 !w-4 !border-2 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span className={TITLE_CLASS}>
                                B 站账号
                            </span>
                            <LoginBadge>加载中</LoginBadge>
                        </div>
                        <p className={DESC_CLASS}>{view.message}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (view.kind === 'account-error') {
        return (
            <div className={CARD_CLASS}>
                <div className="flex items-start gap-3.5">
                    <div className={ICON_BOX_CLASS}>
                        <IconAlert size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span className={TITLE_CLASS}>
                                B 站账号
                            </span>
                            <LoginBadge tone="red">
                                状态异常
                            </LoginBadge>
                        </div>
                        <p className={`${DESC_CLASS} mb-3.5`}>
                            {view.message}
                        </p>
                        <button
                            type="button"
                            className={ACTION_CLASS}
                            onClick={() =>
                                view.action &&
                                runAction(view.action.kind)
                            }
                        >
                            重试
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view.kind === 'logged-in' && account) {
        const user = account.user;
        return (
            <div className={CARD_CLASS}>
                <div className="flex items-start gap-3.5">
                    {user?.avatar ? (
                        <img
                            src={user.avatar}
                            alt=""
                            className="h-[42px] w-[42px] shrink-0 rounded-full border-2 border-[#FB7299]/35 bg-gray-200 object-cover dark:bg-gray-700"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#FB7299]/15">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-[#FB7299]"
                            >
                                <title>用户头像</title>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span
                                className={`${TITLE_CLASS} truncate`}
                            >
                                {user?.name ?? 'B 站账号已登录'}
                            </span>
                            <LoginBadge>已登录</LoginBadge>
                            {account.cookieExpired && (
                                <LoginBadge tone="red">
                                    Cookie 已失效
                                </LoginBadge>
                            )}
                        </div>
                        <p className={DESC_CLASS}>
                            {user
                                ? `UID: ${user.uid}`
                                : '用户信息获取失败'}
                        </p>
                        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-[#a86b7e] dark:text-[#c9a3b0]">
                                {account.cookieExpired
                                    ? 'Cookie 已失效, 请登出后重新扫码'
                                    : '如需切换账号, 请先登出'}
                            </p>
                            {confirmingLogout ? (
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        className={
                                            CONFIRM_BUTTON_CLASS
                                        }
                                        onClick={handleLogout}
                                        disabled={busy}
                                    >
                                        确认登出
                                    </button>
                                    <button
                                        type="button"
                                        className={GHOST_BUTTON_CLASS}
                                        onClick={() =>
                                            setConfirmingLogout(false)
                                        }
                                        disabled={busy}
                                    >
                                        取消
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className={GHOST_BUTTON_CLASS}
                                    onClick={() =>
                                        setConfirmingLogout(true)
                                    }
                                    disabled={busy}
                                >
                                    登出
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isSessionView = SESSION_KINDS.has(view.kind);
    const action = view.action;
    const ActionIcon =
        view.kind === 'generating' || view.kind === 'waiting'
            ? IconRefresh
            : null;

    return (
        <div className={CARD_CLASS}>
            <div className="flex items-start gap-3.5">
                <div className={ICON_BOX_CLASS}>
                    {isSessionView ? (
                        <IconRefresh
                            size={20}
                            className="text-white"
                        />
                    ) : (
                        <BiliIcon />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className={TITLE_CLASS}>B 站账号</span>
                        <LoginBadge
                            tone={
                                view.kind === 'expired' ||
                                view.kind === 'error'
                                    ? 'red'
                                    : 'pink'
                            }
                        >
                            {SESSION_BADGES[view.kind] ?? '未登录'}
                        </LoginBadge>
                    </div>
                    <p className={`${DESC_CLASS} mb-3.5`}>
                        {view.message}
                    </p>
                    {view.hint && (
                        <p className="mb-3.5 text-xs text-amber-600 dark:text-amber-400">
                            {view.hint}
                        </p>
                    )}

                    {view.showQr && session && (
                        <div className="mb-3.5 flex justify-center rounded-xl border border-[#FB7299]/15 bg-white p-2.5">
                            <img
                                src={noAuthUrl(
                                    `/login/qrcode/image?v=${session.qrVersion}`,
                                )}
                                alt="B 站登录二维码"
                                className="h-48 w-48"
                            />
                        </div>
                    )}

                    {action && (
                        <button
                            type="button"
                            className={ACTION_CLASS}
                            onClick={() => runAction(action.kind)}
                            disabled={busy || view.actionDisabled}
                        >
                            {ActionIcon && <ActionIcon size={14} />}
                            {action.label}
                        </button>
                    )}

                    {view.kind === 'idle' && (
                        <p className="mt-3 text-xs text-[#a86b7e] dark:text-[#c9a3b0]">
                            或私聊机器人发送{' '}
                            <code className={CODE_CLASS}>
                                #bili user login
                            </code>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
