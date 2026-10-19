/**
 * napcat-types 垫片 · OneBot 消息类型族（退化为 any）
 *
 * 来源: napcat-types@0.0.16 (napcat-onebot 桶导出); 该包未声明 license, 仅作类型声明使用。
 * 背景与更新方式: 见 ./network/plugin/types.d.ts 头注。
 * 说明: 该族由 typebox schema 派生、体量巨大, 本垫片统一退化为 any。
 */
export type OB11Message = any;
export type OB11MessageData = any;
export type OB11MessageAt = any;
export type OB11MessageFace = any;
export type OB11MessageFile = any;
export type OB11MessageImage = any;
export type OB11MessageMFace = any;
export type OB11MessageMixType = any;
export type OB11MessageReply = any;
export type OB11MessageText = any;
export type OB11PostSendMsg = any;

/**
 * 真实定义为字符串枚举 (napcat-onebot/types/message.ts), 源码以
 * `'text' as OB11MessageDataType.text` 形式引用其成员类型。
 * 垫片改为命名空间 + any 成员, 保持该引用形态可用。
 */
export declare namespace OB11MessageDataType {
    type text = any;
    type image = any;
    type music = any;
    type video = any;
    type voice = any;
    type file = any;
    type at = any;
    type reply = any;
    type json = any;
    type face = any;
    type mface = any;
    type markdown = any;
    type node = any;
    type forward = any;
    type xml = any;
    type poke = any;
    type dice = any;
    type rps = any;
    type miniapp = any;
    type contact = any;
    type location = any;
    type onlinefile = any;
    type flashtransfer = any;
}
