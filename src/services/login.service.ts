/**
 * B 站扫码登录服务
 *
 * 管理全局唯一的扫码登录会话:
 * - 生成二维码 (qrcode 库渲染 PNG) 并保存到 data 目录
 * - 每 2 秒轮询扫码状态, 仅在"已扫码"与"最终结果"时反馈
 * - 二维码失效后自动重新生成, 最多自动刷新 3 次
 * - 登录成功后存储 Cookie, 通过 nav 接口补充用户信息
 *
 * 会话互斥: 指令入口与 WebUI API 入口共用同一会话,
 * 同一时间只允许一个登录流程。
 */

import QRCode from 'qrcode';
import { pluginState } from '../core/state';
import {
    api_generateQR,
    api_pollQR,
    QRPollCode,
    type QRPollData,
} from '../api/api_qrcodeLogin';
import {
    biliCookieStore,
    refreshUserInfo,
    type BiliUserInfo,
} from '../store/bili-cookie.store';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';

/** 轮询间隔 (ms) */
const POLL_INTERVAL_MS = 2000;

/** 二维码失效后自动重新生成的最大次数 */
const MAX_QR_REFRESH = 3;

/** 扫码登录会话的最终状态 */
export enum LoginSessionStatus {
    /** 等待扫码 */
    Waiting = 'waiting',
    /** 已扫码未确认 */
    Scanned = 'scanned',
    /** 登录成功 */
    Success = 'success',
    /** 二维码已失效 (含自动刷新耗尽) */
    Expired = 'expired',
    /** 登录流程出错 */
    Error = 'error',
}

/** 登录会话状态快照 (供 WebUI API 返回) */
export interface LoginSessionSnapshot {
    status: LoginSessionStatus;
    /** 是否已有会话进行中 */
    active: boolean;
    /** 已自动刷新的次数 */
    refreshed: number;
    /** 二维码图片本地路径 (会话进行中时有值) */
    qrImagePath?: string;
    /** 提示信息 */
    message: string;
}

/** 登录会话事件监听器: 状态变化时回调 (指令入口用于回复用户) */
export type LoginSessionListener = (
    status: LoginSessionStatus,
    message: string,
) => void;

/** 会话是否已到达终态 */
function isFinalStatus(status: LoginSessionStatus): boolean {
    return (
        status === LoginSessionStatus.Success ||
        status === LoginSessionStatus.Expired ||
        status === LoginSessionStatus.Error
    );
}

class LoginService {
    /** 当前会话是否进行中 */
    private active = false;

    /** 当前会话发起来源 */
    private source: 'instruction' | 'webui' = 'instruction';

    /** 指令入口的监听器 (一次会话一个) */
    private listener: LoginSessionListener | null = null;

    /** 二维码图片本地路径 */
    private qrImagePath: string | null = null;

    /** 已自动刷新次数 */
    private refreshed = 0;

    /** 轮询定时器 */
    private pollTimer: ReturnType<typeof setInterval> | null =
        null;

    /** 最近一次状态与提示 (快照用) */
    private lastStatus: LoginSessionStatus =
        LoginSessionStatus.Expired;
    private lastMessage = '当前没有进行中的登录流程';

    /** 是否为指令发起的会话 */
    private isFromInstruction(): boolean {
        return this.source === 'instruction';
    }

    /**
     * 尝试开始登录会话
     * @returns 成功返回 null; 会话已存在时返回提示文案
     */
    start(
        source: 'instruction' | 'webui',
        listener?: LoginSessionListener,
    ): string | null {
        if (this.active) {
            return '已有登录流程进行中, 请先完成或等待其结束';
        }

        this.active = true;
        this.source = source;
        this.listener = listener ?? null;
        this.refreshed = 0;
        this.lastStatus = LoginSessionStatus.Waiting;
        this.lastMessage = '正在生成登录二维码...';

        void this.generateAndPoll();
        return null;
    }

    /** 获取当前会话状态快照 (WebUI 轮询用) */
    getSnapshot(): LoginSessionSnapshot {
        return {
            status: this.lastStatus,
            active: this.active,
            refreshed: this.refreshed,
            qrImagePath: this.active
                ? (this.qrImagePath ?? undefined)
                : undefined,
            message: this.lastMessage,
        };
    }

    /** 停止当前会话 (cleanup 时调用) */
    stop(): void {
        this.cleanupTimer();
        this.active = false;
        this.listener = null;
    }

    // ==================== 内部流程 ====================

    /** 生成二维码并启动轮询 */
    private async generateAndPoll(): Promise<void> {
        try {
            const qr = await api_generateQR();
            this.qrImagePath = await this.renderQRToFile(qr.url);

            this.setStatus(
                LoginSessionStatus.Waiting,
                '请使用 B 站手机客户端扫码登录',
            );

            this.cleanupTimer();
            let scannedNotified = false;
            this.pollTimer = setInterval(() => {
                void this.pollOnce(qr.qrcode_key, () => {
                    if (scannedNotified) return;
                    scannedNotified = true;
                    this.setStatus(
                        LoginSessionStatus.Scanned,
                        '扫码成功, 请在手机上确认登录',
                    );
                });
            }, POLL_INTERVAL_MS);
        } catch (e) {
            this.setStatus(
                LoginSessionStatus.Error,
                '生成登录二维码失败, 请稍后重试',
            );
            pluginState.logger.error(
                '(╥﹏╥) 生成登录二维码失败:',
                e,
            );
            this.endSession();
        }
    }

    /** 将登录 url 渲染为 PNG 保存到 data 目录 */
    private async renderQRToFile(url: string): Promise<string> {
        const filePath = pluginState.getDataFilePath(
            'bilibiliLoginQR.png',
        );
        await QRCode.toFile(filePath, url, {
            width: 512,
            margin: 2,
        });
        return filePath;
    }

    /**
     * 单次轮询
     * @param onFirstScan 首次检测到"已扫码"时回调 (内部已去重)
     */
    private async pollOnce(
        qrcodeKey: string,
        onFirstScan: () => void,
    ): Promise<void> {
        let data: QRPollData;
        try {
            data = await api_pollQR(qrcodeKey);
        } catch (e) {
            // 网络抖动不中断会话, 下轮重试
            pluginState.logger.debug(
                '扫码状态轮询失败 (下轮重试):',
                e,
            );
            return;
        }

        switch (data.code) {
            case QRPollCode.Waiting:
                return;
            case QRPollCode.Scanned:
                onFirstScan();
                return;
            case QRPollCode.Expired:
                this.handleExpired();
                return;
            case QRPollCode.Success:
                await this.handleSuccess(data);
                return;
        }
    }

    /** 二维码失效: 自动重新生成, 超出次数则结束会话 */
    private handleExpired(): void {
        this.cleanupTimer();
        if (this.refreshed < MAX_QR_REFRESH) {
            this.refreshed++;
            pluginState.logger.warn(
                `(´･ω･\`) 登录二维码已失效, 自动刷新 (${this.refreshed}/${MAX_QR_REFRESH})`,
            );
            void this.generateAndPoll();
        } else {
            this.setStatus(
                LoginSessionStatus.Expired,
                '二维码已失效, 请重新发送登录指令',
            );
            this.endSession();
        }
    }

    /** 登录成功: 存储 Cookie -> nav 补充用户信息 -> 结束会话 */
    private async handleSuccess(
        data: QRPollData,
    ): Promise<void> {
        this.cleanupTimer();

        // 登录 Cookie 优先取响应头 Set-Cookie; 降级从跨域 url 解析
        const cookies =
            Object.keys(data.cookies).length > 0
                ? data.cookies
                : parseCookiesFromCrossDomainUrl(data.url);
        const loginTime = data.timestamp || Date.now();
        biliCookieStore.saveLogin(cookies, loginTime);
        biliCookieStore.clearExpired();

        // nav 接口获取用户信息 (失败不阻塞登录成功)
        let user: BiliUserInfo | undefined;
        const navUser = await refreshUserInfo();
        if (navUser) {
            user = navUser;
        }

        const userDesc = user
            ? `${user.name} (${user.uid})`
            : '用户信息获取失败';

        this.setStatus(
            LoginSessionStatus.Success,
            `登录成功: ${userDesc}`,
        );
        this.endSession();
    }

    /** 清理轮询定时器 */
    private cleanupTimer(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** 设置状态并通知监听器 (仅指令入口) */
    private setStatus(
        status: LoginSessionStatus,
        message: string,
    ): void {
        this.lastStatus = status;
        this.lastMessage = message;
        if (this.isFromInstruction() && this.listener) {
            const listener = this.listener;
            if (isFinalStatus(status)) {
                this.listener = null;
            }
            listener(status, message);
        }
    }

    /** 结束会话 */
    private endSession(): void {
        this.cleanupTimer();
        this.active = false;
    }
}

/**
 * 从跨域登录 url 的查询参数中解析 Cookie 项
 * url 形如 https://passport.biligame.com/crossDomain?DedeUserID=...&SESSDATA=...&bili_jct=...&gourl=...
 */
function parseCookiesFromCrossDomainUrl(
    url: string,
): Record<string, string> {
    const cookies: Record<string, string> = {};
    try {
        const query = new URL(url).searchParams;
        for (const key of [
            'DedeUserID',
            'DedeUserID__ckMd5',
            'SESSDATA',
            'bili_jct',
        ]) {
            const value = query.get(key);
            if (value) cookies[key] = value;
        }
    } catch {
        // url 解析失败时返回空, 由调用方降级处理
    }
    return cookies;
}

/** 全局单例 */
export const loginService = new LoginService();
