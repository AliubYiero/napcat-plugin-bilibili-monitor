import { OB11Message } from 'napcat-types/napcat-onebot';
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { addLiveHandler } from './live/add-live.handler';
import { removeLiveHandler } from './live/remove-live.handler';
import { listLiveHandler } from './live/list-live.handler';
import { helpLiveHandler } from './live/help-live.handler';
import { mentionLiveHandler } from './live/mention-live.handler';
import { unmentionLiveHandler } from './live/unmention-live.handler';
import { maxLiveHandler } from './live/max-live.handler';

/**
 *
 */
const instructionSetMapper: Record<
    string,
    Record<
        string,
        (
            ctx: NapCatPluginContext,
            event: OB11Message,
            commands: string[],
        ) => void
    >
> = {
    live: {
        /**
         * 添加直播间监听
         */
        add: addLiveHandler,
        /**
         * 移除直播间监听
         */
        remove: removeLiveHandler,
        /**
         * 查看当前监听的主播列表
         */
        list: listLiveHandler,
        /**
         * 查看指令帮助
         */
        help: helpLiveHandler,
        /**
         * 订阅开播 @ 提醒
         */
        mention: mentionLiveHandler,
        /**
         * 取消订阅开播 @ 提醒
         */
        unmention: unmentionLiveHandler,
        /**
         * 查看/设置监听上限 (仅超级管理员, 其余用户静默忽略)
         */
        max: maxLiveHandler,
    },
};

/**
 * 指令统一处理逻辑
 */
export const instructionHandler = (
    ctx: NapCatPluginContext,
    event: OB11Message,
    args: string[],
) => {
    const [arg1, arg2, ...commands] = args.map((str) =>
        str.toLocaleLowerCase(),
    );
    if (!arg1 || !arg2) {
        return;
    }

    const subCommandInstruction = instructionSetMapper[arg1];
    if (!subCommandInstruction) {
        return;
    }

    const callback = subCommandInstruction[arg2];
    if (callback) {
        callback(ctx, event, commands);
    }
};
