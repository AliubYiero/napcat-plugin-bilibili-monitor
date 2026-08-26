import baseRequest from './baseRequest';

export interface RoomBaseInfoResponse {
	code: number;
	message?: string;
	data: {
		by_room_ids: Record<string, RoomInfo>
		by_uids: {},
	};
}

export interface RoomInfo {
	/** 直播间长ID */
	room_id: number;
	/** 主播用户mid */
	uid: number;
	/** 直播间分区ID */
	area_id: number;
	/**
	 * 直播状态
	 * 0: 未开播
	 * 1: 直播中
	 * 2: 轮播中
	 */
	live_status: 0 | 1 | 2;
	/** 直播间网页url */
	live_url: string;
	/** 直播间父分区ID */
	parent_area_id: number;
	/** 直播间标题 */
	title: string;
	/** 直播间父分区名称 */
	parent_area_name: string;
	/** 直播间分区名称 */
	area_name: string;
	/** 开播时间，格式 yyyy-MM-dd HH:mm:ss */
	live_time: string;
	/** 直播间简介 */
	description: string;
	/** 直播间标签，以逗号分隔 */
	tags: string;
	/** 关注数 */
	attention: number;
	/** 在线人数 */
	online: number;
	/** 直播间短ID，为0表示无短号 */
	short_id: number;
	/** 主播用户名 */
	uname: string;
	/** 直播间封面url */
	cover: string;
	/** 直播间背景url */
	background: string;
	/** 固定值 1（用途暂未明确） */
	join_slide: number;
	/** 固定值 0（用途暂未明确） */
	live_id: number;
	/** 固定值 "0"（用途暂未明确） */
	live_id_str: string;
}

export type RawLiveStatus = 0 | 1 | 2;

/**
 * 获取直播间号对应的房间信息
 */
export async function api_getRoomBaseInfo( roomIds: number[] ): Promise<RoomBaseInfoResponse> {
	if ( roomIds.length >= 100 ) {
		throw new Error( '批量请求最多请求 100 个房间号' );
	}
	
	const res = await baseRequest.get( `/xlive/web-room/v1/index/getRoomBaseInfo`, {
		params: {
			room_ids: roomIds.join( ',' ),
			req_biz: 'pc_web',
		},
	} );
	return res.data;
}
