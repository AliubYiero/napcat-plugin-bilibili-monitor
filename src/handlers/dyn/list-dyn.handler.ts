import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliDynamicStoreService } from '../../services/bili-dynamic-store.service';
import { sendReplyByToInfo } from '../message.handler';

/**
 * 查看当前会话正在监听动态的主播列表
 */
export const listDynHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    const { message_type, group_id, user_id } = event;
    const toInfo = {
        id:
            message_type === 'group'
                ? String(group_id)
                : String(user_id),
        type: message_type,
    } as const;

    const monitors = biliDynamicStoreService.list(toInfo);
    if (monitors.length === 0) {
        await sendReplyByToInfo(
            ctx,
            toInfo,
            '当前没有正在监听动态的主播',
        );
        return;
    }

    const lines = monitors.map((monitor, index) => {
        const name = monitor.uname
            ? `${monitor.uname} (uid: ${monitor.uid})`
            : `uid: ${monitor.uid}`;
        return `${index + 1}. ${name}`;
    });
    await sendReplyByToInfo(
        ctx,
        toInfo,
        `当前监听动态的主播列表:\n${lines.join('\n')}`,
    );
};
