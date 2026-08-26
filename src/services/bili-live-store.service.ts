import { pluginState } from '../core/state';
import {
	type BiliLiveMonitorToInfo,
	BiliLiveStore,
} from '../store/bili-live.store';
import { sendReplyByToInfo } from '../handlers/message.handler';
import {
	api_getStatusInfoByUids,
} from '../api/api_getStatusInfoByUids';

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
	async add( uid: string, toInfo: BiliLiveMonitorToInfo ) {
		try {
			// 检查 UID 是否存在在存储中
			const hasUid = this.biliLiveStore.has( uid, toInfo );
			if ( hasUid ) {
				// 如果 UID 在存储中, 直接返回
				await sendReplyByToInfo( pluginState.ctx, toInfo, `主播存在, 请勿重复添加: ${ uid }` );
				return;
			}
			// 如果 UID 不存在在存储中, 检查当前房间号是否有效
			const response = await api_getStatusInfoByUids( [ uid ] );
			if ( Object.values(response.data).length === 0 ) {
				pluginState.ctx.logger.error( response.code, response.message );
				await sendReplyByToInfo( pluginState.ctx, toInfo, `主播存在添加失败, 不存在该主播: ${uid}` );
				return;
			}
			
			this.biliLiveStore.add( uid, toInfo );
			await sendReplyByToInfo( pluginState.ctx, toInfo, `主播添加完成, 开始监听: ${ uid }` );
		}
		catch ( _e ) {
			const errorMessage = `主播 UID 添加失败: ${ uid }`;
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
	async remove( uid: string, toInfo: BiliLiveMonitorToInfo ) {
		try {
			const isRemoved = this.biliLiveStore.remove(
				uid,
				toInfo,
			);
			const message = isRemoved
				? `主播信息删除完毕, 已停止监听: ${ uid }`
				: `不存在该主播的监听信息: ${ uid }`;
			await sendReplyByToInfo( pluginState.ctx, toInfo, message );
		}
		catch ( e ) {
			const errorMessage = `主播监听移除失败: ${ uid }`;
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
