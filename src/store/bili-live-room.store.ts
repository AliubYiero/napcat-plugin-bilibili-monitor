/**
 *
 */
export class BiliLiveRoomStore {
    private static instance: BiliLiveRoomStore | null = null;

    private constructor() {}

    static getInstance(): BiliLiveRoomStore {
        if (!BiliLiveRoomStore.instance) {
            BiliLiveRoomStore.instance = new BiliLiveRoomStore();
        }
        return BiliLiveRoomStore.instance;
    }
}
