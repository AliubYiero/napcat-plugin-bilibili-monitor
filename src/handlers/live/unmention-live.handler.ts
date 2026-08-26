import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliLiveStoreService } from '../../services/bili-live-store.service';
import { sendReply } from '../message.handler';

/**
 * 取消开播 @ 提醒订阅（仅群聊）
 */
export const unmentionLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    // 获取参数, 主播 uid
    const [uid] = commands;
    if (!uid) {
        ctx.logger.debug('未检测到主播UID');
        return;
    }

    // 仅支持群聊
    const { message_type, group_id, user_id } = event;
    if (message_type !== 'group' || !group_id) {
        await sendReply(ctx, event, '该指令仅支持群聊使用');
        return;
    }

    const toInfo = {
        id: String(group_id),
        type: 'group',
    } as const;
    await biliLiveStoreService.removeMention(
        uid,
        toInfo,
        String(user_id),
    );
};
