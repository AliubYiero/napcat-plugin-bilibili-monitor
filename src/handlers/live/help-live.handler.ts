/**
 * 输出 Bilibili Live Monitor 插件指令帮助
 * 帮助文本按模板字符串存储, 图片优先/文本回退逻辑见 src/utils/help-message.ts
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import {
    sendHelpMessage,
    HelpVariant,
} from '../../utils/help-message';

/** 帮助图片文件名 */
const HELP_IMAGE = {
    user: 'bilibili-live-monitor-User.png',
    admin: 'bilibili-live-monitor-Admin.png',
    superAdmin: 'bilibili-live-monitor-SuperAdmin.png',
} as const;

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: `【Bilibili Live Monitor 插件帮助】

核心指令:
#bili live add <主播uid>: 添加主播到直播状态监听列表
#bili live remove <主播uid>: 从直播状态监听列表移除主播
#bili live list: 查看当前正在监听直播状态的主播列表
#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]
#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态监听指令帮助 (add/remove/latest)
`,
    admin: `【Bilibili Live Monitor 插件帮助】

核心指令:
#bili live add <主播uid>: 添加主播到直播状态监听列表
#bili live remove <主播uid>: 从直播状态监听列表移除主播
#bili live list: 查看当前正在监听直播状态的主播列表
#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]
#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态监听指令帮助 (add/remove/latest)

监听管理指令 [管理员]:
#bili live max: 查看当前会话直播状态监听上限
#bili dyn max: 查看当前会话动态监听上限
`,
    superAdmin: `【Bilibili Live Monitor 插件帮助】

核心指令:
#bili live add <主播uid>: 添加主播到直播状态监听列表
#bili live remove <主播uid>: 从直播状态监听列表移除主播
#bili live list: 查看当前正在监听直播状态的主播列表
#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]
#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]

辅助指令:
#bili live help: 查看直播状态监听指令帮助
#bili dyn help: 查询动态状态监听指令帮助

辅助指令 [超管]:
#bili user help: 查询 Bilibili 用户登录指令帮助 [仅私聊]

监听管理指令 [管理员]:
#bili live max: 查看当前会话直播状态监听上限

监听管理指令 [超管]:
#bili live max <监听数>: 设置当前群直播状态监听上限 [仅群聊]
#bili live max <监听数> <group|private> <id>: 修改指定会话直播状态监听上限 [仅私聊]
#bili dyn max <监听数>: 设置当前群动态监听上限 [仅群聊]
#bili dyn max <监听数> <group|private> <id>: 修改指定会话动态监听上限 [仅私聊]
`,
};

/**
 * 输出 Bilibili Live Monitor 插件指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export const helpLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    await sendHelpMessage(ctx, event, {
        imageMap: HELP_IMAGE,
        textMap: HELP_TEXT_MAP,
    });
};
