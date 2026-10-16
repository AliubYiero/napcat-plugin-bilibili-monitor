import type { OB11Message } from 'napcat-types/napcat-onebot';
import type {
    BiliLiveMonitor,
    BiliLiveMonitorToInfo,
} from '../../store/biliLiveMonitor.store';

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

/** 无参快捷指令的解析结果: 命中唯一主播, 或需回给用户的提示文案 */
export type SoleLiveMonitorResolution =
    | { uid: string }
    | { message: string };

/**
 * 解析无参快捷指令的目标主播
 *
 * 无参形态下要求当前会话仅存在 1 个直播监听: 命中则返回该主播 uid;
 * 零监听或多监听时返回一句话提示 (多监听附带动编号的监听列表),
 * 由调用方决定发送。判定为纯函数, 不触达存储与发送链路。
 */
export function resolveSoleLiveMonitor(
    monitors: BiliLiveMonitor[],
): SoleLiveMonitorResolution {
    if (monitors.length === 0) {
        return {
            message:
                '当前未监听任何主播, 请先使用 #bili live add <主播uid> 添加',
        };
    }
    if (monitors.length > 1) {
        return {
            message:
                `当前会话监听了 ${monitors.length} 个主播, 请指定:\n` +
                monitors
                    .map(
                        (m, i) =>
                            `${i + 1}. ${m.uname || '主播'} (uid: ${m.uid})`,
                    )
                    .join('\n'),
        };
    }
    return { uid: monitors[0].uid };
}
