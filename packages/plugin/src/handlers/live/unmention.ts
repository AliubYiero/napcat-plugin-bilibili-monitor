import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { biliLiveStoreService } from '../../services/live/storeService';
import { sendReplyByToInfo } from '../../utils/messageSend';
import { resolveSoleLiveMonitor, toInfoFromEvent } from './utils';

/**
 * 取消开播 @ 提醒订阅（仅群聊）
 *
 * 带参: `#bili live unmention <主播uid>` 取消指定主播的订阅
 * 无参: `#bili live unmention` 快捷形式, 当前群直播监听仅 1 个时直接取消
 */
export const unmentionLiveHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const toInfo = toInfoFromEvent(event);
    const [uidArg] = commands;

    // 解析目标主播: 无参时要求当前群仅 1 个直播监听对象
    let uid = uidArg;
    if (!uid) {
        const resolved = resolveSoleLiveMonitor(
            biliLiveStoreService.list(toInfo),
        );
        if ('message' in resolved) {
            await sendReplyByToInfo(ctx, toInfo, resolved.message);
            return;
        }
        uid = resolved.uid;
    }

    await biliLiveStoreService.removeMention(
        uid,
        toInfo,
        String(event.user_id),
    );
};
