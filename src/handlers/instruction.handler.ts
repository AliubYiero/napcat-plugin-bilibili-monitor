import { OB11Message } from 'napcat-types/napcat-onebot';
import { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { addLiveHandler } from './live/add-live.handler';
import { removeLiveHandler } from './live/remove-live.handler';

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
