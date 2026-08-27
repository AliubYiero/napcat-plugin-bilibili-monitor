import baseRequest from './baseRequest';

export interface RoomBaseInfoResponse {
	code: number;
	message?: string;
	data: Record<string, RoomStatusInfo>;
}

/**
 * B站直播间状态信息响应结构
 * 对应表格字段，字段名保持与API返回一致（下划线命名）
 */
export interface RoomStatusInfo {
	/** 直播间标题 */
	title: string;
	/** 直播间房间号（实际房间号） */
	room_id: number;
	/** 主播 mid */
	uid: number;
	/** 直播间在线人数 */
	online: number;
	/** 开播时间戳，单位秒，未开播时为 0 */
	live_time: number;
	/** 直播间开播状态：0-未开播，1-正在直播，2-轮播中 */
	live_status: number;
	/** 直播间短房间号，常见于签约主播 */
	short_id: number;
	/** 直播间分区 id */
	area: number;
	/** 直播间分区名 */
	area_name: string;
	/** 直播间新版分区 id */
	area_v2_id: number;
	/** 直播间新版分区名 */
	area_v2_name: string;
	/** 直播间父分区 id */
	area_v2_parent_id: number;
	/** 直播间父分区名 */
	area_v2_parent_name: string;
	/** 主播用户名 */
	uname: string;
	/** 主播头像 url */
	face: string;
	/** 直播间标签 */
	tag_name: string;
	/** 直播间自定义标签 */
	tags: string;
	/** 直播间封面 url */
	cover_from_user: string;
	/** 直播间关键帧 url */
	keyframe: string;
	/** 直播间封禁信息（可能为时间或状态字符串） */
	lock_till: string;
	/** 直播间隐藏信息（可能为时间或状态字符串） */
	hidden_till: string;
	/** 直播类型：0-普通直播，1-手机直播 */
	broadcast_type: number;
}

/**
 * 获取直播间号对应的房间信息
 */
export async function api_getStatusInfoByUids( roomIds: string[] ): Promise<RoomBaseInfoResponse> {
	if ( roomIds.length >= 100 ) {
		throw new Error( '批量请求最多请求 100 个房间号' );
	}
	
	const res = await baseRequest.post( `/room/v1/Room/get_status_info_by_uids`, {
		uids: roomIds.map(Number),
	} );
	return res.data;
}
