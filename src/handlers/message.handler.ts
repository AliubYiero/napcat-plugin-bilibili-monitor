/**
 * 消息处理器
 *
 * 处理接收到的 QQ 消息事件，包含：
 * - 命令前缀检查与参数解析
 * - 交给 instructionHandler 分发（范式见 docs/instruction-pattern.md）
 *
 * 发送工具函数见 utils.ts（范式见 docs/message-send-pattern.md）。
 */

import { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { instructionHandler } from './instruction.handler';

/**
 * 消息处理主函数
 * 在这里实现你的命令处理逻辑
 */
export async function handleMessage(
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<void> {
    try {
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type;
        const groupId = event.group_id;

        pluginState.ctx.logger.debug(
            `收到消息: ${rawMessage} | 类型: ${messageType}`,
        );

        // 群消息：检查该群是否启用
        if (messageType === 'group' && groupId) {
            if (!pluginState.isGroupEnabled(String(groupId))) return;
        }

        // 检查命令前缀
        const prefix = pluginState.config.commandPrefix || '#cmd';
        if (!rawMessage.startsWith(prefix)) return;

        // 解析命令参数
        const args = rawMessage
            .slice(prefix.length)
            .trim()
            .split(/\s+/);

        // 命令处理逻辑
        instructionHandler(ctx, event, args);
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
