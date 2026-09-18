/**
 * 查看或设置同接监听上限（权限与作用域由指令分发层按参数形态校验）
 *
 * - 任意会话: `#bili live online max` 查看当前会话上限 (admin 级)
 * - 群聊超管: `#bili live online max <n>` 设置当前群上限
 * - 超管私聊: `#bili live online max <n> <group|private> <id>` 修改指定会话上限
 * - 私聊查看: 仅超管列出所有自定义上限的会话, 其余只显示自己上限
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendReply } from '../../utils';
import { toInfoFromEvent } from '../utils';
import { getUserRole } from '../../../core/admin';
import { biliOnlineMonitorService } from '../../../services/live/onlineMonitor.service';
import {
    DEFAULT_GROUP_ONLINE_LIMIT,
    DEFAULT_PRIVATE_ONLINE_LIMIT,
    MAX_ONLINE_LIMIT,
    MIN_ONLINE_LIMIT,
    getOnlineLimit,
    listOnlineLimits,
    setOnlineLimit,
} from '../../../services/live/onlineLimit.service';

const usageText = [
    '用法:',
    '#bili live online max 查看同接监听上限',
    '#bili live online max <监听数> 设置当前群同接监听上限',
    '[超管私聊] #bili live online max <监听数> <group|private> <id> 修改指定会话上限',
].join('\n');

/**
 * 处理同接监听上限查看/设置
 */
export const maxOnlineHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const toInfo = toInfoFromEvent(event);
    const [firstArg, secondArg, thirdArg] = commands;

    // 无参数 → 查看模式
    if (!firstArg) {
        await replyLimitInfo(ctx, event, toInfo);
        return;
    }

    const max = Number(firstArg);
    if (
        !Number.isInteger(max) ||
        max < MIN_ONLINE_LIMIT ||
        max > MAX_ONLINE_LIMIT
    ) {
        await sendReply(
            ctx,
            event,
            `同接监听上限范围 ${MIN_ONLINE_LIMIT}~${MAX_ONLINE_LIMIT}\n${usageText}`,
        );
        return;
    }

    // 群聊 → 设置当前群上限（多余参数宽松忽略）
    if (event.message_type === 'group') {
        await applyLimit(
            ctx,
            event,
            String(event.group_id),
            'group',
            max,
        );
        return;
    }

    // 私聊 → 需要指定目标会话 <group|private> <id>
    if (
        (secondArg !== 'group' && secondArg !== 'private') ||
        !thirdArg
    ) {
        await sendReply(ctx, event, usageText);
        return;
    }
    await applyLimit(ctx, event, thirdArg, secondArg, max);
};

/**
 * 回复当前会话的同接监听上限信息
 * 私聊仅超管额外列出所有自定义上限的会话, 其余只显示自己上限
 */
async function replyLimitInfo(
    ctx: NapCatPluginContext,
    event: OB11Message,
    toInfo: { id: string; type: 'private' | 'group' },
): Promise<void> {
    const limit = getOnlineLimit(toInfo);
    const current = biliOnlineMonitorService.list(toInfo).length;
    const lines = [
        `当前会话同接监听上限: ${limit === Infinity ? '无上限' : limit} (已监听 ${current})`,
    ];

    if (
        toInfo.type === 'private' &&
        getUserRole(event).role === 'superAdmin'
    ) {
        const limits = listOnlineLimits();
        if (limits.length > 0) {
            lines.push(
                '\n自定义上限的会话:',
                ...limits.map(
                    (item) =>
                        `#${item.type === 'group' ? '群' : '私聊'} ${item.id}: ${item.max}`,
                ),
            );
        } else {
            lines.push(
                `\n所有会话均为默认上限 (私聊 ${DEFAULT_PRIVATE_ONLINE_LIMIT}, 群聊 ${DEFAULT_GROUP_ONLINE_LIMIT})`,
            );
        }
    }

    await sendReply(ctx, event, lines.join('\n'));
}

/**
 * 设置上限并回复结果
 * 新上限低于当前同接监听数时附带提醒
 */
async function applyLimit(
    ctx: NapCatPluginContext,
    event: OB11Message,
    id: string,
    type: 'private' | 'group',
    max: number,
): Promise<void> {
    setOnlineLimit(id, type, max);

    const targetToInfo = { id, type } as const;
    const current =
        biliOnlineMonitorService.list(targetToInfo).length;
    const lines = [
        `已将会话 (${type === 'group' ? '群' : '私聊'} ${id}) 同接监听上限设为 ${max}`,
    ];
    if (current > max) {
        lines.push(
            `当前已有 ${current} 个同接监听, 超出部分仍会推送, 但无法新增监听`,
        );
    }
    await sendReply(ctx, event, lines.join('\n'));
}
