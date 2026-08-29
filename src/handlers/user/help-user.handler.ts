/**
 * 输出 Bilibili User Monitor 插件指令帮助 (仅超管私聊)
 * 帮助文本按模板字符串存储, 图片优先/文本回退逻辑见 src/utils/help-message.ts
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendHelpMessage, HelpVariant } from '../../utils/help-message';

/** 帮助图片文件名 */
const HELP_IMAGE = {
    user: 'bilibili-user-monitor-User.png',
    admin: 'bilibili-user-monitor-Admin.png',
    superAdmin: 'bilibili-user-monitor-SuperAdmin.png',
} as const;

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: `【Bilibili User Monitor 插件帮助】

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态状态监听指令帮助
`,
    admin: `【Bilibili User Monitor 插件帮助】

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态状态监听指令帮助
`,
    superAdmin: `【Bilibili User Monitor 插件帮助】

用户登录指令 [超管]:
#bili user login: 登录 Bilibili 账号 [仅私聊]
#bili user logout: 登出 Bilibili 账号 [仅私聊]
#bili user status: 查询当前 Bilibili 账号的登录状态 [仅私聊]

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态状态监听指令帮助

辅助指令 [超管]:
#bili user help: 查询 Bilibili 账号登录指令帮助 [仅私聊]
`,
};

/**
 * 输出 Bilibili User Monitor 插件指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export const helpUserHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    await sendHelpMessage(ctx, event, { imageMap: HELP_IMAGE, textMap: HELP_TEXT_MAP });
};
