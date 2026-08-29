/**
 * B 站登录状态查询指令 (#bili user status)
 *
 * 仅超级管理员私聊可用: 输出当前登录状态 (未登录 / 已登录用户信息)
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from '../message.handler';
import { biliCookieStore } from '../../store/bili-cookie.store';
import { formatTime } from '../../utils/format';

export const statusHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<void> => {
    const store = biliCookieStore;

    if (!store.has()) {
        await sendReply(ctx, event, '当前未登录 B 站账号\n请私聊机器人发送 #bili user login 扫码登录');
        return;
    }

    const lines: string[] = [];
    const user = store.getUser();
    if (user) {
        lines.push(`登录用户: ${user.name} (${user.uid})`);
    } else {
        lines.push('登录用户: 未知 (缺少用户信息, 可能登录流程未完成)');
    }

    const loginTime = store.getLoginTime();
    if (loginTime) {
        lines.push(`登录时间: ${formatTime(loginTime)}`);
    }

    if (store.isExpired()) {
        lines.push('Cookie 状态: 已失效, 请私聊机器人发送 #bili user login 重新登录');
    } else {
        lines.push('Cookie 状态: 有效');
    }

    await sendReply(ctx, event, lines.join('\n'));
};
