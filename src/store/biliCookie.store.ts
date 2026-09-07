/**
 * B 站登录 Cookie 存储
 *
 * 持久化到 data 目录的 bilibiliCookie.json, 结构:
 * {
 *   cookies: { SESSDATA, bili_jct, DedeUserID, DedeUserID__ckMd5, ... },
 *   user: { uid, name, avatar },
 *   loginTime: 登录时间戳 (ms),
 *   cookieExpired: Cookie 是否已失效
 * }
 */

import { pluginState } from '../core/state';
import { api_getNavInfo } from '../api/getNavInfo';

/** 登录用户信息 */
export interface BiliUserInfo {
    /** 用户 uid (DedeUserID / nav.mid) */
    uid: string;
    /** 用户昵称 */
    name: string;
    /** 用户头像 url */
    avatar: string;
}

/** bilibiliCookie.json 数据结构 */
export interface BiliCookieData {
    /** 登录凭证 */
    cookies: Record<string, string>;
    /** 登录用户信息 */
    user?: BiliUserInfo;
    /** 登录时间戳 (ms) */
    loginTime?: number;
    /** Cookie 是否已失效 (重新登录成功后清除) */
    cookieExpired?: boolean;
}

const COOKIE_FILENAME = 'bilibiliCookie.json';

/** Cookie 失效通知冷却时长 (24h) */
const EXPIRED_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** 登录状态变化监听器 (用于刷新 WebUI 配置页登录块) */
export type LoginStateListener = () => void;

export class BiliCookieStore {
    private static instance: BiliCookieStore | null = null;

    private data: BiliCookieData = { cookies: {} };
    /** 上次失效通知时间戳 (ms), 0 表示未通知过 */
    private lastExpiredNotifyTime = 0;
    /** 登录状态变化监听器列表 */
    private loginStateListeners: LoginStateListener[] = [];

    // 注意: 构造函数虽读取文件, 但实例化被推迟到业务调用时 (plugin_init 之后), 安全
    private constructor() {
        this.data = this.load();
    }

    static getInstance(): BiliCookieStore {
        if (!BiliCookieStore.instance) {
            BiliCookieStore.instance = new BiliCookieStore();
        }
        return BiliCookieStore.instance;
    }

    /** 从文件重新加载 (覆盖内存) */
    reload(): void {
        this.data = this.load();
    }

    /** 是否存在 Cookie (不考虑失效状态) */
    has(): boolean {
        return Object.keys(this.data.cookies).length > 0;
    }

    /** 获取登录 Cookie 对象 (未登录返回 {}) */
    getCookies(): Record<string, string> {
        return this.data.cookies;
    }

    /** 获取登录用户信息 (未登录返回 undefined) */
    getUser(): BiliUserInfo | undefined {
        return this.data.user;
    }

    /** 获取 Cookie 失效标记 */
    isExpired(): boolean {
        return this.data.cookieExpired === true;
    }
    /** 获取登录时间戳 (ms), 未登录返回 undefined */
    getLoginTime(): number | undefined {
        return this.data.loginTime;
    }

    /**
     * 保存扫码登录结果
     * @param cookies 登录凭证 (SESSDATA/bili_jct/DedeUserID 等)
     * @param loginTime 登录时间戳 (ms)
     */
    saveLogin(
        cookies: Record<string, string>,
        loginTime: number,
    ): void {
        this.data = { cookies, loginTime };
        this.save();
        this.notifyLoginStateChange();
    }

    /**
     * 补充/更新登录用户信息 (nav 接口获取)
     */
    saveUser(user: BiliUserInfo): void {
        this.data.user = user;
        this.save();
    }

    // ==================== 失效处理 ====================

    /** 登出: 清空 Cookie 与用户信息 */
    logout(): void {
        this.data = { cookies: {} };
        this.save();
        this.notifyLoginStateChange();
    }

    /** 注册登录状态变化监听器 */
    onLoginStateChange(listener: LoginStateListener): void {
        this.loginStateListeners.push(listener);
    }

    /**
     * 标记 Cookie 失效, 并通知全部超级管理员 (24h 冷却)
     * @returns 是否实际发送了通知
     */
    async markExpired(): Promise<boolean> {
        if (this.data.cookieExpired) return false;
        this.data.cookieExpired = true;
        this.save();

        const now = Date.now();
        if (
            now - this.lastExpiredNotifyTime <
            EXPIRED_NOTIFY_COOLDOWN_MS
        ) {
            return false;
        }
        this.lastExpiredNotifyTime = now;

        return this.notifyAdmins();
    }

    /** 重新登录成功后清除失效标记 */
    clearExpired(): void {
        this.data.cookieExpired = false;
        this.save();
    }

    /** 通知登录状态变化 (异步派发, 避免阻塞主流程) */
    private notifyLoginStateChange(): void {
        for (const listener of this.loginStateListeners) {
            try {
                listener();
            } catch (e) {
                pluginState.logger?.warn(
                    '登录状态监听器执行失败:',
                    e,
                );
            }
        }
    }

    /** 通知全部超级管理员 Cookie 已失效 */
    private async notifyAdmins(): Promise<boolean> {
        const adminList = pluginState.config.adminUsers;

        const { sendPrivateMessage } = await import('../handlers/utils');
        for (const adminId of adminList) {
            await sendPrivateMessage(
                pluginState.ctx,
                adminId,
                'B 站登录 Cookie 已失效, 动态/视频监听已暂停, 请私聊机器人发送 #bili user login 重新登录',
            );
        }
        return adminList.length > 0;
    }

    // ==================== 内部方法 ====================

    private load(): BiliCookieData {
        return pluginState.loadDataFile<BiliCookieData>(
            COOKIE_FILENAME,
            { cookies: {} },
        );
    }

    private save(): void {
        pluginState.saveDataFile(COOKIE_FILENAME, this.data);
    }
}

/**
 * 便捷方法: 通过 nav 接口拉取用户信息并保存
 * @returns 成功返回用户信息, 失败 (未登录/网络错误) 返回 null
 */
export async function refreshUserInfo(): Promise<BiliUserInfo | null> {
    const nav = await api_getNavInfo();
    if (!nav) return null;
    const user: BiliUserInfo = {
        uid: String(nav.mid),
        name: nav.uname,
        avatar: nav.face,
    };
    BiliCookieStore.getInstance().saveUser(user);
    return user;
}
