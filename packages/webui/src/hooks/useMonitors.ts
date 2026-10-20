import { useCallback, useEffect, useState } from 'react';
import type {
    DynMonitorView,
    LimitsView,
    LiveMonitorView,
    MonitorHealthView,
    MonitorLimitKind,
    MonitorSessionType,
    MonitorTargetInput,
    MonitorTargetResult,
} from 'shared';
import type { SessionInfo } from '../types';
import { noAuthFetch } from '../utils/api';

const POLL_INTERVAL_MS = 10_000;

async function readData<T>(path: string): Promise<T> {
    const res = await noAuthFetch<T>(path);
    if (res.code !== 0 || res.data === undefined) {
        throw new Error(res.message ?? '读取失败');
    }
    return res.data;
}

async function writeData<T>(
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
): Promise<T> {
    const res = await noAuthFetch<T>(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.code !== 0 || res.data === undefined) {
        throw new Error(res.message ?? '操作失败');
    }
    return res.data;
}

function resultOf(
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
): Promise<MonitorTargetResult> {
    return writeData<MonitorTargetResult>(path, method, body);
}

export function useMonitors() {
    const [live, setLive] = useState<LiveMonitorView[]>([]);
    const [dyn, setDyn] = useState<DynMonitorView[]>([]);
    const [limits, setLimits] = useState<LimitsView | null>(null);
    const [health, setHealth] = useState<MonitorHealthView | null>(
        null,
    );
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = useCallback(async () => {
        try {
            setSessions(await readData<SessionInfo[]>('/sessions'));
        } catch {
            setSessions([]);
        }
    }, []);

    const fetchAll = useCallback(async () => {
        const [liveRes, dynRes, limitsRes, healthRes] =
            await Promise.allSettled([
                readData<LiveMonitorView[]>('/monitors/live'),
                readData<DynMonitorView[]>('/monitors/dyn'),
                readData<LimitsView>('/monitors/limits'),
                readData<MonitorHealthView>('/monitors/health'),
            ]);

        if (liveRes.status === 'fulfilled') setLive(liveRes.value);
        if (dynRes.status === 'fulfilled') setDyn(dynRes.value);
        if (limitsRes.status === 'fulfilled')
            setLimits(limitsRes.value);
        if (healthRes.status === 'fulfilled')
            setHealth(healthRes.value);

        const failures = [
            liveRes,
            dynRes,
            limitsRes,
            healthRes,
        ].filter((item) => item.status === 'rejected');
        setError(
            failures.length > 0
                ? '部分监听数据读取失败，请稍后重试'
                : null,
        );
        setLoading(false);
    }, []);

    const refreshHealth = useCallback(async (probe = false) => {
        try {
            const data = await readData<MonitorHealthView>(
                `/monitors/health${probe ? '?probe=1' : ''}`,
            );
            setHealth(data);
        } catch {
            setError('健康状态读取失败');
        }
    }, []);

    useEffect(() => {
        void fetchSessions();
        void fetchAll();
    }, [fetchSessions, fetchAll]);

    useEffect(() => {
        let timer = window.setInterval(() => {
            void fetchAll();
        }, POLL_INTERVAL_MS);

        const onVisibilityChange = () => {
            if (document.hidden) {
                window.clearInterval(timer);
                return;
            }
            void fetchAll();
            timer = window.setInterval(() => {
                void fetchAll();
            }, POLL_INTERVAL_MS);
        };

        document.addEventListener(
            'visibilitychange',
            onVisibilityChange,
        );
        return () => {
            window.clearInterval(timer);
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange,
            );
        };
    }, [fetchAll]);

    const addLive = useCallback(
        async (uid: string, targets: MonitorTargetInput[]) => {
            const results = await writeData<MonitorTargetResult[]>(
                '/monitors/live',
                'POST',
                { uid, targets },
            );
            await fetchAll();
            return results;
        },
        [fetchAll],
    );

    const addDyn = useCallback(
        async (uid: string, targets: MonitorTargetInput[]) => {
            const results = await writeData<MonitorTargetResult[]>(
                '/monitors/dyn',
                'POST',
                { uid, targets },
            );
            await fetchAll();
            return results;
        },
        [fetchAll],
    );

    const removeLive = useCallback(
        async (uid: string, target: MonitorTargetInput) => {
            const result = await resultOf(
                `/monitors/live/${uid}/targets/${target.type}/${target.id}`,
                'DELETE',
            );
            await fetchAll();
            return result;
        },
        [fetchAll],
    );

    const removeDyn = useCallback(
        async (uid: string, target: MonitorTargetInput) => {
            const result = await resultOf(
                `/monitors/dyn/${uid}/targets/${target.type}/${target.id}`,
                'DELETE',
            );
            await fetchAll();
            return result;
        },
        [fetchAll],
    );

    const toggleOnline = useCallback(
        async (
            uid: string,
            target: MonitorTargetInput,
            enabled: boolean,
        ) => {
            const result = await resultOf(
                `/monitors/live/${uid}/online`,
                'POST',
                { ...target, enabled },
            );
            await fetchAll();
            return result;
        },
        [fetchAll],
    );

    const setLimit = useCallback(
        async (
            type: MonitorSessionType,
            id: string,
            kind: MonitorLimitKind,
            max: number,
        ) => {
            const result = await resultOf(
                '/monitors/limits',
                'POST',
                {
                    type,
                    id,
                    kind,
                    max,
                },
            );
            await fetchAll();
            return result;
        },
        [fetchAll],
    );

    const resetLimit = useCallback(
        async (
            type: MonitorSessionType,
            id: string,
            kind: MonitorLimitKind,
        ) => {
            const result = await resultOf(
                `/monitors/limits/${type}/${id}/${kind}`,
                'DELETE',
            );
            await fetchAll();
            return result;
        },
        [fetchAll],
    );

    return {
        live,
        dyn,
        limits,
        health,
        sessions,
        loading,
        error,
        refresh: fetchAll,
        refreshHealth,
        addLive,
        addDyn,
        removeLive,
        removeDyn,
        toggleOnline,
        setLimit,
        resetLimit,
    };
}

export type MonitorsState = ReturnType<typeof useMonitors>;
