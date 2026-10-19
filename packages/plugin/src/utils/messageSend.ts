/**
 * 发送工具模块
 *
 * 插件内所有消息发送的统一出口（范式见 docs/message-send-pattern.md）：
 * - 回复与主动推送统一走本模块，禁止在业务代码中直接调用 ctx.actions.call
 * - 内部统一 try/catch，失败记录日志并返回 false，不向调用方抛出
 *
 * 位于 utils 而非 handlers: services 层需要发送能力 (主动推送), 若发送工具
 * 留在 handlers 会让 services → handlers 形成逆依赖; 下沉到 utils 后
 * handlers 与 services 同为消费者。
 */

import type {
    OB11Message,
    OB11MessageAt,
    OB11MessageDataType,
    OB11MessageText,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import type { BiliLiveMonitorToInfo } from '../store/biliLiveMonitorStore';

/**
 * 发送消息（通用）
 * 根据消息类型自动发送到群或私聊
 *
 * @param ctx 插件上下文
 * @param event 原始消息事件（用于推断回复目标）
 * @param message 消息内容（支持字符串或消息段数组）
 */
export async function sendReply(
    ctx: NapCatPluginContext,
    event: OB11Message,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call(
            'send_msg',
            params,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送消息失败:', error);
        return false;
    }
}

/**
 * 发送消息（通用）
 * 根据消息类型自动发送到群或私聊
 *
 * @param ctx 插件上下文
 * @param toInfo 消息来源
 * @param message 消息内容（支持字符串或消息段数组）
 */
export async function sendReplyByToInfo(
    ctx: NapCatPluginContext,
    toInfo: BiliLiveMonitorToInfo,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        const id =
            toInfo.type === 'group'
                ? { group_id: toInfo.id }
                : { user_id: toInfo.id };

        const params: OB11PostSendMsg = {
            message,
            message_type: toInfo.type,
            ...id,
        };
        await ctx.actions.call(
            'send_msg',
            params,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送消息失败:', error);
        return false;
    }
}

/**
 * 发送群消息
 */
export async function sendGroupMessage(
    ctx: NapCatPluginContext,
    groupId: number | string,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: 'group',
            group_id: String(groupId),
        };
        await ctx.actions.call(
            'send_msg',
            params,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送群消息失败:', error);
        return false;
    }
}

/**
 * 发送私聊消息
 */
export async function sendPrivateMessage(
    ctx: NapCatPluginContext,
    userId: number | string,
    message: OB11PostSendMsg['message'],
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: 'private',
            user_id: String(userId),
        };
        await ctx.actions.call(
            'send_msg',
            params,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送私聊消息失败:', error);
        return false;
    }
}

// ==================== 合并转发消息 ====================

/** 合并转发消息节点 */
export interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: Array<{
            type: string;
            data: Record<string, unknown>;
        }>;
    };
}

/**
 * 发送合并转发消息
 * @param ctx 插件上下文
 * @param target 群号或用户 ID
 * @param isGroup 是否为群消息
 * @param nodes 合并转发节点列表
 */
export async function sendForwardMsg(
    ctx: NapCatPluginContext,
    target: number | string,
    isGroup: boolean,
    nodes: ForwardNode[],
): Promise<boolean> {
    try {
        const actionName = isGroup
            ? 'send_group_forward_msg'
            : 'send_private_forward_msg';
        const params: Record<string, unknown> = { message: nodes };
        if (isGroup) {
            params.group_id = String(target);
        } else {
            params.user_id = String(target);
        }
        await ctx.actions.call(
            actionName as 'send_group_forward_msg',
            params as never,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送合并转发消息失败:', error);
        return false;
    }
}

/**
 * 创建图片消息段
 */
export function createImageMessage(
    file: string,
): OB11PostSendMsg['message'] {
    return {
        type: 'image' as OB11MessageDataType.image,
        data: { file },
    };
}

/**
 * 创建文本消息段
 */
export function createTextMessage(text: string): OB11MessageText {
    return {
        type: 'text' as OB11MessageDataType.text,
        data: { text },
    };
}

/**
 * 创建 @ 消息段
 * @param qq 目标 QQ 号, 取固定值 'all' 即 @全体成员
 * @param name 群昵称, @全体成员 时无需传入
 */
export function createAtMessage(
    qq: string,
    name?: string,
): OB11MessageAt {
    const data: OB11MessageAt['data'] = { qq };
    if (name) data.name = name;
    return { type: 'at' as OB11MessageDataType.at, data };
}

/**
 * 创建 "@ + 分隔文本" 组合消息段
 *
 * @ 段后紧跟一段分隔文本 (默认一个空格, 与 QQ 原生 @ 后自动补空格的观感一致),
 * 用于规避 "@ 段后直接贴图片/文本被客户端挤压" 的排版问题。
 *
 * @param qq 目标 QQ 号, 取固定值 'all' 即 @全体成员
 * @param name 群昵称, @全体成员 时无需传入
 * @param separator @ 段后追加的分隔文本, 默认一个空格
 * @returns 两段消息段数组 [at, text]
 */
export function createAtMessageWithSeparator(
    qq: string,
    name?: string,
    separator: string = ' ',
): Array<OB11MessageAt | OB11MessageText> {
    return [createAtMessage(qq, name), createTextMessage(separator)];
}

/**
 * 在消息最前面插入 @全体成员 段
 * 字符串消息升级为消息段数组 (纯 @全体成员 无正文在多数客户端渲染为空白,
 * 故 @全体成员 后始终跟随一段分隔文本与原有正文)
 *
 * @param message 原消息内容
 * @param separator @全体成员 段后追加的分隔文本, 默认一个空格
 */
export function prependAtAllMessage(
    message: OB11PostSendMsg['message'],
    separator: string = ' ',
): OB11PostSendMsg['message'] {
    const atSegments = createAtMessageWithSeparator(
        'all',
        undefined,
        separator,
    );
    if (typeof message === 'string') {
        return [...atSegments, createTextMessage(message)];
    }
    // OB11PostSendMsg['message'] 允许单段形态, 展开前先归一为数组
    return [
        ...atSegments,
        ...(Array.isArray(message) ? message : [message]),
    ];
}
