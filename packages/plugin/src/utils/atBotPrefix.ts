/**
 * `@机器人` 触发判定 (纯函数模块)
 *
 * 范式: docs/instruction-pattern.md 的 "指令触发方式"
 *
 * 本模块只负责剥离与触发判定, 不负责整体 trim()、也不产生日志副作用——
 * 编排与日志由接收层 (handlers/messageHandler.ts) 承担。
 */

import { COMMAND_PREFIX, type TriggerMode } from 'shared';

/** 消息开头第一个 at CQ 段 (CQ 标记大小写不敏感, 属性部分整体捕获) */
const LEADING_AT_SEGMENT = /^\[CQ:at,([^\]]*)\]/i;

/**
 * qq 属性匹配:
 * - 属性顺序不限 (从属性串任意 `,` 处起匹配)
 * - 值可带双引号、单引号或无引号
 * - 允许额外属性 (如 `name=...`)
 */
const QQ_ATTRIBUTE =
    /(?:^|,)\s*qq\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,]*))/i;

/**
 * 剥离消息开头第一个匹配 selfId 的 at CQ 段
 *
 * - 【必须】只剥离开头**第一个** at 段, 其他 at 段保留不动
 * - 【必须】qq 值必须精确等于 selfId 的字符串形式
 * - 【必须】selfId 缺失/为空时跳过剥离, 原样返回, 不抛异常
 *
 * @param rawMessage 原始消息文本
 * @param selfId 机器人自身 QQ 号 (取自 PluginState.selfId, 不硬编码)
 * @returns 剥离后的字符串 (未剥离则为原串)
 */
export function stripAtBotPrefix(
    rawMessage: string,
    selfId: string,
): string {
    if (!rawMessage || !selfId) return rawMessage;

    const segment = rawMessage.match(LEADING_AT_SEGMENT);
    if (!segment) return rawMessage;

    const matched = QQ_ATTRIBUTE.exec(segment[1]);
    const qq = (
        matched?.[1] ??
        matched?.[2] ??
        matched?.[3] ??
        ''
    ).trim();
    if (qq !== String(selfId)) return rawMessage;

    return rawMessage.slice(segment[0].length);
}

/**
 * 触发判定: 按启用的触发方式判断消息是否触发指令
 *
 * 两种触发方式**相互独立**:
 * - `prefix`: 消息 `trim()` 后以 COMMAND_PREFIX 开头 (指令 参数);
 * - `atBot`:  消息 `trim()` 后剥离开头匹配 selfId 的 at 段, 且剥离结果
 *   `trimStart()` 后以 COMMAND_PREFIX 开头 (@机器人 指令 参数)。
 *
 * 命中返回**前缀之后的参数文本** (可能为空串; 未 trim, 由接收层切词),
 * 都未命中返回 `null`。两者都未启用时恒返回 `null` (任何消息都不触发)。
 * 只启用 `atBot` 时, 不含 @机器人 的普通前缀消息不触发。
 *
 * @param rawMessage 原始消息文本
 * @param selfId 机器人自身 QQ 号 (取自 PluginState.selfId, 不硬编码)
 * @param modes 已启用的触发方式
 */
export function resolveTriggerCommand(
    rawMessage: string,
    selfId: string,
    modes: readonly TriggerMode[],
): string | null {
    const prefix = COMMAND_PREFIX;
    const trimmed = rawMessage.trim();

    if (modes.includes('prefix') && trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length);
    }

    if (modes.includes('atBot')) {
        const stripped = stripAtBotPrefix(trimmed, selfId);
        if (stripped !== trimmed) {
            const rest = stripped.trimStart();
            if (rest.startsWith(prefix)) {
                return rest.slice(prefix.length);
            }
        }
    }

    return null;
}
