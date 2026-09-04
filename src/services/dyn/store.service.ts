/**
 * Bilibili 动态监听服务（门面）
 *
 * 处理 dyn add/remove/latest 的业务逻辑：
 * - add: 校验上限 -> 拉取动态验证主播 -> store.add -> 首拉记录缓存（不推送）
 * - remove: store.remove
 * - latest: 现场拉一页取最新非置顶一条，按推送模板输出
 */

import { pluginState } from '../../core/state';
import {
    BiliDynamicStore,
    type BiliDynamicMonitor,
    type BiliDynamicMonitorToInfo,
} from '../../store/biliDynamic.store';
import { BiliCookieStore } from '../../store/biliCookie.store';
import { api_getDynamicFeed } from '../../api/getDynamicFeed';
import { parseBiliDynamic } from './parser.service';
import { buildDynMessage } from './push.service';
import { getDynLimit, isDynLimitReached } from './limit.service';
import { sendReplyByToInfo } from '../../handlers/message.handler';
import type { OB11PostSendMsg } from 'napcat-types/napcat-onebot';

/** 动态监听服务（导出实例，内部惰性实例化 store，遵循 store-pattern） */
export class BiliDynamicStoreService {
    private _dynStore: BiliDynamicStore | null = null;

    /** 惰性获取存储实例 */
    private get dynStore(): BiliDynamicStore {
        if (!this._dynStore) {
            this._dynStore = BiliDynamicStore.getInstance();
        }
        return this._dynStore;
    }

    /** 添加动态监听 */
    async add(
        uid: string,
        toInfo: BiliDynamicMonitorToInfo,
    ): Promise<void> {
        const store = this.dynStore;
        try {
            const hasUid = store.has(uid, toInfo);
            if (
                !hasUid &&
                isDynLimitReached(toInfo, this.list(toInfo).length)
            ) {
                const limit = getDynLimit(toInfo);
                const limitText =
                    limit === Infinity ? '无上限' : String(limit);
                const message =
                    toInfo.type === 'private'
                        ? `私聊动态监听上限为 ${limitText}, 当前监听数已达上限 (${this.list(toInfo).length}/${limitText}), 请先移除现有订阅`
                        : `当前动态监听数已达上限 (${this.list(toInfo).length}/${limitText}), 请先移除现有订阅`;
                await send(toInfo, message);
                return;
            }
            if (hasUid) {
                const uname = this.getUname(uid);
                await send(
                    toInfo,
                    `主播「${uname || uid}」(${uid}) 已在动态监听列表中, 请勿重复添加`,
                );
                return;
            }

            // 拉取动态验证主播有效性并获取 uname
            const resp = await api_getDynamicFeed(uid);
            if (resp.code !== 0 || !resp.data?.items) {
                if (resp.code === -101 || resp.code === -352) {
                    void BiliCookieStore.getInstance().markExpired();
                }
                const failedMessage =
                    resp.code === -101 || resp.code === -352
                        ? 'B 站登录 Cookie 已失效, 请重新登录后重试'
                        : `未找到主播 ${uid} 的动态, 添加失败 (code=${resp.code})`;
                await send(toInfo, failedMessage);
                return;
            }

            const items = resp.data.items;
            const uname =
                items[0]?.modules.module_author?.name ?? uid;

            // 写入 store (缓存为空 -> 轮询服务按首绑处理, 只记录不推送)
            store.add(uid, uname, toInfo);
            // 立即首拉记录缓存 (不推送)
            store.addCacheIds(
                uid,
                items.map((it) => it.id_str),
            );
            await send(
                toInfo,
                `已开始监听主播「${uname}」(${uid}) 的动态`,
            );
        } catch (e) {
            const errorMessage = `主播 ${uid} 添加动态监听失败`;
            pluginState.logger.error(errorMessage, e);
            await send(toInfo, errorMessage);
        }
    }

    /** 移除动态监听 */
    async remove(
        uid: string,
        toInfo: BiliDynamicMonitorToInfo,
    ): Promise<void> {
        try {
            const uname = this.getUname(uid);
            const isRemoved = this.dynStore.remove(uid, toInfo);
            const message = isRemoved
                ? `已停止监听主播「${uname || uid}」(${uid}) 的动态`
                : `未找到主播「${uname || uid}」(${uid}) 的动态监听信息, 移除失败`;
            await send(toInfo, message);
        } catch (e) {
            pluginState.logger.error(
                `主播 ${uid} 移除动态监听失败:`,
                e,
            );
            await send(toInfo, `主播 ${uid} 移除动态监听失败`);
        }
    }

    /** 获取指定会话正在动态监听的主播列表 */
    list(toInfo: BiliDynamicMonitorToInfo): BiliDynamicMonitor[] {
        return this.dynStore
            .get()
            .filter((monitor) =>
                monitor.to.some(
                    (t) =>
                        t.type === toInfo.type && t.id === toInfo.id,
                ),
            );
    }

    /** 查看某主播最新一条非置顶动态 (现场拉一页), 输出与推送模板一致 */
    async latest(
        uid: string,
        toInfo: BiliDynamicMonitorToInfo,
    ): Promise<void> {
        try {
            const resp = await api_getDynamicFeed(uid);
            if (resp.code !== 0 || !resp.data?.items?.length) {
                if (resp.code === -101 || resp.code === -352) {
                    void BiliCookieStore.getInstance().markExpired();
                }
                const msg =
                    resp.code === -101 || resp.code === -352
                        ? 'B 站登录 Cookie 已失效, 请重新登录后重试'
                        : `未找到主播 ${uid} 的动态 (code=${resp.code})`;
                await send(toInfo, msg);
                return;
            }
            // 最新一条非置顶且非直播推荐 (LIVE_RCMD 由 live 指令负责)
            let parsed: ReturnType<typeof parseBiliDynamic> | null =
                null;
            for (const it of resp.data.items) {
                if (it.modules.module_tag?.text === '置顶') continue;
                const candidate = parseBiliDynamic(it);
                if (candidate.kind === 'live') continue;
                parsed = candidate;
                break;
            }
            if (!parsed) {
                await send(toInfo, `未找到主播 ${uid} 可展示的动态`);
                return;
            }
            const message = buildDynMessage(parsed);
            if (!message) {
                await send(toInfo, `主播 ${uid} 最新动态无法解析`);
                return;
            }
            await send(toInfo, message);
        } catch (e) {
            pluginState.logger.error(
                `查询主播 ${uid} 最新动态失败:`,
                e,
            );
            await send(toInfo, `查询主播 ${uid} 最新动态失败`);
        }
    }

    /** 根据 UID 获取已保存的主播名称 */
    getUname(uid: string): string {
        return (
            this.dynStore.get().find((m) => m.uid === uid)?.uname ??
            ''
        );
    }
}

/** 发送消息到目标 (文本或消息段数组) */
async function send(
    toInfo: BiliDynamicMonitorToInfo,
    message: string | OB11PostSendMsg['message'],
): Promise<void> {
    const msg =
        typeof message === 'string'
            ? [{ type: 'text', data: { text: message } }]
            : message;
    await sendReplyByToInfo(
        pluginState.ctx,
        toInfo,
        msg as OB11PostSendMsg['message'],
    );
}

export const biliDynamicStoreService = new BiliDynamicStoreService();
