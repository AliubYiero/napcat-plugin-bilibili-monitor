/**
 * 获取 B 站用户空间动态
 *
 * 接口: GET /x/polymer/web-dynamic/v1/feed/space
 * 需要登录态 (authRequest 拦截器自动注入 Cookie)。
 * 返回的第一页动态 (过滤置顶前) 按发布时间从新到旧排列。
 */
import authRequest from './authRequest';

/** 动态接口响应 (仅声明本插件用到的字段) */
export interface DynamicFeedResponse {
    code: number;
    message?: string;
    data?: {
        items?: BiliDynamicItem[];
        /** 分页偏移量, 翻页时传入, 本期仅取第一页 */
        offset?: string;
        has_more?: boolean;
    };
}

/** 动态条目 (引用完整类型定义) */
export type BiliDynamicItem =
    import('../store/BiliDynamic.type').BiliDynamic;

/**
 * 拉取指定主播的空间动态第一页
 * @param hostMid 主播 uid
 */
export async function api_getDynamicFeed(
    hostMid: string | number,
): Promise<DynamicFeedResponse> {
    const res = await authRequest.get<DynamicFeedResponse>(
        'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space',
        {
            params: {
                host_mid: String(hostMid),
                timezone_offset: -480,
                features: 'itemOpusStyle',
            },
        },
    );
    return res.data;
}
