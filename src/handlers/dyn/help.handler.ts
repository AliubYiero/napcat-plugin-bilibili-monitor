/**
 * 输出动态监听指令帮助
 * 帮助文本按模板字符串存储, 图片优先/文本回退逻辑见 src/utils/helpMessage.ts
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import {
    sendHelpMessage,
    HelpVariant,
} from '../../utils/helpMessage';

/** 帮助图片文件名 */
const HELP_IMAGE = {
    user: 'bilibili-dynamic-monitor-User.png',
    admin: 'bilibili-dynamic-monitor-Admin.png',
    superAdmin: 'bilibili-dynamic-monitor-SuperAdmin.png',
} as const;

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: `【Bilibili Dynamic Monitor 插件帮助】

核心指令:
#bili dyn add <主播uid>: 添加主播到动态监听列表
#bili dyn remove <主播uid>: 从动态监听列表移除主播
#bili dyn latest <主播uid>: 查看主播最新一条动态
#bili dyn list: 查看当前监听动态的主播列表
`,
    admin: `【Bilibili Dynamic Monitor 插件帮助】

核心指令:
#bili dyn add <主播uid>: 添加主播到动态监听列表
#bili dyn remove <主播uid>: 从动态监听列表移除主播
#bili dyn latest <主播uid>: 查看主播最新一条动态
#bili dyn list: 查看当前监听动态的主播列表

监听管理指令 [管理员]:
#bili dyn max: 查看当前会话动态监听上限
`,
    superAdmin: `【Bilibili Dynamic Monitor 插件帮助】

核心指令:
#bili dyn add <主播uid>: 添加主播到动态监听列表
#bili dyn remove <主播uid>: 从动态监听列表移除主播
#bili dyn latest <主播uid>: 查看主播最新一条动态
#bili dyn list: 查看当前监听动态的主播列表

监听管理指令 [管理员]:
#bili dyn max: 查看当前会话动态监听上限

监听管理指令 [超管]:
#bili dyn max <监听数>: 设置当前群动态监听上限 [仅群聊]
#bili dyn max <监听数> <group|private> <id>: 修改指定会话动态监听上限 [仅私聊]
`,
};

/**
 * 输出 Bilibili Dynamic Monitor 插件指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export const helpDynHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    await sendHelpMessage(ctx, event, {
        imageMap: HELP_IMAGE,
        textMap: HELP_TEXT_MAP,
    });
};
