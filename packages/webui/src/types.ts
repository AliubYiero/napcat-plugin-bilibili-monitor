/** WebUI 前端类型定义 */
import type { PluginConfig } from 'shared';

export type {
    ApiResponse,
    Cmd,
    ContentHelp,
    ContentHelpMethod,
    Instruction,
    InstructionSet,
    PluginConfig,
    Role,
    SessionConfig,
    SessionConfigBase,
    SessionType,
} from 'shared';

export interface PluginStatus {
    pluginName: string;
    uptime: number;
    uptimeFormatted: string;
    config: PluginConfig;
    stats: {
        processed: number;
        todayProcessed: number;
        lastUpdateDay: string;
    };
}

/**
 * 会话信息（群或好友），对应后端 GET /sessions 的归一化返回
 */
export interface SessionInfo {
    /** 群号或用户 QQ 号 */
    id: string;
    type: 'group' | 'private';
    /** 群名 / 好友备注（无备注时取昵称） */
    name: string;
    enabled: boolean;
    /** 仅群会话提供 */
    memberCount?: number;
    maxMemberCount?: number;
}
