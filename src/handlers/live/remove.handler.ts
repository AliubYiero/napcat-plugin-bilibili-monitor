import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliLiveStoreService } from '../../services/live/store.service';

/**
 * 删除直播间监听
 */
export const removeLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    // 获取参数, 直播间号
    const [uid] = commands;
    if (!uid) {
        ctx.logger.debug('未检测到主播UID');
        return;
    }

    // 删除直播间
    const { message_type, group_id, user_id } = event;
    const groupId =
        message_type === 'group' ? String(group_id) : String(user_id);

    await biliLiveStoreService.remove(uid, {
        id: groupId,
        type: message_type,
    });
};
