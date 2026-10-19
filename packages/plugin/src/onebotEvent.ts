/**
 * OneBot 事件类型枚举
 *
 * 来源: OneBot 11 协议的 post_type; 取值取自 napcat-types@0.0.16
 *   (napcat-onebot/event/OneBotEvent.ts)。
 * 自持原因: 这是唯一以「值」形式使用的第三方类型; 改为自持后, 其余对
 *   napcat-types 的引用均为 `import type` (会被擦除), 因此可移除对该包的
 *   运行时与构建依赖。详见 AGENTS.md「构建 / 验证 / 部署」。
 */
export enum EventType {
    META = 'meta_event',
    REQUEST = 'request',
    NOTICE = 'notice',
    MESSAGE = 'message',
    MESSAGE_SENT = 'message_sent',
}
