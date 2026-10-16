import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../../core/state';
import { sendReply } from '../utils';

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

    if (!pluginState.isLiveMentionAllEnabled(groupId)) {
        await sendReply(ctx, event, '本群未开启开播 @全体成员提醒');
        return;
    }

    pluginState.updateGroupConfig(groupId, { liveMentionAll: false });
    await sendReply(ctx, event, '已关闭本群开播 @全体成员提醒');
};
