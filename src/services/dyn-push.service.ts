/**
 * 动态推送服务
 *
 * 输入解析后的 ParsedDyn + 目标列表，组装消息段并发送：
 * - 普通动态: 文本 segments + 图片 segments（图片在最后）
 * - LIVE_RCMD: 逐目标判断，已在 live store 监听该主播的目标跳过
 *   (由直播推送负责)，否则复用 buildChangeMessage 开播卡片
 */

import { pluginState } from '../core/state';
import type {
    OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../handlers/message.handler';
import type { BiliDynamicMonitorToInfo } from '../store/bili-dynamic.store';
import { BiliLiveStore } from '../store/bili-live.store';
import { BiliLiveRoomStore } from '../store/bili-live-room.store';
import { buildChangeMessage } from './live-push-card.service';
import type { ParsedDyn } from './dyn-parser.service';

/** 消息段类型别名 */
type MessageSegment = OB11PostSendMsg['message'][number];

/** 组装普通动态的推送消息（文本 + 图片） */
export function buildDynMessage(
    dyn: ParsedDyn,
): OB11PostSendMsg['message'] | null {
    const lines: string[] = [dyn.headline, ...dyn.texts];

    // 转发动态: 分隔线 + 原动态卡片
    if (dyn.separator && dyn.origCard) {
        lines.push(
            '',
            dyn.separator,
            '',
            dyn.origCard.headline,
            ...dyn.origCard.texts,
        );
    }

    // 文本为空且无图片时无法构成消息
    const text = lines.join('\n');
    const images = [...dyn.images];
    if (dyn.origCard) {
        images.push(...dyn.origCard.images);
    }
    if (!text.trim() && images.length === 0) return null;

    const segments: MessageSegment[] = [
        {
            type: 'text' as OB11MessageDataType.text,
            data: { text },
        },
        ...images.map(
            (url) =>
                ({
                    type: 'image' as OB11MessageDataType.image,
                    data: { file: url },
                }) as MessageSegment,
        ),
    ];
    return segments;
}

/**
 * 将一条解析后的动态推送到目标列表
 * LIVE_RCMD 逐目标判断是否复用直播开播卡片
 */
export async function pushDynToTargets(
    dyn: ParsedDyn,
    hostUid: string,
    targets: BiliDynamicMonitorToInfo[],
): Promise<void> {
    for (const toInfo of targets) {
        try {
            let message: OB11PostSendMsg['message'] | null = null;

            if (dyn.kind === 'live') {
                // 该目标已在 live store 监听该主播 → 由直播推送负责
                if (isLiveMonitored(hostUid, toInfo)) {
                    pluginState.logger.debug(
                        `目标 ${toInfo.type}:${toInfo.id} 已监听直播, 跳过 LIVE_RCMD 动态 (uid=${hostUid})`,
                    );
                    continue;
                }
                message = await buildLiveCardForDyn(hostUid);
            } else {
                message = buildDynMessage(dyn);
            }

            if (!message) continue;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (err) {
            pluginState.logger.error(
                `推送动态到 ${toInfo.type}:${toInfo.id} 失败:`,
                err,
            );
        }
    }
}

/** 判断某目标是否在 live store 中监听了该主播 */
function isLiveMonitored(
    uid: string,
    toInfo: BiliDynamicMonitorToInfo,
): boolean {
    return BiliLiveStore.getInstance().has(uid, toInfo);
}

/**
 * 为 LIVE_RCMD 动态构建开播卡片消息
 * 复用 live 的 buildChangeMessage（卡片渲染失败自动回退纯文本）
 */
async function buildLiveCardForDyn(
    uid: string,
): Promise<OB11PostSendMsg['message'] | null> {
    const roomInfo = BiliLiveRoomStore.getInstance().get(uid);
    if (!roomInfo) {
        pluginState.logger.debug(
            `LIVE_RCMD 动态推送时无房间基线数据 (uid=${uid}), 跳过`,
        );
        return null;
    }
    return buildChangeMessage(
        { uid, type: 'start_stream', newValue: 'streaming' },
        BiliLiveRoomStore.getInstance(),
    );
}
