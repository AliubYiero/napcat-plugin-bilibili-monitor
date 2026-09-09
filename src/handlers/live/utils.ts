import { OB11Message } from 'napcat-types/napcat-onebot';
import type { BiliLiveMonitorToInfo } from '../../store/biliLive.store';

/**
 * 从消息事件构造会话推送目标信息
 * 群聊取群号, 私聊取发送者 QQ 号
 */
export function toInfoFromEvent(
    event: OB11Message,
): BiliLiveMonitorToInfo {
    const { message_type, group_id, user_id } = event;
    return {
        id:
            message_type === 'group'
                ? String(group_id)
                : String(user_id),
        type: message_type,
    };
}
