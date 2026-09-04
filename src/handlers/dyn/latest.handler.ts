import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliDynamicStoreService } from '../../services/dyn/store.service';

/**
 * 查看主播最新一条动态（输出与推送模板一致）
 */
export const latestDynHandler = async (
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

    await biliDynamicStoreService.latest(uid, {
        id: groupId,
        type: message_type,
    });
};
