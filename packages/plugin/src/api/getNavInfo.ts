/**
 * B 站导航栏用户信息 API
 *
 * 接口文档: GET https://api.bilibili.com/x/web-interface/nav
 * 仅可 Cookie (SESSDATA) 认证; code -101 表示账号未登录
 */

import authRequest, { authLogger } from './authRequest';

/** nav 响应 data (仅保留插件用到的字段) */
export interface NavInfoData {
    isLogin: boolean;
    mid: number;
    uname: string;
    face: string;
    level_info: {
        current_level: number;
    };
}

interface BilibiliNavResponse {
    code: number;
    message: string;
    data: NavInfoData;
}

const NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';

/**
 * 获取登录用户信息 (顺带验证 Cookie 有效性)
 * @returns 已登录返回用户信息; 未登录返回 null
 */
export async function api_getNavInfo(): Promise<NavInfoData | null> {
    try {
        const res =
            await authRequest.get<BilibiliNavResponse>(NAV_URL);
        if (res.data.code === 0 && res.data.data.isLogin) {
            return res.data.data;
        }
        authLogger().warn(
            `(´･ω･\`) nav 接口返回异常: code=${res.data.code}, message=${res.data.message}`,
        );
        return null;
    } catch (e) {
        authLogger().warn('(´･ω･`) nav 接口请求失败:', e);
        return null;
    }
}
