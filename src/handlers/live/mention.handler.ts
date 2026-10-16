import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { biliLiveStoreService } from '../../services/live/store.service';
import { sendReplyByToInfo } from '../utils';
import { resolveSoleLiveMonitor, toInfoFromEvent } from './utils';

/**
 * 订阅开播 @ 提醒（仅群聊）
 *
 * 带参: `#bili live mention <主播uid>` 订阅指定主播
 * 无参: `#bili live mention` 快捷形式, 当前群直播监听仅 1 个时直接订阅
 */
export const mentionLiveHandler = async (
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

    await biliLiveStoreService.addMention(
        uid,
        toInfo,
        String(event.user_id),
    );
};
