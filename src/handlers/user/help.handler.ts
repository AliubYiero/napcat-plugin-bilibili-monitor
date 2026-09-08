/**
 * 输出 Bilibili User Monitor 插件指令帮助 (仅超管私聊)
 * 文本由 help:generate 生成 (cmd 权威源 scripts/generateHelp/cmds/),
 * 图片优先/文本回退逻辑见 src/utils/helpMessage.ts
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendHelpMessage } from '../../utils/helpMessage';
import { HELP_TEXT_MAP } from './helpText.generated';

/** 帮助图片文件名 */
const HELP_IMAGE = {
    user: 'bilibili-user-monitor-User.png',
    admin: 'bilibili-user-monitor-Admin.png',
    superAdmin: 'bilibili-user-monitor-SuperAdmin.png',
} as const;

/**
 * 输出 Bilibili User Monitor 插件指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export const helpUserHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    await sendHelpMessage(ctx, event, {
        imageMap: HELP_IMAGE,
        textMap: HELP_TEXT_MAP,
    });
};
