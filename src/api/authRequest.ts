/**
 * B 站登录态请求实例
 *
 * 用于需要 Cookie 的接口（passport 扫码登录、nav 用户信息、后续动态/视频接口）。
 * 通过请求拦截器自动注入 Cookie 文件中的登录凭证；
 * 与直播域的 baseRequest.ts 保持独立，互不影响。
 */

import axios, { type AxiosInstance } from 'axios';
import { pluginState } from '../core/state';
import { BiliCookieStore } from '../store/bili-cookie.store';

/** 将 Cookie 对象序列化为请求头字符串 */
function buildCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

const authAxiosInstance: AxiosInstance = axios.create({
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        Referer: 'https://www.bilibili.com/',
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
});

// 请求拦截器: 自动附加登录 Cookie (无 Cookie 时不附加)
authAxiosInstance.interceptors.request.use((config) => {
    const cookies = BiliCookieStore.getInstance().getCookies();
    if (cookies && Object.keys(cookies).length > 0) {
        config.headers['Cookie'] = buildCookieHeader(cookies);
    }
    return config;
});

/** 获取插件日志器的快捷方式 (供 API 模块使用) */
export function authLogger() {
    return pluginState.logger;
}

export default authAxiosInstance;
