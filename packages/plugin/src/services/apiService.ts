/**
 * API 服务模块
 * 注册 WebUI API 路由
 *
 * 路由类型说明：
 * ┌─────────────────┬──────────────────────────────────────────────┬─────────────────┐
 * │ 类型            │ 路径前缀                                      │ 注册方法        │
 * ├─────────────────┼──────────────────────────────────────────────┼─────────────────┤
 * │ 需要鉴权 API    │ /api/Plugin/ext/<plugin-id>/                 │ router.get/post │
 * │ 无需鉴权 API    │ /plugin/<plugin-id>/api/                     │ router.getNoAuth│
 * │ 静态文件        │ /plugin/<plugin-id>/files/<urlPath>/         │ router.static   │
 * │ 内存文件        │ /plugin/<plugin-id>/mem/<urlPath>/           │ router.staticOnMem│
 * │ 页面            │ /plugin/<plugin-id>/page/<path>             │ router.page     │
 * └─────────────────┴──────────────────────────────────────────────┴─────────────────┘
 *
 * 一般插件自带的 WebUI 页面使用 NoAuth 路由，因为页面本身已在 NapCat WebUI 内嵌展示。
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { HELP_PANELS } from '../handlers/help/helpData.generated';
import { BiliCookieStore } from '../store/biliCookieStore';
import type { SessionType } from '../types';
import { sessionConfigService } from './sessionConfigService';
import { loginService } from './user/loginService';

/** 会话类型守卫: 收窄外部输入, 供路由复用 */
function isSessionType(value: unknown): value is SessionType {
    return value === 'group' || value === 'private';
}

/** 惰性获取 Cookie 存储实例 (避免模块加载期触达未初始化的 pluginState.ctx) */
function getCookieStore() {
    return BiliCookieStore.getInstance();
}

/**
 * 注册 API 路由
 */
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // ==================== 插件信息（无鉴权）====================

    /** 获取插件状态 */
    router.getNoAuth('/status', (_req, res) => {
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.config,
                stats: pluginState.stats,
            },
        });
    });

    // ==================== 配置管理（无鉴权）====================

    /** 获取配置 */
    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    /** 保存配置 */
    router.postNoAuth('/config', async (req, res) => {
        try {
            const body = req.body as
                | Record<string, unknown>
                | undefined;
            if (!body) {
                return res
                    .status(400)
                    .json({ code: -1, message: '请求体为空' });
            }
            pluginState.updateConfig(
                body as Partial<import('../types').PluginConfig>,
            );
            ctx.logger.info('配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 登录状态 (无鉴权) ====================

    /** 获取登录状态 */
    router.getNoAuth('/login/status', (_req, res) => {
        const store = getCookieStore();
        const user = store.getUser();
        res.json({
            code: 0,
            data: {
                loggedIn: store.has(),
                cookieExpired: store.isExpired(),
                user: user ?? null,
                loginTime: store.getLoginTime() ?? null,
            },
        });
    });

    /** 发起扫码登录 (与指令入口互斥) */
    router.postNoAuth('/login/qrcode', (_req, res) => {
        const error = loginService.start('webui');
        if (error) {
            return res.status(409).json({ code: -1, message: error });
        }
        res.json({ code: 0, data: loginService.getSnapshot() });
    });

    /** 轮询扫码登录会话状态 */
    router.getNoAuth('/login/qrcode/poll', (_req, res) => {
        res.json({
            code: 0,
            data: loginService.getSnapshot(),
        });
    });

    /** 登出: 清除本地 Cookie */
    router.postNoAuth('/logout', (_req, res) => {
        loginService.stop();
        getCookieStore().logout();
        ctx.logger.info('已通过 WebUI 登出 B 站账号');
        res.json({ code: 0, message: 'ok' });
    });

    // ==================== 会话管理（无鉴权）====================

    /** 获取会话列表（群 + 好友，附带各会话启用状态） */
    router.getNoAuth('/sessions', async (_req, res) => {
        try {
            const [groups, friends] = await Promise.all([
                ctx.actions.call(
                    'get_group_list',
                    {},
                    ctx.adapterName,
                    ctx.pluginManager.config,
                ) as Promise<
                    Array<{
                        group_id: number;
                        group_name: string;
                        member_count: number;
                        max_member_count: number;
                    }>
                >,
                ctx.actions.call(
                    'get_friend_list',
                    {},
                    ctx.adapterName,
                    ctx.pluginManager.config,
                ) as Promise<
                    Array<{
                        user_id: number;
                        nickname: string;
                        remark?: string;
                    }>
                >,
            ]);

            const groupSessions = (groups || []).map((group) => {
                const id = String(group.group_id);
                return {
                    id,
                    type: 'group' as const,
                    name: group.group_name,
                    enabled: sessionConfigService.isSessionEnabled(
                        id,
                        'group',
                    ),
                    memberCount: group.member_count,
                    maxMemberCount: group.max_member_count,
                };
            });

            const friendSessions = (friends || []).map((friend) => {
                const id = String(friend.user_id);
                return {
                    id,
                    type: 'private' as const,
                    name: friend.remark || friend.nickname,
                    enabled: sessionConfigService.isSessionEnabled(
                        id,
                        'private',
                    ),
                };
            });

            res.json({
                code: 0,
                data: [...groupSessions, ...friendSessions],
            });
        } catch (e) {
            ctx.logger.error('获取会话列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 更新单个会话配置 */
    router.postNoAuth(
        '/sessions/:type/:id/config',
        async (req, res) => {
            try {
                const type = req.params?.type;
                const id = req.params?.id;
                if (!isSessionType(type)) {
                    return res.status(400).json({
                        code: -1,
                        message: '非法的会话类型',
                    });
                }
                if (!id) {
                    return res
                        .status(400)
                        .json({ code: -1, message: '缺少会话 ID' });
                }

                const body = req.body as
                    | Record<string, unknown>
                    | undefined;
                const enabled = Boolean(body?.enabled);
                sessionConfigService.setSessionEnabled(
                    id,
                    type,
                    enabled,
                );
                ctx.logger.info(
                    `会话 ${type}:${id} 配置已更新: enabled=${enabled}`,
                );
                res.json({ code: 0, message: 'ok' });
            } catch (err) {
                ctx.logger.error('更新会话配置失败:', err);
                res.status(500).json({
                    code: -1,
                    message: String(err),
                });
            }
        },
    );

    /** 批量更新会话配置 */
    router.postNoAuth('/sessions/bulk-config', async (req, res) => {
        try {
            const body = req.body as
                | Record<string, unknown>
                | undefined;
            const { type, enabled, ids } = body || {};

            if (!isSessionType(type)) {
                return res
                    .status(400)
                    .json({ code: -1, message: '非法的会话类型' });
            }
            if (typeof enabled !== 'boolean' || !Array.isArray(ids)) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }

            sessionConfigService.setSessionsEnabled(
                ids.map(String),
                type,
                enabled,
            );

            ctx.logger.info(
                `批量更新会话配置完成 | type=${type}, 数量: ${ids.length}, enabled=${enabled}`,
            );
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('批量更新会话配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 帮助文档（无鉴权）====================

    /** 获取全部帮助面板 (未做权限过滤, 等同于超级管理员视图) */
    router.getNoAuth('/help', (_req, res) => {
        res.json({ code: 0, data: HELP_PANELS });
    });

    // TODO: 在这里添加你的自定义 API 路由

    ctx.logger.debug('API 路由注册完成');
}
