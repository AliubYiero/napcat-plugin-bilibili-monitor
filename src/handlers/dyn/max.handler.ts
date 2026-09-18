/**
 * 查看或设置动态监听上限（权限与作用域由指令分发层按参数形态校验）
 *
 * - 任意会话: `#bili dyn max` 查看当前会话上限 (admin 级)
 * - 群聊超管: `#bili dyn max <n>` 设置当前群上限
 * - 超管私聊: `#bili dyn max <n> <group|private> <id>` 修改指定会话上限
 * - 私聊查看: 仅超管列出所有自定义上限的会话, 其余只显示自己上限
 */

import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { sendReply } from '../utils';
import { getUserRole } from '../../core/admin';
import { biliDynamicStoreService } from '../../services/dyn/store.service';
import {
    DEFAULT_GROUP_LIMIT,
    DEFAULT_PRIVATE_LIMIT,
    MAX_LIMIT,
    MIN_LIMIT,
    getDynLimit,
    listDynLimits,
    setDynLimit,
} from '../../services/dyn/limit.service';

const usageText = [
    '用法:',
    '#bili dyn max 查看动态监听上限',
    '#bili dyn max <监听数> 设置当前群动态监听上限',
    '[超管私聊] #bili dyn max <监听数> <group|private> <id> 修改指定会话上限',
].join('\n');

/**
 * 处理动态监听上限查看/设置
 */
export const maxDynHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const { message_type, group_id, user_id } = event;
    const toInfo = {
        id:
            message_type === 'group'
                ? String(group_id)
                : String(user_id),
        type: message_type,
    } as const;

    const [firstArg, secondArg, thirdArg] = commands;

    // 无参数 → 查看模式
    if (!firstArg) {
        await replyLimitInfo(ctx, event, toInfo);
        return;
    }

    const max = Number(firstArg);
    if (
        !Number.isInteger(max) ||
        max < MIN_LIMIT ||
        max > MAX_LIMIT
    ) {
        await sendReply(
            ctx,
            event,
            `动态监听上限范围 ${MIN_LIMIT}~${MAX_LIMIT}\n${usageText}`,
        );
        return;
    }

    // 群聊 → 设置当前群上限（多余参数宽松忽略）
    if (message_type === 'group') {
        await applyLimit(ctx, event, String(group_id), 'group', max);
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
 * 回复当前会话的动态监听上限信息
 * 私聊仅超管额外列出所有自定义上限的会话, 其余只显示自己上限
 */
async function replyLimitInfo(
    ctx: NapCatPluginContext,
    event: OB11Message,
    toInfo: { id: string; type: 'private' | 'group' },
): Promise<void> {
    const limit = getDynLimit(toInfo);
    const current = biliDynamicStoreService.list(toInfo).length;
    const lines = [
        `当前会话动态监听上限: ${limit === Infinity ? '无上限' : limit} (已监听 ${current})`,
    ];

    if (
        toInfo.type === 'private' &&
        getUserRole(event).role === 'superAdmin'
    ) {
        const limits = listDynLimits();
        if (limits.length > 0) {
            lines.push(
                '\n自定义动态上限的会话:',
                ...limits.map(
                    (item) =>
                        `#${item.type === 'group' ? '群' : '私聊'} ${item.id}: ${item.max}`,
                ),
            );
        } else {
            lines.push(
                `\n所有会话均为默认上限 (私聊 ${DEFAULT_PRIVATE_LIMIT}, 群聊 ${DEFAULT_GROUP_LIMIT})`,
            );
        }
    }

    await sendReply(ctx, event, lines.join('\n'));
}

/**
 * 设置动态监听上限并回复结果
 * 新上限低于当前订阅数时附带提醒
 */
async function applyLimit(
    ctx: NapCatPluginContext,
    event: OB11Message,
    id: string,
    type: 'private' | 'group',
    max: number,
): Promise<void> {
    setDynLimit(id, type, max);

    const targetToInfo = { id, type } as const;
    const current = biliDynamicStoreService.list(targetToInfo).length;
    const lines = [
        `已将会话 (${type === 'group' ? '群' : '私聊'} ${id}) 动态监听上限设为 ${max}`,
    ];
    if (current > max) {
        lines.push(
            `当前已有 ${current} 个动态订阅, 超出部分仍会推送, 但无法新增订阅`,
        );
    }
    await sendReply(ctx, event, lines.join('\n'));
}
