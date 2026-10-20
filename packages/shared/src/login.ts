/**
 * B 站登录态与扫码登录会话的跨包契约
 *
 * 三处共用同一份定义, 避免面板 / WebUI / 后端各自维护形状:
 *   - 后端 `config.ts` 的面板登录块
 *   - 后端 `loginService` 的会话快照
 *   - WebUI `LoginField` 的状态渲染与轮询
 */

/** 登录用户信息 (nav 接口 / Cookie 存储) */
export interface BiliUserProfile {
    /** 用户 uid */
    uid: string;
    /** 用户昵称 */
    name: string;
    /** 用户头像 url */
    avatar: string;
}

/**
 * 账号登录态 (面板与 WebUI 共用的运行时快照)
 *
 * `loggedIn` 以 Cookie 是否存在判定; `user` 仅用于展示, 缺失时仍视为已登录。
 */
export interface LoginStatus {
    /** 是否已保存登录 Cookie */
    loggedIn: boolean;
    /** Cookie 是否已失效 */
    cookieExpired: boolean;
    /** 登录用户信息 (nav 接口未取到时为 null) */
    user: BiliUserProfile | null;
    /** 登录时间戳 (ms) */
    loginTime: number | null;
}

/** 扫码登录会话状态 */
export const LoginSessionStatus = {
    /** 等待扫码 */
    Waiting: 'waiting',
    /** 已扫码未确认 */
    Scanned: 'scanned',
    /** 登录成功 */
    Success: 'success',
    /** 二维码已失效 (含自动刷新耗尽) */
    Expired: 'expired',
    /** 登录流程出错 */
    Error: 'error',
} as const;

export type LoginSessionStatus =
    (typeof LoginSessionStatus)[keyof typeof LoginSessionStatus];

/** 登录会话的发起来源 (用于判定 WebUI 是否可刷新) */
export type LoginSessionSource = 'instruction' | 'webui';

/**
 * 扫码登录会话快照 (WebUI 轮询用)
 *
 * 【必须】只暴露状态与版本号, 不暴露二维码的本地路径。
 */
export interface LoginSessionSnapshot {
    status: LoginSessionStatus;
    /** 是否已有会话进行中 */
    active: boolean;
    /** 会话发起来源 */
    source: LoginSessionSource;
    /** 已自动刷新的次数 */
    refreshed: number;
    /** 二维码版本号 (每次生成/自动刷新递增, 用于图片缓存破坏) */
    qrVersion: number;
    /** 当前是否已有可展示的二维码 */
    hasQr: boolean;
    /** 提示信息 */
    message: string;
}
