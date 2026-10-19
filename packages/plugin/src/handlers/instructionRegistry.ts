/**
 * 指令注册表 (装配层, 不含业务逻辑)
 *
 * 范式: docs/instruction-pattern.md
 * - 【必须】新增指令 = 注册表加一行; handler 写成独立文件, 注册表只做装配
 * - 【必须】指令名在分发前统一小写, 指令不区分大小写; 因此**注册表的键必须全小写**
 * - 【必须】未命中模块/子指令/一级指令时静默返回 (见 instructionDispatch)
 *
 * 三种命名空间形态最终汇入同一个校验终点 (dispatch):
 * - 三级命名空间: 模块 → 中间层 → 子指令 (纯路由前缀, 如 `live online add`)
 * - 二级命名空间: 模块 → 子指令 (如 `live add`)
 * - 一级命名空间: 无模块前缀的直达指令
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { UserRole, UserRoleName } from '../core/admin';
import { addDynHandler } from './dyn/add';
import { helpDynHandler } from './dyn/help';
import { latestDynHandler } from './dyn/latest';
import { listDynHandler } from './dyn/list';
import { maxDynHandler } from './dyn/max';
import { removeDynHandler } from './dyn/remove';
import { addLiveHandler } from './live/add';
import { helpLiveHandler } from './live/help';
import { listLiveHandler } from './live/list';
import { maxLiveHandler } from './live/max';
import { mentionLiveHandler } from './live/mention';
import { mentionAllHandler } from './live/mentionAll';
import { addOnlineHandler } from './live/online/add';
import { listOnlineHandler } from './live/online/list';
import { maxOnlineHandler } from './live/online/max';
import { removeOnlineHandler } from './live/online/remove';
import { showOnlineHandler } from './live/online/show';
import { removeLiveHandler } from './live/remove';
import { unmentionLiveHandler } from './live/unmention';
import { unmentionAllHandler } from './live/unmentionAll';
import { helpUserHandler } from './user/help';
import { loginHandler } from './user/login';
import { logoutHandler } from './user/logout';
import { statusHandler } from './user/status';

/** 指令作用域 */
export type InstructionScope = 'group' | 'private';

/**
 * 指令 handler
 *
 * 【必须】收到的参数已保证满足角色与作用域要求, handler 内部不再重复校验。
 * 第四个参数 `userRole` 是入口处一次性推导的结果, 不需要时省略该形参即可。
 */
export type InstructionHandler = (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
    userRole: UserRole,
) => void | Promise<void>;

/** 单个形态的作用域 + 权限要求 (max 按参数个数分形态时使用) */
export interface ScopeRule {
    /** 匹配的参数个数, 仅形态化 scope 使用; 省略表示不限参数个数 */
    args?: number;
    /** 允许的会话类型, 省略表示不限 (任意会话均可用) */
    scope?: InstructionScope;
    /** 执行该形态所需的最低角色, 省略时回落到指令级 requiredRole */
    requiredRole?: UserRoleName;
}

/** 带权限与作用域要求的指令定义 */
export interface InstructionDefinition {
    handler: InstructionHandler;
    /** 执行该指令所需的最低角色, 缺省为 user (所有人可用) */
    requiredRole?: UserRoleName;
    /** 允许的会话类型, 缺省不限 */
    scope?: InstructionScope;
    /**
     * 形态化作用域规则 (按参数个数匹配), 用于同一指令不同参数形态
     * 绑定不同作用域/权限的情况 (如 live max)。设置后指令级 scope 失效,
     * 未命中任何形态时静默返回, 不进入 handler
     */
    scopeRules?: ScopeRule[];
}

/**
 * 三级命名空间注册表: 模块 -> 中间层 -> 子指令 -> 定义
 * 中间层为纯路由前缀 (如 `online`), 不携带权限/作用域属性,
 * 权限与作用域完全由叶子指令声明。匹配优先于二级注册表。
 */
export const nestedInstructionSetMapper: Record<
    string,
    Record<string, Record<string, InstructionDefinition>>
> = {
    live: {
        online: {
            /**
             * 添加主播到同接数监听列表 (直播监听的附属功能, 管理员)
             */
            add: { handler: addOnlineHandler, requiredRole: 'admin' },
            /**
             * 从同接数监听列表移除主播 (管理员)
             */
            remove: {
                handler: removeOnlineHandler,
                requiredRole: 'admin',
            },
            /**
             * 查看当前正在监听同接数的主播列表
             */
            list: { handler: listOnlineHandler },
            /**
             * 输出主播同接变化图表
             * 无参快捷形式: 当前会话同接监听仅 1 个时直接输出
             */
            show: { handler: showOnlineHandler },
            /**
             * 查看/设置同接监听上限
             * 形态与 live max 对称, 默认上限群 1 / 私 0
             */
            max: {
                handler: maxOnlineHandler,
                scopeRules: [
                    {
                        args: 0,
                        requiredRole: 'admin',
                    },
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
        mention: {
            /**
             * 开启本群开播 @全体成员提醒 (仅群聊, 管理员)
             */
            all: {
                handler: mentionAllHandler,
                requiredRole: 'admin',
                scope: 'group',
            },
        },
        unmention: {
            /**
             * 关闭本群开播 @全体成员提醒 (仅群聊, 管理员)
             */
            all: {
                handler: unmentionAllHandler,
                requiredRole: 'admin',
                scope: 'group',
            },
        },
    },
};

/**
 * 二级命名空间注册表: 模块 -> 子指令 -> 定义
 * - 二级: `#bili live add`
 * - 一级简写 (如 `#bili help`) 见 rootInstructionSetMapper
 */
export const instructionSetMapper: Record<
    string,
    Record<string, InstructionDefinition>
> = {
    live: {
        /**
         * 添加直播间监听 (管理员)
         */
        add: { handler: addLiveHandler, requiredRole: 'admin' },
        /**
         * 移除直播间监听 (管理员)
         */
        remove: { handler: removeLiveHandler, requiredRole: 'admin' },
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
                { args: 0, requiredRole: 'admin' },
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
         * 添加主播动态监听 (管理员)
         */
        add: { handler: addDynHandler, requiredRole: 'admin' },
        /**
         * 移除主播动态监听 (管理员)
         */
        remove: { handler: removeDynHandler, requiredRole: 'admin' },
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
                { args: 0, requiredRole: 'admin' },
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

/**
 * 一级命名空间注册表: 指令名 -> 定义 (如 `#bili help` 这类无模块前缀的直达指令)
 */
export const rootInstructionSetMapper: Record<
    string,
    InstructionDefinition
> = {};
