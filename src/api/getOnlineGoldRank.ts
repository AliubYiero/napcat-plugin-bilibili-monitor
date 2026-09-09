import baseRequest from './baseRequest';

/**
 * 高能榜在线人数响应结构（仅取同接数相关字段）
 */
export interface OnlineGoldRankResponse {
    code: number;
    message?: string;
    data: {
        /** 当前同接数（实时观众人数） */
        onlineNum: number;
    };
}

/**
 * 获取直播间实时同接数（免登录 GET）
 * @param ruid 主播 uid
 * @param roomId 真实房间号
 */
export async function api_getOnlineGoldRank(
    ruid: string | number,
    roomId: string | number,
): Promise<number | null> {
    try {
        const res = await baseRequest.get(
            `/xlive/general-interface/v1/rank/getOnlineGoldRank`,
            {
                params: {
                    ruid,
                    roomId,
                    page: 1,
                    pageSize: 1,
                },
            },
        );
        const body = res.data as OnlineGoldRankResponse;
        if (
            body?.code !== 0 ||
            typeof body?.data?.onlineNum !== 'number'
        ) {
            return null;
        }
        return body.data.onlineNum;
    } catch {
        return null;
    }
}
