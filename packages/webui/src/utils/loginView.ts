/**
 * 登录块视图解析 (纯函数)
 *
 * 把「账号态 + 扫码会话」映射为一份可直接渲染的视图模型:
 *   - 状态种类、文案、二维码是否展示、按钮文案与可用性
 *
 * 组件只负责取数与编排, 判定集中在这里, 便于单测。
 */

import type { LoginSessionSnapshot, LoginStatus } from 'shared';

export type LoginViewKind =
    | 'loading'
    | 'account-error'
    | 'logged-in'
    | 'idle'
    | 'generating'
    | 'waiting'
    | 'scanned'
    | 'expired'
    | 'error';

export interface LoginViewAction {
    /** 按钮文案 */
    label: string;
    /** 触发的动作: 开始会话 / 刷新会话 / 重试账号查询 */
    kind: 'start' | 'refresh' | 'retry';
}

export interface LoginView {
    kind: LoginViewKind;
    /** 主文案 */
    message: string;
    /** 附加提示 (如指令会话进行中) */
    hint: string | null;
    /** 是否展示二维码 */
    showQr: boolean;
    /** 主操作按钮 (无操作时为 null) */
    action: LoginViewAction | null;
    /** 主操作是否禁用 (已扫码待确认 / 指令会话进行中) */
    actionDisabled: boolean;
}

export interface LoginViewInput {
    /** 账号态是否仍在加载 */
    loading: boolean;
    /** 账号态 (加载失败时为 null) */
    account: LoginStatus | null;
    /** 账号态查询是否失败 */
    accountFailed: boolean;
    /** 本次页面会话内的扫码会话 (无会话时为 null) */
    session: LoginSessionSnapshot | null;
    /** 未登录时的说明文案 (来自 login 描述符) */
    description: string;
}

/** 指令会话进行中的提示 (此时 WebUI 不允许刷新) */
const INSTRUCTION_HINT = '私聊发起的登录流程进行中, 请等待其结束';

/** 解析登录块视图 */
export function resolveLoginView(input: LoginViewInput): LoginView {
    const { loading, account, accountFailed, session, description } =
        input;

    if (loading) {
        return {
            kind: 'loading',
            message: '正在获取登录状态...',
            hint: null,
            showQr: false,
            action: null,
            actionDisabled: true,
        };
    }

    if (accountFailed || !account) {
        return {
            kind: 'account-error',
            message: '获取登录状态失败',
            hint: null,
            showQr: false,
            action: { label: '重试', kind: 'retry' },
            actionDisabled: false,
        };
    }

    // 进行中的扫码会话优先于账号态 (含指令发起的会话, 此时需如实展示)
    if (session?.active) {
        const instruction = session.source === 'instruction';
        const hint = instruction ? INSTRUCTION_HINT : null;

        if (session.status === 'scanned') {
            return {
                kind: 'scanned',
                message: session.message,
                hint,
                showQr: session.hasQr,
                action: { label: '刷新二维码', kind: 'refresh' },
                actionDisabled: true,
            };
        }

        if (session.status === 'waiting' && session.hasQr) {
            return {
                kind: 'waiting',
                message: session.message,
                hint,
                showQr: true,
                action: { label: '刷新二维码', kind: 'refresh' },
                actionDisabled: instruction,
            };
        }

        // 会话已开始但二维码尚未生成
        return {
            kind: 'generating',
            message: session.message,
            hint,
            showQr: false,
            action: { label: '刷新二维码', kind: 'refresh' },
            actionDisabled: true,
        };
    }

    // 本次页面会话内刚结束的失败终态
    if (session && session.status !== 'success') {
        return {
            kind: session.status === 'error' ? 'error' : 'expired',
            message: session.message,
            hint: null,
            showQr: false,
            action: { label: '重新获取二维码', kind: 'start' },
            actionDisabled: false,
        };
    }

    if (account.loggedIn) {
        return {
            kind: 'logged-in',
            message: '',
            hint: null,
            showQr: false,
            action: null,
            actionDisabled: true,
        };
    }

    return {
        kind: 'idle',
        message: description,
        hint: null,
        showQr: false,
        action: { label: '扫码登录', kind: 'start' },
        actionDisabled: false,
    };
}
