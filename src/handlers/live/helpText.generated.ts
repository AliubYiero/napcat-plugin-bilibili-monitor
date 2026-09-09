/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/bilibili-live-monitor.ts
 */

import type { HelpVariant } from '../../utils/helpMessage';

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
export const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: '【Bilibili Live Monitor 插件帮助】\n\n核心指令:\n#bili live add <主播uid>: 添加主播到直播状态监听列表\n#bili live remove <主播uid>: 从直播状态监听列表移除主播\n#bili live list: 查看当前正在监听直播状态的主播列表\n#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]\n#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n同接监听指令:\n#bili live online add <主播uid>: 添加主播到同接数监听列表\n#bili live online remove <主播uid>: 从同接数监听列表移除主播\n#bili live online list: 查看当前正在监听同接数的主播列表\n',
    admin: '【Bilibili Live Monitor 插件帮助】\n\n核心指令:\n#bili live add <主播uid>: 添加主播到直播状态监听列表\n#bili live remove <主播uid>: 从直播状态监听列表移除主播\n#bili live list: 查看当前正在监听直播状态的主播列表\n#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]\n#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n同接监听指令:\n#bili live online add <主播uid>: 添加主播到同接数监听列表\n#bili live online remove <主播uid>: 从同接数监听列表移除主播\n#bili live online list: 查看当前正在监听同接数的主播列表\n\n监听管理指令 [管理员]:\n#bili live max: 查看当前会话直播状态监听上限\n#bili live online max: 查看当前会话直播同接监听上限\n',
    superAdmin:
        '【Bilibili Live Monitor 插件帮助】\n\n核心指令:\n#bili live add <主播uid>: 添加主播到直播状态监听列表\n#bili live remove <主播uid>: 从直播状态监听列表移除主播\n#bili live list: 查看当前正在监听直播状态的主播列表\n#bili live mention <主播uid>: 订阅主播开播 @ 提醒 [仅群聊]\n#bili live unmention <主播uid>: 取消订阅开播 @ 提醒 [仅群聊]\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n辅助指令 [超管]:\n#bili user help: 查询 Bilibili 用户登录指令帮助 [仅私聊]\n\n同接监听指令:\n#bili live online add <主播uid>: 添加主播到同接数监听列表\n#bili live online remove <主播uid>: 从同接数监听列表移除主播\n#bili live online list: 查看当前正在监听同接数的主播列表\n\n监听管理指令 [管理员]:\n#bili live max: 查看当前会话直播状态监听上限\n#bili live online max: 查看当前会话直播同接监听上限\n\n监听管理指令 [超管]:\n#bili live max <监听数>: 设置当前群聊直播状态监听上限 [仅群聊]\n#bili live max <监听数> <group|private> <id>: 修改指定会话直播状态监听上限 [仅私聊]\n#bili live online max <监听数>: 设置当前群聊直播同接监听上限 [仅群聊]\n#bili live online max <监听数> <group|private> <id>: 修改指定会话直播同接监听上限 [仅私聊]\n',
};
