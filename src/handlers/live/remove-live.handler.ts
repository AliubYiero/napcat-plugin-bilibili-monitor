import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliLiveStoreService } from '../../services/bili-live-store.service';

/**
 * 删除直播间监听
 */
export const removeLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    // 获取参数, 直播间号
    const [roomId] = commands;
    if (!roomId) {
        ctx.logger.debug('未检测到直播间号');
        return;
    }

    // 删除直播间
    const { message_type, group_id, user_id } = event;
    const groupId =
        message_type === 'group' ? String(group_id) : String(user_id);

    await biliLiveStoreService.remove(Number(roomId), {
        id: groupId,
        type: message_type,
    });
};
