import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliOnlineMonitorService } from '../../../services/live/onlineMonitor.service';
import { toInfoFromEvent } from '../utils';
import { sendReplyByToInfo } from '../../utils';
import { BiliLiveRoomStore } from '../../../store/biliLiveRoom.store';

/**
 * 查看当前会话正在监听同接数的主播列表
 */
export const listOnlineHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
) => {
    const toInfo = toInfoFromEvent(event);

    const monitors = biliOnlineMonitorService.list(toInfo);
    if (monitors.length === 0) {
        await sendReplyByToInfo(
            ctx,
            toInfo,
            '当前未监听任何同接数据',
        );
        return;
    }

    const roomStore = BiliLiveRoomStore.getInstance();
    const lines = monitors.map((monitor, index) => {
        const name = monitor.uname
            ? `${monitor.uname} (uid: ${monitor.uid})`
            : `uid: ${monitor.uid}`;
        const liveSuffix =
            roomStore.get(monitor.uid)?.live_status === 'streaming'
                ? ' (直播中)'
                : '';
        return `${index + 1}. ${name}${liveSuffix}`;
    });
    await sendReplyByToInfo(
        ctx,
        toInfo,
        `当前正在监听同接数的主播列表:\n${lines.join('\n')}`,
    );
};
