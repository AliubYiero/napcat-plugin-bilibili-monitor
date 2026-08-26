import {
	NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliLiveStoreService } from '../../services/bili-live-store.service';

/**
 * 添加直播间监听
 */
export const addLiveHandler = async (
	ctx: NapCatPluginContext, event: OB11Message, commands: string[],
) => {
	// 获取参数, 直播间号
	const [ roomId ] = commands;
	if ( !roomId ) {
		ctx.logger.debug( '未检测到直播间号' );
		return;
	}
	
	// 添加直播间
	const { message_type, group_id, user_id } = event;
	const groupId = message_type === 'group'
		? String( group_id )
		: String( user_id );
	
	await biliLiveStoreService.add(
		Number( roomId ),
		{
			id: groupId,
			type: message_type,
		},
	);
};
