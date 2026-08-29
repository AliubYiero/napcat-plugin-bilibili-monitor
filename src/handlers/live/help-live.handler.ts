/**
 * 输出 Bilibili 监听插件指令帮助
 * 默认发送按角色生成的帮助图片, 图片缺失或发送失败时回退文本帮助
 *
 * 帮助版本由角色与会话类型共同决定:
 * - 群聊超管输出 Admin 版, 仅私聊超管输出 SuperAdmin 版
 * - 私聊用户 (privateUser) 等同 admin 权限组, 输出 Admin 版
 */

import fs from 'fs';
import { join, resolve } from 'path';
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendReply, sendReplyByToInfo, createImageMessage } from '../message.handler';
import { getUserRole, UserRole } from '../../core/admin';
import { pluginState } from '../../core/state';

/** 帮助图片文件名 */
const HELP_IMAGE = {
    user: 'bilibili-live-monitor-User.png',
    admin: 'bilibili-live-monitor-Admin.png',
    superAdmin: 'bilibili-live-monitor-SuperAdmin.png',
} as const;

/** 帮助图片版本 */
type HelpVariant = keyof typeof HELP_IMAGE;

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: [
        '【Bilibili Live Monitor 插件帮助】',
        '',
        '核心指令:',
        '#bili live add <主播uid>: 添加主播到直播状态监听列表',
        '#bili live remove <主播uid>: 从直播状态监听列表移除主播',
        '#bili live list: 查看当前正在监听直播状态的主播列表',
        '#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]',
        '#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]',
        '',
        '辅助指令:',
        '#bili live help: 查看直播状态监听指令帮助',
        '#bili dyn help: 查询动态状态监听指令帮助',
    ].join('\n'),
    admin: [
        '【Bilibili Live Monitor 插件帮助】',
        '',
        '核心指令:',
        '#bili live add <主播uid>: 添加主播到直播状态监听列表',
        '#bili live remove <主播uid>: 从直播状态监听列表移除主播',
        '#bili live list: 查看当前正在监听直播状态的主播列表',
        '#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]',
        '#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]',
        '',
        '辅助指令:',
        '#bili live help: 查看直播状态监听指令帮助',
        '#bili dyn help: 查询动态状态监听指令帮助',
        '',
        '监听管理指令 [管理员]:',
        '#bili live max: 查看当前对话直播状态监听上限',
    ].join('\n'),
    superAdmin: [
        '【Bilibili Live Monitor 插件帮助】',
        '',
        '核心指令:',
        '#bili live add <主播uid>: 添加主播到直播状态监听列表',
        '#bili live remove <主播uid>: 从直播状态监听列表移除主播',
        '#bili live list: 查看当前正在监听直播状态的主播列表',
        '#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]',
        '#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]',
        '',
        '辅助指令:',
        '#bili live help: 查看直播状态监听指令帮助',
        '#bili dyn help: 查询动态状态监听指令帮助',
        '',
        '监听管理指令 [管理员]:',
        '#bili live max: 查看当前对话直播状态监听上限',
        '',
        '监听管理指令 [超管]:',
        '#bili live max <监听数>: 设置当前群直播状态监听上限 [仅群聊]',
        '#bili live max <监听数> <group|private> <id>: 修改指定会话直播状态监听上限 [仅私聊]',
    ].join('\n'),
};

/** 由角色与会话类型决定帮助版本 */
function getHelpVariant(role: UserRole['role'], isGroup: boolean): HelpVariant {
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
function getHelpImagePath(variant: HelpVariant): string {
    const assetsDir = join(pluginState.ctx.dataPath, '..', 'assets');
    return resolve(assetsDir, HELP_IMAGE[variant]);
}

/**
 * 输出 Bilibili 监听插件指令帮助
 * 优先发送帮助图片, 图片缺失或发送失败时回退文本帮助
 */
export const helpLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    const { message_type, group_id, user_id } = event;
    const toInfo = {
        id: message_type === 'group' ? String(group_id) : String(user_id),
        type: message_type,
    } as const;

    const { role } = getUserRole(event);
    const variant = getHelpVariant(role, message_type === 'group');

    // 优先发送帮助图片, 文件缺失或发送失败时回退文本帮助
    const imagePath = getHelpImagePath(variant);
    if (fs.existsSync(imagePath)) {
        const sent = await sendReply(ctx, event, createImageMessage(imagePath));
        if (sent) return;
    }

    await sendReplyByToInfo(ctx, toInfo, HELP_TEXT_MAP[variant]);
};
