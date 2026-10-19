import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { sessionConfigService } from '../../services/sessionConfigService';
import { sendReply } from '../../utils/messageSend';

/**
 * 关闭本群开播 @全体成员提醒（仅群聊、管理员）
 *
 * 关闭为无害操作, 不校验机器人身份, 仅受指令级 admin 门槛约束。
 */
export const unmentionAllHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    _commands: string[],
) => {
    const groupId = String(event.group_id);

    if (!sessionConfigService.isLiveMentionAllEnabled(groupId)) {
        await sendReply(ctx, event, '本群未开启开播 @全体成员 提醒');
        return;
    }

    sessionConfigService.setLiveMentionAll(groupId, false);
    await sendReply(ctx, event, '已关闭本群开播 @全体成员 提醒');
};
