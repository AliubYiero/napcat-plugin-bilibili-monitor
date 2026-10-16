import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { getBotGroupRole } from '../../core/atAll';
import { pluginState } from '../../core/state';
import { sendReply } from '../utils';

/**
 * 开启本群开播 @全体成员提醒（仅群聊、管理员）
 *
 * 开启前确认机器人为本群管理员: 查询失败则 fail-closed 拒绝,
 * 机器人非管理员时提示先设为管理员。
 */
export const mentionAllHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    _commands: string[],
) => {
    const groupId = String(event.group_id);

    const role = await getBotGroupRole(ctx, groupId);
    if (role === null) {
        await sendReply(
            ctx,
            event,
            '开启失败：无法确认机器人权限, 请稍后重试',
        );
        return;
    }
    if (role === 'member') {
        await sendReply(
            ctx,
            event,
            '开启失败：机器人不是本群管理员, 请先将机器人设为群管理员',
        );
        return;
    }

    pluginState.updateGroupConfig(groupId, { liveMentionAll: true });
    await sendReply(ctx, event, '已开启本群开播 @全体成员提醒');
};
