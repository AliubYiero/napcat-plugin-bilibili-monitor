/**
 * 超级管理员模块
 *
 * 插件配置中的 adminUser 为逗号分隔的 QQ 号列表,
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
 * 优先级: superAdmin > privateUser(仅私聊) > admin(群管理员, 仅群聊可达) > user
 * 私聊用户的角色恒为 privateUser 或 superAdmin
 */
export function getUserRole(event: OB11Message): UserRole {
    const userId = String(event.user_id);
    const isGroup = event.message_type === 'group';

    let role: UserRole['role'] = 'user';
    if (isSuperAdmin(userId)) {
        role = 'superAdmin';
    } else if (!isGroup) {
        // 私聊用户等同 admin 权限组
        role = 'privateUser';
    } else if (isAdmin(event)) {
        role = 'admin';
    }

    return {
        userId,
        role,
        from: {
            id: isGroup ? String(event.group_id) : String(event.user_id),
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
 * 获取超级管理员 QQ 号列表（解析自配置 adminUser, 逗号分隔）
 */
function getAdminUsers(): string[] {
    return (pluginState.config.adminUser ?? '')
        .split(',')
        .map((str) => str.trim())
        .filter(Boolean);
}

/**
 * 判断指定 QQ 号是否为超级管理员
 */
export function isSuperAdmin(qq: string): boolean {
    return getAdminUsers().includes(qq);
}
