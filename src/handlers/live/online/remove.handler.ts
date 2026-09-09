import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { OB11Message } from 'napcat-types/napcat-onebot';
import { biliOnlineMonitorService } from '../../../services/live/onlineMonitor.service';
import { toInfoFromEvent } from '../utils';

/**
 * 从同接数监听列表移除主播
 */
export const removeOnlineHandler = async (
    ctx: NapCatPluginContext,
    event: OB11Message,
    commands: string[],
) => {
    const [uid] = commands;
    if (!uid) {
        ctx.logger.debug('未检测到主播UID');
        return;
    }

    await biliOnlineMonitorService.remove(
        uid,
        toInfoFromEvent(event),
    );
};
