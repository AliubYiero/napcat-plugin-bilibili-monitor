/**
 * 超级管理员模块
 *
 * 插件配置中的 adminUser 为逗号分隔的 QQ 号列表,
 * 超级管理员可管理直播监听上限等插件配置。
 */

import { pluginState } from './state';

/**
 * 获取超级管理员 QQ 号列表（解析自配置 adminUser, 逗号分隔）
 */
export function getAdminUsers(): string[] {
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
