/**
 * 超级管理员模块
 *
 * 插件配置中的 adminUsers 为超级管理员 QQ 号列表
 * (配置面为逗号分隔字符串, 经 sanitizeConfig 预解析为数组),
 * 超级管理员可管理直播监听上限等插件配置。
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import { pluginState } from './state';

// ==================== 用户角色 ====================

/**
 * 四档角色标准模型: `user(0) < admin(1) < privateUser(2) < superAdmin(3)`
 */
export type UserRoleName =
    | 'user'
    | 'admin'
    | 'privateUser'
    | 'superAdmin';

/** 角色等级表: 与 UserRoleName 同处一模块, 新增档位时两处同步修改 */
export const ROLE_LEVEL: Record<UserRoleName, number> = {
    user: 0,
    admin: 1,
    privateUser: 2,
    superAdmin: 3,
};

export interface UserRole {
    userId: string; // 用户QQ号
    role: UserRoleName;
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

    let role: UserRoleName = 'user';
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

/**
 * 线性比较: 角色是否达到所需档位
 *
 * 【必须】只做比较, 不负责拒绝与反馈; 拒绝路径 (静默还是提示) 属于分发层策略。
 */
export function hasRole(
    userRole: UserRole,
    required: UserRoleName,
): boolean {
    return ROLE_LEVEL[userRole.role] >= ROLE_LEVEL[required];
}
