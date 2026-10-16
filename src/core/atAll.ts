/**
 * @全体成员 发送能力校验模块
 *
 * 封装"机器人能否在指定群发送 @全体成员"的前置校验:
 * 机器人须为本群管理员/群主, 且当日群配额未用完。
 * 校验只读不写, 任何查询失败一律按"不可发送"处理 (静默降级),
 * 由调用方决定跳过 @全体还是普通发送。范式见 docs/message-send-pattern.md。
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from './state';

/** 机器人在群内的成员角色 */
export type BotGroupRole = 'owner' | 'admin' | 'member';

/** @全体成员 配额查询结果 (字段名沿用 OneBot 11 的 get_group_at_all_remain) */
interface AtAllRemain {
    /** 机器人账号在该群是否具备 @全体成员 权限 */
    can_at_all: boolean;
    /** 该群当日剩余 @全体成员 次数 */
    remain_at_all_count_for_group: number;
    /** 机器人账号当日剩余 @全体成员 次数 (跨群共享) */
    remain_at_all_count_for_uin: number;
}

/**
 * 查询机器人自身在指定群的成员角色
 * 查询失败、机器人 QQ 未知或角色无法识别时返回 null
 */
export async function getBotGroupRole(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<BotGroupRole | null> {
    if (!pluginState.selfId) return null;
    try {
        const info = (await ctx.actions.call(
            'get_group_member_info',
            {
                group_id: String(groupId),
                user_id: pluginState.selfId,
            },
            ctx.adapterName,
            ctx.pluginManager.config,
        )) as { role?: string };
        if (
            info?.role === 'owner' ||
            info?.role === 'admin' ||
            info?.role === 'member'
        ) {
            return info.role;
        }
        return null;
    } catch (error) {
        pluginState.logger.debug('查询机器人群成员角色失败:', error);
        return null;
    }
}

/**
 * 判断机器人是否为指定群的管理员/群主
 * 查询失败视为否 (fail-closed)
 */
export async function isBotGroupAdmin(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<boolean> {
    const role = await getBotGroupRole(ctx, groupId);
    return role === 'owner' || role === 'admin';
}

/** 查询群内 @全体成员 剩余配额; 查询失败返回 null (按不可发送处理) */
async function getAtAllQuota(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<AtAllRemain | null> {
    try {
        return (await ctx.actions.call(
            'get_group_at_all_remain',
            { group_id: String(groupId) },
            ctx.adapterName,
            ctx.pluginManager.config,
        )) as AtAllRemain;
    } catch (error) {
        pluginState.logger.debug('查询 @全体成员 配额失败:', error);
        return null;
    }
}

/**
 * 判断能否对指定群发送 @全体成员
 * 需机器人为群管理员且群内当日配额未用完; 任一条件不满足或查询失败
 * 均返回 false (静默降级, 不向用户提示)
 */
export async function canSendAtAll(
    ctx: NapCatPluginContext,
    groupId: string | number,
): Promise<boolean> {
    if (!(await isBotGroupAdmin(ctx, groupId))) return false;
    const quota = await getAtAllQuota(ctx, groupId);
    return (
        !!quota &&
        quota.can_at_all &&
        quota.remain_at_all_count_for_group > 0
    );
}
