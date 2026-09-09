import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliOnlineMonitorService } from '../../../services/live/onlineMonitor.service';
import { toInfoFromEvent } from '../utils';

/**
 * 添加主播到同接数监听列表
 * 前置: 该主播已在直播监听列表; 受当前会话同接监听上限约束
 */
export const addOnlineHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const [uid] = commands;
    if (!uid) {
        ctx.logger.debug('未检测到主播UID');
        return;
    }

    await biliOnlineMonitorService.add(uid, toInfoFromEvent(event));
};
