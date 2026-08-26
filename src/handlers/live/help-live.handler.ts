import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../message.handler';

/**
 * 输出 Bilibili 监听插件指令帮助
 */
export const helpLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    const { message_type, group_id, user_id } = event;
    const toInfo = {
        id: message_type === 'group' ? String(group_id) : String(user_id),
        type: message_type,
    } as const;

    const helpText = [
        'Bilibili 监听插件指令帮助:',
        '#bili live add <主播uid> 添加主播监听',
        '#bili live remove <主播uid> 移除主播监听',
        '#bili live list 查看当前监听的主播列表',
        '#bili live mention <主播uid> 订阅主播开播 @ 提醒',
        '#bili live unmention <主播uid> 取消订阅开播 @ 提醒',
        '#bili live help 查看指令帮助',
    ].join('\n');
    await sendReplyByToInfo(ctx, toInfo, helpText);
};
