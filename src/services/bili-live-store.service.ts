import { pluginState } from '../core/state';
import {
	type BiliLiveMonitorToInfo,
	BiliLiveStore,
} from '../store/bili-live.store';
import { sendReplyByToInfo } from '../handlers/message.handler';
import { api_getRoomBaseInfo } from '../api/api_getRoomBaseInfo';

/**
 * Bilibili 直播变化监听器
 */
class BiliLiveStoreService {
	private biliLiveStore;
	
	constructor() {
		this.biliLiveStore = BiliLiveStore.getInstance();
	}
	
	/**
	 * 添加直播间推送
	 */
	async add( roomId: number, toInfo: BiliLiveMonitorToInfo ) {
		try {
			// 检查房间号是否存在在存储中
			const hasRoomId = this.biliLiveStore.has( roomId, toInfo );
			if ( hasRoomId ) {
				// 如果房间号在存储中, 直接返回
				await sendReplyByToInfo( pluginState.ctx, toInfo, `直播间信息存在, 请勿重复添加: ${ roomId }` );
				return;
			}
			// 如果房间号不存在在存储中, 检查当前房间号是否有效
			const response = await api_getRoomBaseInfo( [ roomId ] );
			// await sendReplyByToInfo( pluginState.ctx, toInfo, JSON.stringify(response) );
			if ( Object.values(response.data.by_room_ids).length === 0 ) {
				pluginState.ctx.logger.error( response.code, response.message );
				await sendReplyByToInfo( pluginState.ctx, toInfo, `直播间信息添加失败, 房间号不存在: ${roomId}` );
				return;
			}
			
			this.biliLiveStore.add( roomId, toInfo );
			await sendReplyByToInfo( pluginState.ctx, toInfo, `直播间信息添加完成, 开始监听: ${ roomId }` );
		}
		catch ( _e ) {
			const errorMessage = `直播间添加失败: ${ roomId }`;
			pluginState.ctx.logger.error( errorMessage, _e );
			await sendReplyByToInfo(
				pluginState.ctx,
				toInfo,
				errorMessage,
			);
		}
	}
	
	/**
	 * 删除直播间推送
	 */
	async remove( roomId: number, toInfo: BiliLiveMonitorToInfo ) {
		try {
			const isRemoved = this.biliLiveStore.remove(
				roomId,
				toInfo,
			);
			const message = isRemoved
				? `直播间信息删除完毕, 已停止监听: ${ roomId }`
				: `不存在该直播间的监听信息: ${ roomId }`;
			await sendReplyByToInfo( pluginState.ctx, toInfo, message );
		}
		catch ( e ) {
			const errorMessage = `直播间监听移除失败: ${ roomId }`;
			pluginState.ctx.logger.error( errorMessage, e );
			await sendReplyByToInfo(
				pluginState.ctx,
				toInfo,
				errorMessage,
			);
		}
	}
}

export const biliLiveStoreService = new BiliLiveStoreService();
