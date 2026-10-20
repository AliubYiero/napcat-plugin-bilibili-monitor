import { useState } from 'react';
import type {
    LimitSessionView,
    MonitorLimitKind,
    MonitorTargetInput,
    MonitorTargetResult,
} from 'shared';
import { useMonitors } from '../hooks/useMonitors';
import { showToast } from '../hooks/useToast';
import AddMonitorDialog from './monitors/AddMonitorDialog';
import DynTab from './monitors/DynTab';
import HealthBar from './monitors/HealthBar';
import LimitsTab from './monitors/LimitsTab';
import LiveTab from './monitors/LiveTab';

type MonitorTab = 'live' | 'dyn' | 'limits';

export default function MonitorsPage() {
    const state = useMonitors();
    const [tab, setTab] = useState<MonitorTab>('live');
    const [addKind, setAddKind] = useState<'live' | 'dyn' | null>(
        null,
    );
    const [refreshingHealth, setRefreshingHealth] = useState(false);

    const refreshHealth = async () => {
        setRefreshingHealth(true);
        try {
            await state.refreshHealth(true);
            showToast('健康状态已刷新', 'success');
        } finally {
            setRefreshingHealth(false);
        }
    };

    const handleSubmitted = (results: MonitorTargetResult[]) => {
        const ok = results.filter((item) => item.ok).length;
        const failed = results.filter((item) => !item.ok);
        if (ok > 0) {
            showToast(`已成功添加 ${ok} 个推送目标`, 'success');
        }
        if (failed.length > 0) {
            showToast(
                `${failed.length} 个目标添加失败：${failed
                    .map((item) => item.message)
                    .join('；')}`,
                'warning',
            );
        }
    };

    const removeLive = async (
        uid: string,
        target: MonitorTargetInput,
    ) => {
        try {
            const result = await state.removeLive(uid, target);
            showToast(
                result.message,
                result.ok ? 'success' : 'error',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : '移除失败',
                'error',
            );
        }
    };

    const removeDyn = async (
        uid: string,
        target: MonitorTargetInput,
    ) => {
        try {
            const result = await state.removeDyn(uid, target);
            showToast(
                result.message,
                result.ok ? 'success' : 'error',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : '移除失败',
                'error',
            );
        }
    };

    const toggleOnline = async (
        uid: string,
        target: MonitorTargetInput,
        enabled: boolean,
    ) => {
        try {
            const result = await state.toggleOnline(
                uid,
                target,
                enabled,
            );
            showToast(
                result.message,
                result.ok ? 'success' : 'error',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : '操作失败',
                'error',
            );
        }
    };

    const setLimit = async (
        session: LimitSessionView,
        kind: MonitorLimitKind,
        max: number,
    ) => {
        try {
            const result = await state.setLimit(
                session.type,
                session.id,
                kind,
                max,
            );
            showToast(
                result.message,
                result.ok ? 'success' : 'error',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : '设置失败',
                'error',
            );
        }
    };

    const resetLimit = async (
        session: LimitSessionView,
        kind: MonitorLimitKind,
    ) => {
        try {
            const result = await state.resetLimit(
                session.type,
                session.id,
                kind,
            );
            showToast(
                result.message,
                result.ok ? 'success' : 'error',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : '恢复失败',
                'error',
            );
        }
    };

    const tabs: Array<{
        id: MonitorTab;
        label: string;
        count: number;
    }> = [
        { id: 'live', label: '直播监听', count: state.live.length },
        { id: 'dyn', label: '动态监听', count: state.dyn.length },
        {
            id: 'limits',
            label: '会话上限',
            count: state.limits?.sessions.length ?? 0,
        },
    ];

    return (
        <>
            <div
                className="space-y-4 transition-[filter] duration-200"
                style={{
                    filter:
                        addKind !== null
                            ? 'saturate(0.75) contrast(0.95)'
                            : undefined,
                }}
            >
                <HealthBar
                    health={state.health}
                    refreshing={refreshingHealth}
                    onRefresh={refreshHealth}
                />

                {state.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                        {state.error}
                    </div>
                )}

                <div className="flex items-center gap-1 border-b border-gray-100 dark:border-gray-800 animate-fade-in-down">
                    {tabs.map((item) => (
                        <button
                            type="button"
                            key={item.id}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === item.id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            onClick={() => setTab(item.id)}
                        >
                            {item.label} ({item.count})
                        </button>
                    ))}
                </div>

                {tab === 'live' && (
                    <LiveTab
                        live={state.live}
                        sessions={state.sessions}
                        loading={state.loading}
                        onAdd={() => setAddKind('live')}
                        onRefresh={() => void state.refresh()}
                        onRemove={removeLive}
                        onToggleOnline={toggleOnline}
                    />
                )}

                {tab === 'dyn' && (
                    <DynTab
                        dyn={state.dyn}
                        sessions={state.sessions}
                        loggedIn={
                            !!state.health?.login.loggedIn &&
                            !state.health.login.cookieExpired
                        }
                        loading={state.loading}
                        onAdd={() => setAddKind('dyn')}
                        onRefresh={() => void state.refresh()}
                        onRemove={removeDyn}
                    />
                )}

                {tab === 'limits' && (
                    <LimitsTab
                        limits={state.limits}
                        sessions={state.sessions}
                        loading={state.loading}
                        onRefresh={() => void state.refresh()}
                        onSetLimit={setLimit}
                        onResetLimit={resetLimit}
                    />
                )}
            </div>

            <AddMonitorDialog
                open={addKind !== null}
                kind={addKind ?? 'live'}
                sessions={state.sessions}
                onClose={() => setAddKind(null)}
                onSubmit={async (uid, targets) => {
                    if (addKind === 'dyn') {
                        return state.addDyn(uid, targets);
                    }
                    return state.addLive(uid, targets);
                }}
                onSubmitted={handleSubmitted}
            />
        </>
    );
}
