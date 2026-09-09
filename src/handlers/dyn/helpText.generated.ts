/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/bilibili-dynamic-monitor.ts
 */

import type { HelpVariant } from '../../utils/helpMessage';

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
export const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: "【Bilibili Dynamic Monitor 插件帮助】\n\n核心指令:\n#bili dyn add <主播uid>: 添加主播到动态监听列表\n#bili dyn remove <主播uid>: 从动态监听列表移除主播\n#bili dyn latest <主播uid>: 查看主播最新一条动态\n#bili dyn list: 查看当前正在监听动态状态的主播列表\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n",
    admin: "【Bilibili Dynamic Monitor 插件帮助】\n\n核心指令:\n#bili dyn add <主播uid>: 添加主播到动态监听列表\n#bili dyn remove <主播uid>: 从动态监听列表移除主播\n#bili dyn latest <主播uid>: 查看主播最新一条动态\n#bili dyn list: 查看当前正在监听动态状态的主播列表\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n监听管理指令 [管理员]:\n#bili dyn max: 查看当前会话动态监听上限\n",
    superAdmin: "【Bilibili Dynamic Monitor 插件帮助】\n\n核心指令:\n#bili dyn add <主播uid>: 添加主播到动态监听列表\n#bili dyn remove <主播uid>: 从动态监听列表移除主播\n#bili dyn latest <主播uid>: 查看主播最新一条动态\n#bili dyn list: 查看当前正在监听动态状态的主播列表\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n辅助指令 [超管]:\n#bili user help: 查询 Bilibili 用户登录指令帮助 [仅私聊]\n\n监听管理指令 [管理员]:\n#bili dyn max: 查看当前会话动态监听上限\n\n监听管理指令 [超管]:\n#bili dyn max <监听数>: 设置当前群动态监听上限 [仅群聊]\n#bili dyn max <监听数> <group|private> <id>: 修改指定会话动态监听上限 [仅私聊]\n",
};
