import type {
    DynUidHealthView,
    PollHealth,
    PollHealthView,
    RenderHealthView,
} from 'shared';
import { svgRenderService } from '../svgRenderService';

const RENDER_PROBE_CACHE_MS = 60_000;
const RENDER_PROBE_TIMEOUT_MS = 3_000;

const PROBE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#FB7299"/></svg>';

type PollKind = 'live' | 'dyn';

interface MutablePollHealth extends PollHealth {
    idle: boolean;
    skippedNotLoggedIn: boolean;
}

function emptyPoll(): MutablePollHealth {
    return {
        running: false,
        lastRunAt: null,
        lastSuccessAt: null,
        nextRunAt: null,
        lastError: null,
        idle: false,
        skippedNotLoggedIn: false,
    };
}

function emptyDynUidHealth(): DynUidHealthView {
    return {
        lastCheckAt: null,
        lastSuccessAt: null,
        lastError: null,
    };
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export class HealthSnapshot {
    private polls: Record<PollKind, MutablePollHealth> = {
        live: emptyPoll(),
        dyn: emptyPoll(),
    };

    private dynUids = new Map<string, DynUidHealthView>();

    private render: RenderHealthView = {
        probedAt: null,
        available: null,
        message: null,
    };

    private renderInFlight: Promise<RenderHealthView> | null = null;

    beginPoll(kind: PollKind): void {
        const poll = this.polls[kind];
        poll.running = true;
        poll.lastRunAt = Date.now();
        poll.idle = false;
        poll.skippedNotLoggedIn = false;
    }

    markIdle(kind: PollKind): void {
        this.polls[kind].idle = true;
    }

    markSkipped(kind: PollKind): void {
        this.polls[kind].skippedNotLoggedIn = true;
    }

    completePoll(kind: PollKind, error: string | null = null): void {
        const poll = this.polls[kind];
        poll.running = false;
        poll.lastSuccessAt = Date.now();
        poll.lastError = error;
    }

    failPoll(kind: PollKind, error: unknown): void {
        const poll = this.polls[kind];
        poll.running = false;
        poll.lastError = toErrorMessage(error);
    }

    setNextPoll(kind: PollKind, at: number): void {
        this.polls[kind].nextRunAt = at;
    }

    stopPoll(kind: PollKind): void {
        const poll = this.polls[kind];
        poll.running = false;
        poll.nextRunAt = null;
    }

    getPollHealth(kind: PollKind): PollHealthView {
        return { ...this.polls[kind] };
    }

    beginDynUidCheck(uid: string): void {
        const health = this.ensureDynUid(uid);
        health.lastCheckAt = Date.now();
    }

    successDynUid(uid: string): void {
        const health = this.ensureDynUid(uid);
        health.lastSuccessAt = Date.now();
        health.lastError = null;
    }

    failDynUid(uid: string, error: unknown): void {
        const health = this.ensureDynUid(uid);
        health.lastError = toErrorMessage(error);
    }

    getDynUidHealth(uid: string): DynUidHealthView {
        return this.dynUids.get(uid) ?? emptyDynUidHealth();
    }

    getRenderHealth(): RenderHealthView {
        return { ...this.render };
    }

    async probeRender(force = false): Promise<RenderHealthView> {
        const now = Date.now();
        if (
            !force &&
            this.render.probedAt !== null &&
            now - this.render.probedAt < RENDER_PROBE_CACHE_MS
        ) {
            return this.getRenderHealth();
        }
        if (this.renderInFlight) return this.renderInFlight;

        const task = (async () => {
            try {
                const result = await withTimeout(
                    svgRenderService.renderSvg(PROBE_SVG, false),
                    RENDER_PROBE_TIMEOUT_MS,
                );
                this.render = {
                    probedAt: Date.now(),
                    available: result.success,
                    message: result.success
                        ? null
                        : (result.message ?? '渲染失败'),
                };
            } catch (error) {
                this.render = {
                    probedAt: Date.now(),
                    available: false,
                    message: toErrorMessage(error),
                };
            } finally {
                this.renderInFlight = null;
            }
            return this.getRenderHealth();
        })();

        this.renderInFlight = task;
        return task;
    }

    reset(): void {
        this.polls = { live: emptyPoll(), dyn: emptyPoll() };
        this.dynUids.clear();
        this.render = {
            probedAt: null,
            available: null,
            message: null,
        };
        this.renderInFlight = null;
    }

    private ensureDynUid(uid: string): DynUidHealthView {
        let health = this.dynUids.get(uid);
        if (!health) {
            health = emptyDynUidHealth();
            this.dynUids.set(uid, health);
        }
        return health;
    }
}

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T | { success: false; message: string }> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ success: false, message: '渲染探测超时' });
        }, timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                resolve({
                    success: false,
                    message: toErrorMessage(error),
                });
            },
        );
    });
}

export const healthSnapshot = new HealthSnapshot();
