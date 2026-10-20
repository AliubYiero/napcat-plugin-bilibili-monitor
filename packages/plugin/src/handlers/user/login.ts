/**
 * B 站登录指令 (#bili user login)
 *
 * 仅超级管理员私聊可用: 发送二维码图片, 轮询扫码状态并反馈
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { LoginSessionStatus } from 'shared';
import { loginService } from '../../services/user/loginService';
import { BiliCookieStore } from '../../store/biliCookieStore';
import {
    createImageMessage,
    sendReply,
} from '../../utils/messageSend';

/** 登录会话状态 -> 提示前缀 */
function statusPrefix(status: LoginSessionStatus): string {
    switch (status) {
        case LoginSessionStatus.Waiting:
            return '⏳';
        case LoginSessionStatus.Scanned:
            return '📷';
        case LoginSessionStatus.Success:
            return '✅';
        case LoginSessionStatus.Expired:
            return '⌛';
        case LoginSessionStatus.Error:
            return '❌';
    }
}

void statusPrefix;

export const loginHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<void> => {
    // 已登录: 提示当前账号, 避免误触发重登
    const biliCookieStore = BiliCookieStore.getInstance();
    const existingUser = biliCookieStore.getUser();
    if (biliCookieStore.has() && existingUser) {
        await sendReply(
            ctx,
            event,
            `当前已登录: ${existingUser.name} (${existingUser.uid})\n如需切换账号请先发送 #bili user logout`,
        );
        return;
    }

    const error = loginService.start(
        'instruction',
        async (_status, message) => {
            await sendReply(ctx, event, message);
        },
    );
    if (error) {
        await sendReply(ctx, event, error);
        return;
    }

    // 等二维码生成完毕后发送图片 (轮询 500ms, 最多 20 次 = 10s)
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const qrImagePath = loginService.getQrImagePath();
        if (qrImagePath) {
            await sendReply(
                ctx,
                event,
                createImageMessage(qrImagePath),
            );
            return;
        }
        const snapshot = loginService.getSnapshot();
        if (snapshot.status === LoginSessionStatus.Error) {
            await sendReply(ctx, event, snapshot.message);
            return;
        }
    }
    await sendReply(ctx, event, '获取登录二维码超时, 请重试');
};
