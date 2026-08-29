/**
 * B 站 Passport 扫码登录 API
 *
 * 接口文档:
 * - 申请二维码: GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate
 * - 扫码轮询:   GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll
 *
 * 密钥超时 180 秒; poll 返回 data.code:
 *   0=成功 / 86038=二维码已失效 / 86090=已扫码未确认 / 86101=未扫码
 */

import authRequest from './authRequest';

/** 申请二维码响应 data */
export interface QRGenerateData {
    /** 二维码内容 (登录页面 url) */
    url: string;
    /** 扫码登录秘钥, 恒为 32 字符 */
    qrcode_key: string;
}

/** 扫码轮询状态码 */
export enum QRPollCode {
    /** 扫码登录成功 */
    Success = 0,
    /** 二维码已失效 */
    Expired = 86038,
    /** 二维码已扫码未确认 */
    Scanned = 86090,
    /** 未扫码 */
    Waiting = 86101,
}

/** 扫码轮询响应 data */
export interface QRPollData {
    url: string;
    refresh_token: string;
    timestamp: number;
    /** 0=成功 / 86038=失效 / 86090=已扫码未确认 / 86101=未扫码 */
    code: QRPollCode;
    message: string;
}

interface BilibiliPassportResponse<T> {
    code: number;
    message: string;
    data: T;
}

const PASSPORT_BASE = 'https://passport.bilibili.com';

/** 申请扫码登录二维码 */
export async function api_generateQR(): Promise<QRGenerateData> {
    const res = await authRequest.get<
        BilibiliPassportResponse<QRGenerateData>
    >(`${PASSPORT_BASE}/x/passport-login/web/qrcode/generate`);
    return res.data.data;
}

/** 轮询扫码登录状态 */
export async function api_pollQR(
    qrcodeKey: string,
): Promise<QRPollData> {
    const res = await authRequest.get<
        BilibiliPassportResponse<QRPollData>
    >(`${PASSPORT_BASE}/x/passport-login/web/qrcode/poll`, {
        params: { qrcode_key: qrcodeKey },
    });
    return res.data.data;
}
