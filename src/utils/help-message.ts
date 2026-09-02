/**
 * 帮助消息输出共享工具
 * 按角色与会话类型选择帮助版本, 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 *
 * 帮助版本由角色与会话类型共同决定:
 * - 群聊超管输出 Admin 版, 仅私聊超管输出 SuperAdmin 版
 * - 私聊用户 (privateUser) 等同 admin 权限组, 输出 Admin 版
 */

import fs from 'fs';
import { join, resolve } from 'path';
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import {
    sendReply,
    sendReplyByToInfo,
    createImageMessage,
} from '../handlers/message.handler';
import { getUserRole, UserRole } from '../core/admin';
import { pluginState } from '../core/state';

/** 帮助版本 */
export type HelpVariant = 'user' | 'admin' | 'superAdmin';

/** 按帮助版本组织的内容: 帮助图片文件名 + 文本帮助 (图片降级用) */
export interface HelpContent {
    imageMap: Record<HelpVariant, string>;
    textMap: Record<HelpVariant, string>;
}

/** 由角色与会话类型决定帮助版本 */
export function getHelpVariant(
    role: UserRole['role'],
    isGroup: boolean,
): HelpVariant {
    switch (role) {
        case 'superAdmin':
            // 群聊超管输出 Admin 版, 私聊超管输出 SuperAdmin 版
            return isGroup ? 'admin' : 'superAdmin';
        case 'admin':
        case 'privateUser':
            return 'admin';
        default:
            return 'user';
    }
}

/**
 * 构建帮助图片绝对路径
 * assets 目录位于 ctx.dataPath 的父目录下
 */
function getHelpImagePath(
    imageMap: Record<HelpVariant, string>,
    variant: HelpVariant,
): string {
    const assetsDir = join(pluginState.ctx.dataPath, '..', 'assets');
    return resolve(assetsDir, imageMap[variant]);
}

/**
 * 输出指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export async function sendHelpMessage(
    ctx: NapCatPluginContext,
    event: OB11Message,
    content: HelpContent,
): Promise<void> {
    const { message_type, group_id, user_id } = event;
    const toInfo = {
        id:
            message_type === 'group'
                ? String(group_id)
                : String(user_id),
        type: message_type,
    } as const;

    const { role } = getUserRole(event);
    const variant = getHelpVariant(role, message_type === 'group');

    // 优先发送帮助图片, 文件缺失或发送失败时回退文本帮助
    const imagePath = getHelpImagePath(content.imageMap, variant);
    if (fs.existsSync(imagePath)) {
        const sent = await sendReply(
            ctx,
            event,
            createImageMessage(imagePath),
        );
        if (sent) return;
    }

    await sendReplyByToInfo(ctx, toInfo, content.textMap[variant]);
}
