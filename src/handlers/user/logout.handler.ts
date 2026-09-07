/**
 * B 站登出指令 (#bili user logout)
 *
 * 仅超级管理员私聊可用: 清除本地 Cookie (不调用 B 站登出 API)
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sendReply } from '../utils';
import { BiliCookieStore } from '../../store/biliCookie.store';
import { loginService } from '../../services/user/login.service';

export const logoutHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<void> => {
    // 有登录流程进行中时先终止, 避免登出后又被写入 Cookie
    loginService.stop();

    const biliCookieStore = BiliCookieStore.getInstance();
    if (!biliCookieStore.has()) {
        await sendReply(ctx, event, '当前未登录');
        return;
    }

    const user = biliCookieStore.getUser();
    biliCookieStore.logout();
    await sendReply(
        ctx,
        event,
        user ? `已登出: ${user.name} (${user.uid})` : '已登出',
    );
};
