/**
 * 查看主播同接变化图表指令
 *
 * - `#bili live online show <主播uid>`：输出指定主播的同接图表
 * - `#bili live online show`：快捷形式, 当前会话同接监听仅 1 个时
 *   直接输出（群聊场景）; 多个时提示并列出监听列表
 *
 * 未监听提示添加指引; 监听但无采样数据提示等待采集;
 * 渲染失败回退文本摘要（指令链路必须可感知, 与推送链路的静默跳过不同）
 */
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliOnlineMonitorService } from '../../../services/live/onlineMonitor.service';
import { BiliLiveRoomStore } from '../../../store/biliLiveRoom.store';
import { toInfoFromEvent } from '../utils';
import { sendReplyByToInfo } from '../../utils';
import {
    buildOnlineChartImageMessage,
    buildOnlineChartSummaryText,
    type OnlineChartData,
} from '../../../services/live/onlineChart.service';

export const showOnlineHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const toInfo = toInfoFromEvent(event);
    const [uidArg] = commands;

    // 解析目标主播：带 uid 直接用; 无参时要求当前会话仅 1 个监听对象
    let uid = uidArg;
    if (!uid) {
        const monitors = biliOnlineMonitorService.list(toInfo);
        if (monitors.length === 0) {
            await sendReplyByToInfo(
                ctx,
                toInfo,
                '当前未监听任何同接数据, 请先使用 #bili live online add <主播uid> 添加',
            );
            return;
        }
        if (monitors.length > 1) {
            await sendReplyByToInfo(
                ctx,
                toInfo,
                `当前会话监听了 ${monitors.length} 个主播的同接数据, 请指定:\n` +
                    monitors
                        .map(
                            (m, i) =>
                                `${i + 1}. ${m.uname || '主播'} (uid: ${m.uid})`,
                        )
                        .join('\n'),
            );
            return;
        }
        uid = monitors[0].uid;
    } else if (!biliOnlineMonitorService.list(toInfo).some((m) => m.uid === uid)) {
        await sendReplyByToInfo(
            ctx,
            toInfo,
            `主播 ${uid} 未开启同接监听, 请先使用 #bili live online add <主播uid> 添加`,
        );
        return;
    }

    // 收集图表数据：直播中为 [live_time, 最新采样], 其余场景数据不足时提示
    const roomStore = BiliLiveRoomStore.getInstance();
    const room = roomStore.get(uid);
    if (!room || (room.onlineSnapshots ?? []).length < 2) {
        const uname =
            biliOnlineMonitorService
                .list(toInfo)
                .find((m) => m.uid === uid)?.uname || uid;
        await sendReplyByToInfo(
            ctx,
            toInfo,
            `主播「${uname}」暂无同接采样数据` +
                (room?.live_status === 'streaming'
                    ? ', 开播采样需要一点时间, 请稍后再试'
                    : ', 同接数据仅在直播期间采集'),
        );
        return;
    }

    const data: OnlineChartData = {
        uname: room.uname,
        liveTimeSec: room.live_time,
        endTimeSec: Math.floor(Date.now() / 1000),
        title: room.title,
        parentAreaName: room.parent_area_name,
        areaName: room.area_name,
        liveContents: room.liveContents ?? [],
        onlineSnapshots: room.onlineSnapshots ?? [],
    };

    // 渲染图表, 失败回退文本摘要
    const message = await buildOnlineChartImageMessage(data);
    if (message) {
        await sendReplyByToInfo(ctx, toInfo, message);
        return;
    }
    await sendReplyByToInfo(
        ctx,
        toInfo,
        `图表渲染失败, ${buildOnlineChartSummaryText(data)}`,
    );
};
