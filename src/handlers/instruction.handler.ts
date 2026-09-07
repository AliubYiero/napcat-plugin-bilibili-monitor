import { OB11Message } from 'napcat-types/napcat-onebot';
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { getUserRole, UserRole } from '../core/admin';
import { sendReply } from './utils';
import { addLiveHandler } from './live/add.handler';
import { removeLiveHandler } from './live/remove.handler';
import { listLiveHandler } from './live/list.handler';
import { helpLiveHandler } from './live/help.handler';
import { mentionLiveHandler } from './live/mention.handler';
import { unmentionLiveHandler } from './live/unmention.handler';
import { maxLiveHandler } from './live/max.handler';
import { addDynHandler } from './dyn/add.handler';
import { removeDynHandler } from './dyn/remove.handler';
import { latestDynHandler } from './dyn/latest.handler';
import { listDynHandler } from './dyn/list.handler';
import { maxDynHandler } from './dyn/max.handler';
import { helpDynHandler } from './dyn/help.handler';
import { loginHandler } from './user/login.handler';
import { logoutHandler } from './user/logout.handler';
import { statusHandler } from './user/status.handler';
import { helpUserHandler } from './user/help.handler';

/** 指令作用域 */
type InstructionScope = 'group' | 'private';

/** 单个形态的作用域 + 权限要求 (max 按参数个数分形态时使用) */
interface ScopeRule {
    /** 匹配的参数个数, 仅形态化 scope 使用; 省略表示不限参数个数 */
    args?: number;
    /** 允许的会话类型 */
    scope: InstructionScope;
    /** 执行该形态所需的最低角色, 省略时回落到指令级 requiredRole */
    requiredRole?: UserRole['role'];
}

/** 指令处理函数 */
type InstructionHandler = (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => void;

/** 带权限与作用域要求的指令定义 */
interface InstructionDefinition {
    handler: InstructionHandler;
    /** 执行该指令所需的最低角色, 缺省为 user (所有人可用) */
    requiredRole?: UserRole['role'];
    /** 允许的会话类型, 缺省不限 */
    scope?: InstructionScope;
    /**
     * 形态化作用域规则 (按参数个数匹配), 用于同一指令不同参数形态
     * 绑定不同作用域/权限的情况 (如 live max)。设置后指令级 scope 失效,
     * 未命中任何形态时静默返回, 不进入 handler
     */
    scopeRules?: ScopeRule[];
}

/** 角色权限等级, 用于最低角色比较 */
const ROLE_LEVEL: Record<UserRole['role'], number> = {
    user: 0,
    admin: 1,
    privateUser: 2,
    superAdmin: 3,
};

/**
 * 指令注册表: 支持一级/二级两种命名空间形态
 * - 二级: 模块 -> 子指令 -> 定义 (如 `#bili live add`)
 * - 一级: 模块名下同名子指令的简写 (如 `#bili help` 等价于 `#bili live help`
 *   之类的一级直达指令)
 */
const instructionSetMapper: Record<
    string,
    Record<string, InstructionDefinition>
> = {
    live: {
        /**
         * 添加直播间监听
         */
        add: { handler: addLiveHandler },
        /**
         * 移除直播间监听
         */
        remove: { handler: removeLiveHandler },
        /**
         * 查看当前监听的主播列表
         */
        list: { handler: listLiveHandler },
        /**
         * 查看指令帮助
         */
        help: { handler: helpLiveHandler },
        /**
         * 订阅开播 @ 提醒 (仅群聊)
         */
        mention: { handler: mentionLiveHandler, scope: 'group' },
        /**
         * 取消订阅开播 @ 提醒 (仅群聊)
         */
        unmention: { handler: unmentionLiveHandler, scope: 'group' },
        /**
         * 查看/设置监听上限
         * 无参数查看: 任意会话, admin 级
         * 设置当前群上限: 仅群聊, 超管
         * 修改指定会话上限: 仅私聊, 超管
         * 其余参数形态不拦截, 由 handler 回复用法说明
         */
        max: {
            handler: maxLiveHandler,
            scopeRules: [
                { args: 0, scope: 'group', requiredRole: 'admin' },
                { args: 0, scope: 'private', requiredRole: 'admin' },
                {
                    args: 1,
                    scope: 'group',
                    requiredRole: 'superAdmin',
                },
                {
                    args: 3,
                    scope: 'private',
                    requiredRole: 'superAdmin',
                },
            ],
        },
    },
    dyn: {
        /**
         * 添加主播动态监听
         */
        add: { handler: addDynHandler },
        /**
         * 移除主播动态监听
         */
        remove: { handler: removeDynHandler },
        /**
         * 查看主播最新一条动态
         */
        latest: { handler: latestDynHandler },
        /**
         * 查看当前监听动态的主播列表
         */
        list: { handler: listDynHandler },
        /**
         * 查看动态监听指令帮助
         */
        help: { handler: helpDynHandler },
        /**
         * 查看/设置动态监听上限
         * 形态与 live max 完全对称
         */
        max: {
            handler: maxDynHandler,
            scopeRules: [
                { args: 0, scope: 'group', requiredRole: 'admin' },
                { args: 0, scope: 'private', requiredRole: 'admin' },
                {
                    args: 1,
                    scope: 'group',
                    requiredRole: 'superAdmin',
                },
                {
                    args: 3,
                    scope: 'private',
                    requiredRole: 'superAdmin',
                },
            ],
        },
    },
    user: {
        /**
         * 扫码登录 B 站账号 (仅私聊, 超管)
         */
        login: {
            handler: loginHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        /**
         * 查询 B 站登录状态 (仅私聊, 超管)
         */
        status: {
            handler: statusHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        /**
         * 登出 B 站账号 (仅私聊, 超管)
         */
        logout: {
            handler: logoutHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
        /**
         * 查看用户登录指令帮助 (仅私聊, 超管)
         */
        help: {
            handler: helpUserHandler,
            requiredRole: 'superAdmin',
            scope: 'private',
        },
    },
};
function hasRole(
    userRole: UserRole['role'],
    requiredRole: UserRole['role'],
): boolean {
    return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

/**
 * 一级指令注册表: 指令名 -> 定义 (如 `#bili help` 这类无模块前缀的直达指令)
 */
const rootInstructionSetMapper: Record<string, InstructionDefinition> = {};

/**
 * 指令统一处理逻辑
 * 分发前校验用户角色与指令作用域:
 * - 权限不足时静默忽略
 * - 作用域不满足时回复提示
 *
 * 命名空间支持一级/二级两种形态:
 * - 二级: `模块 → 子指令`, args 前两位为模块名与子指令名
 * - 一级: args 首位即指令名, 直接查一级注册表
 */
export const instructionHandler = (
    ctx: NapCatPluginContext,
    event: OB11Message,
    args: string[],
) => {
    const [arg1, arg2, ...commands] = args.map((str) =>
        str.toLocaleLowerCase(),
    );
    if (!arg1) {
        return;
    }

    // 二级命名空间: 模块 → 子指令
    const subCommandInstruction = instructionSetMapper[arg1];
    if (subCommandInstruction) {
        if (!arg2) {
            return;
        }
        const definition = subCommandInstruction[arg2];
        if (!definition) {
            return;
        }
        dispatch(ctx, event, definition, commands);
        return;
    }

    // 一级命名空间: 指令名直接命中
    const rootDefinition = rootInstructionSetMapper[arg1];
    if (!rootDefinition) {
        return;
    }
    dispatch(ctx, event, rootDefinition, [arg2, ...commands]);
};

/**
 * 校验角色与作用域后执行指令定义
 * 所有命名空间形态共用的分发终点
 */
function dispatch(
    ctx: NapCatPluginContext,
    event: OB11Message,
    definition: InstructionDefinition,
    commands: string[],
): void {
    const { role } = getUserRole(event);
    const messageType = event.message_type as InstructionScope;

    // 形态化作用域: 按参数个数匹配, 未命中形态静默返回
    if (definition.scopeRules) {
        const rule = definition.scopeRules.find(
            (item) => item.args === commands.length,
        );
        if (!rule) {
            return;
        }
        if (
            !hasRole(
                role,
                rule.requiredRole ?? definition.requiredRole ?? 'user',
            )
        ) {
            return;
        }
        if (rule.scope !== messageType) {
            void sendScopeNotice(ctx, event, rule.scope);
            return;
        }
    } else {
        if (!hasRole(role, definition.requiredRole ?? 'user')) {
            return;
        }
        if (definition.scope && definition.scope !== messageType) {
            void sendScopeNotice(ctx, event, definition.scope);
            return;
        }
    }

    definition.handler(ctx, event, commands);
}

/** 作用域不满足时的提示 (异步发送, 不阻塞分发) */
async function sendScopeNotice(
    ctx: NapCatPluginContext,
    event: OB11Message,
    scope: InstructionScope,
): Promise<void> {
    await sendReply(
        ctx,
        event,
        scope === 'group'
            ? '该指令仅限群聊使用'
            : '该指令仅限私聊使用',
    );
}
