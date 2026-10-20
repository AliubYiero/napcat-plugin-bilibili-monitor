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

import { existsSync } from 'node:fs';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { AddMonitorRequest } from 'shared';
import { pluginState } from '../core/state';
import { HELP_PANELS } from '../handlers/help/helpData.generated';
import { BiliCookieStore } from '../store/biliCookieStore';
import type { SessionType } from '../types';
import {
    getDynMonitors,
    getLimitsView,
    getLiveMonitors,
    getMonitorHealth,
} from './monitorStatusService';
import {
    addDynMonitors,
    addLiveMonitors,
    isMonitorUid,
    parseLimitKind,
    parseMonitorTarget,
    removeDynMonitor,
    removeLiveMonitor,
    removeMonitorLimit,
    setMonitorLimit,
    setOnlineMonitor,
} from './monitorWriteService';
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

    /** 刷新二维码: 重启 WebUI 发起的会话 (生成新码) */
    router.postNoAuth('/login/qrcode/refresh', (_req, res) => {
        const error = loginService.restart('webui');
        if (error) {
            return res.status(409).json({ code: -1, message: error });
        }
        res.json({ code: 0, data: loginService.getSnapshot() });
    });

    /** 二维码图片 (不暴露数据目录, 仅直出当前会话的这一张图) */
    router.getNoAuth('/login/qrcode/image', (_req, res) => {
        const filePath = loginService.getQrImagePath();
        if (!filePath || !existsSync(filePath)) {
            return res
                .status(404)
                .json({ code: -1, message: '二维码不存在' });
        }
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(filePath);
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

    // ==================== 监听状态页（无鉴权）====================

    /** 直播监听视图 */
    router.getNoAuth('/monitors/live', (_req, res) => {
        try {
            res.json({ code: 0, data: getLiveMonitors() });
        } catch (err) {
            ctx.logger.error('读取直播监听失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 动态监听视图 */
    router.getNoAuth('/monitors/dyn', (_req, res) => {
        try {
            res.json({ code: 0, data: getDynMonitors() });
        } catch (err) {
            ctx.logger.error('读取动态监听失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 会话上限视图 */
    router.getNoAuth('/monitors/limits', (_req, res) => {
        try {
            res.json({ code: 0, data: getLimitsView() });
        } catch (err) {
            ctx.logger.error('读取会话上限失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 健康快照 (probe=1 时探测渲染服务) */
    router.getNoAuth('/monitors/health', async (req, res) => {
        try {
            const query = req.query as
                | Record<string, unknown>
                | undefined;
            const probe = query?.probe === '1';
            res.json({
                code: 0,
                data: await getMonitorHealth(probe),
            });
        } catch (err) {
            ctx.logger.error('读取监听健康快照失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 新增直播监听 (静默, 不推送) */
    router.postNoAuth('/monitors/live', async (req, res) => {
        try {
            const body = req.body as
                | Partial<AddMonitorRequest>
                | undefined;
            if (!body || !Array.isArray(body.targets)) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }
            const data = await addLiveMonitors({
                uid: String(body.uid ?? ''),
                targets: body.targets,
            });
            res.json({ code: 0, data });
        } catch (err) {
            ctx.logger.error('新增直播监听失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 移除直播目标 */
    router.deleteNoAuth(
        '/monitors/live/:uid/targets/:type/:id',
        (req, res) => {
            try {
                const uid = req.params?.uid;
                const target = parseMonitorTarget(req.params);
                if (!isMonitorUid(uid) || !target) {
                    return res
                        .status(400)
                        .json({ code: -1, message: '参数错误' });
                }
                res.json({
                    code: 0,
                    data: removeLiveMonitor(uid, target),
                });
            } catch (err) {
                ctx.logger.error('移除直播监听失败:', err);
                res.status(500).json({
                    code: -1,
                    message: String(err),
                });
            }
        },
    );

    /** 切换直播目标的同接监听 */
    router.postNoAuth('/monitors/live/:uid/online', (req, res) => {
        try {
            const uid = req.params?.uid;
            if (!isMonitorUid(uid)) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }
            const body = req.body as
                | Record<string, unknown>
                | undefined;
            if (!body) {
                return res
                    .status(400)
                    .json({ code: -1, message: '请求体为空' });
            }
            res.json({
                code: 0,
                data: setOnlineMonitor(uid, {
                    type: body.type as 'private' | 'group',
                    id: String(body.id ?? ''),
                    enabled: body.enabled as boolean,
                }),
            });
        } catch (err) {
            ctx.logger.error('切换同接监听失败:', err);
            res.status(500).json({
                code: -1,
                message: String(err),
            });
        }
    });

    /** 新增动态监听 (静默, 只建立缓存基线) */
    router.postNoAuth('/monitors/dyn', async (req, res) => {
        try {
            const body = req.body as
                | Partial<AddMonitorRequest>
                | undefined;
            if (!body || !Array.isArray(body.targets)) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }
            const data = await addDynMonitors({
                uid: String(body.uid ?? ''),
                targets: body.targets,
            });
            res.json({ code: 0, data });
        } catch (err) {
            ctx.logger.error('新增动态监听失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 移除动态目标 */
    router.deleteNoAuth(
        '/monitors/dyn/:uid/targets/:type/:id',
        (req, res) => {
            try {
                const uid = req.params?.uid;
                const target = parseMonitorTarget(req.params);
                if (!isMonitorUid(uid) || !target) {
                    return res
                        .status(400)
                        .json({ code: -1, message: '参数错误' });
                }
                res.json({
                    code: 0,
                    data: removeDynMonitor(uid, target),
                });
            } catch (err) {
                ctx.logger.error('移除动态监听失败:', err);
                res.status(500).json({
                    code: -1,
                    message: String(err),
                });
            }
        },
    );

    /** 设置会话上限 */
    router.postNoAuth('/monitors/limits', (req, res) => {
        try {
            const body = req.body as
                | Record<string, unknown>
                | undefined;
            if (!body) {
                return res
                    .status(400)
                    .json({ code: -1, message: '请求体为空' });
            }
            const type = body.type;
            const id = String(body.id ?? '');
            if ((type !== 'group' && type !== 'private') || !id) {
                return res
                    .status(400)
                    .json({ code: -1, message: '参数错误' });
            }
            const kind = parseLimitKind(body.kind);
            if (!kind) {
                return res
                    .status(400)
                    .json({ code: -1, message: '非法的上限类别' });
            }
            res.json({
                code: 0,
                data: setMonitorLimit({
                    type,
                    id,
                    kind,
                    max: body.max as number,
                }),
            });
        } catch (err) {
            ctx.logger.error('设置会话上限失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 恢复会话某类默认上限 */
    router.deleteNoAuth(
        '/monitors/limits/:type/:id/:kind',
        (req, res) => {
            try {
                const type = req.params?.type;
                const id = req.params?.id;
                const kind = parseLimitKind(req.params?.kind);
                if (
                    (type !== 'group' && type !== 'private') ||
                    !id ||
                    !kind
                ) {
                    return res
                        .status(400)
                        .json({ code: -1, message: '参数错误' });
                }
                res.json({
                    code: 0,
                    data: removeMonitorLimit(type, id, kind),
                });
            } catch (err) {
                ctx.logger.error('恢复会话默认上限失败:', err);
                res.status(500).json({
                    code: -1,
                    message: String(err),
                });
            }
        },
    );

    // ==================== 帮助文档（无鉴权）====================

    /** 获取全部帮助面板 (未做权限过滤, 等同于超级管理员视图) */
    router.getNoAuth('/help', (_req, res) => {
        res.json({ code: 0, data: HELP_PANELS });
    });

    // TODO: 在这里添加你的自定义 API 路由

    ctx.logger.debug('API 路由注册完成');
}
