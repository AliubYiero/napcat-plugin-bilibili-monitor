/**
 * 超级管理员模块
 *
 * 插件配置中的 adminUsers 为超级管理员 QQ 号列表
 * (配置面为逗号分隔字符串, 经 sanitizeConfig 预解析为数组),
 * 超级管理员可管理直播监听上限等插件配置。
 */

import { pluginState } from './state';
import { OB11Message } from 'napcat-types/napcat-onebot';

// ==================== 用户角色 ====================

export interface UserRole {
    userId: string; // 用户QQ号
    role: 'user' | 'admin' | 'privateUser' | 'superAdmin';
    from: {
        id: string;
        type: 'private' | 'group';
    };
}

/**
 * 获取消息发送者的用户角色
 * 优先级: superAdmin > privateUser(仅好友私聊) > admin(群管理员, 仅群聊可达) > user
 * 好友私聊用户的角色恒为 privateUser 或 superAdmin, 非好友私聊降为 user
 */
export function getUserRole(event: OB11Message): UserRole {
    const userId = String(event.user_id);
    const isGroup = event.message_type === 'group';

    let role: UserRole['role'] = 'user';
    if (isSuperAdmin(userId)) {
        role = 'superAdmin';
    } else if (!isGroup) {
        // 仅机器人好友的私聊等同 admin 权限组 (sub_type: friend=好友, group=临时会话)
        if (event.sub_type === 'friend') {
            role = 'privateUser';
        }
    } else if (isAdmin(event)) {
        role = 'admin';
    }

    return {
        userId,
        role,
        from: {
            id: isGroup
                ? String(event.group_id)
                : String(event.user_id),
            type: isGroup ? 'group' : 'private',
        },
    };
}

// ==================== 权限检查 ====================

/**
 * 检查消息发送者是否为群管理员/群主
 * 仅用于群聊角色判断, 私聊不会调用
 */
function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return true;
    const role = (event.sender as Record<string, unknown>)?.role;
    return role === 'admin' || role === 'owner';
}

/**
 * 判断指定 QQ 号是否为超级管理员
 * 名单来自配置 adminUsers (sanitizeConfig 已预解析为数组)
 */
export function isSuperAdmin(qq: string): boolean {
    return pluginState.config.adminUsers.includes(qq);
}
