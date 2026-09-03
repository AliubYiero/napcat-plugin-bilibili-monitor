import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliDynamicStoreService } from '../../services/bili-dynamic-store.service';

/**
 * 移除主播动态监听
 */
export const removeDynHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const [uid] = commands;
    if (!uid) {
        ctx.logger.debug('未检测到主播UID');
        return;
    }

    const { message_type, group_id, user_id } = event;
    const groupId =
        message_type === 'group' ? String(group_id) : String(user_id);

    await biliDynamicStoreService.remove(uid, {
        id: groupId,
        type: message_type,
    });
};
