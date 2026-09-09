/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/bilibili-user-monitor.ts
 */

import type { HelpVariant } from '../../utils/helpMessage';

/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */
export const HELP_TEXT_MAP: Record<HelpVariant, string> = {
    user: '【Bilibili User Monitor 插件帮助】\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n',
    admin: '【Bilibili User Monitor 插件帮助】\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n',
    superAdmin:
        '【Bilibili User Monitor 插件帮助】\n\n用户登录指令 [超管]:\n#bili user login: 登录 Bilibili 账号 [仅私聊]\n#bili user logout: 登出 Bilibili 账号 [仅私聊]\n#bili user status: 查询当前 Bilibili 账号的登录状态 [仅私聊]\n\n辅助指令:\n#bili live help: 查看直播状态监听指令帮助\n#bili dyn help: 查询动态状态监听指令帮助\n\n辅助指令 [超管]:\n#bili user help: 查询 Bilibili 账号登录指令帮助 [仅私聊]\n',
};
