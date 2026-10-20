import type { MonitorHealthView } from 'shared';
import {
    IconActivity,
    IconAlert,
    IconClock,
    IconInfo,
    IconRefresh,
} from '../../components/Icons';
import {
    describeLogin,
    describePoll,
    describeRender,
    formatUptime,
    type HealthBadgeView,
    type HealthTone,
} from '../../utils/monitorView';

interface HealthBarProps {
    health: MonitorHealthView | null;
    refreshing: boolean;
    onRefresh: () => void;
}

const TONE_STYLES: Record<
    HealthTone,
    { dot: string; badge: string }
> = {
    ok: {
        dot: 'bg-emerald-500',
        badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    warn: {
        dot: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    },
    error: {
        dot: 'bg-red-500',
        badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
    },
    idle: {
        dot: 'bg-gray-300 dark:bg-gray-600',
        badge: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400',
    },
    info: {
        dot: 'bg-sky-500',
        badge: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    },
};

function HealthCard({
    title,
    view,
}: {
    title: string;
    view: HealthBadgeView;
}) {
    const style = TONE_STYLES[view.tone];
    return (
        <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e20] px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-gray-400">
                    {title}
                </span>
                <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
                    />
                    {view.label}
                </span>
            </div>
            <p
                className="mt-2 truncate text-xs text-gray-500 dark:text-gray-400"
                title={view.detail}
            >
                {view.detail}
            </p>
        </div>
    );
}

export default function HealthBar({
    health,
    refreshing,
    onRefresh,
}: HealthBarProps) {
    if (!health) {
        return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                    <div
                        key={item}
                        className="h-[74px] animate-pulse rounded-lg border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
                    />
                ))}
            </div>
        );
    }

    const statuses: Array<{
        title: string;
        view: HealthBadgeView;
    }> = [
        {
            title: '直播轮询',
            view: describePoll('live', health.live),
        },
        {
            title: '动态轮询',
            view: describePoll('dyn', health.dyn),
        },
        {
            title: 'B 站登录',
            view: describeLogin(
                health.login.loggedIn,
                health.login.cookieExpired,
                health.login.user?.name,
            ),
        },
        {
            title: '渲染服务',
            view: describeRender(health.render),
        },
    ];

    const hasError = statuses.some(
        (item) => item.view.tone === 'error',
    );
    const hasWarn = statuses.some(
        (item) => item.view.tone === 'warn',
    );

    return (
        <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    {hasError ? (
                        <IconAlert
                            size={14}
                            className="text-red-500"
                        />
                    ) : hasWarn ? (
                        <IconInfo
                            size={14}
                            className="text-amber-500"
                        />
                    ) : (
                        <IconActivity
                            size={14}
                            className="text-emerald-500"
                        />
                    )}
                    <span>
                        运行 {formatUptime(health.process.uptime)}
                    </span>
                    <span className="text-gray-300 dark:text-gray-700">
                        |
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <IconClock size={12} />
                        本次进程内快照
                    </span>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={onRefresh}
                    disabled={refreshing}
                >
                    <IconRefresh
                        size={13}
                        className={refreshing ? 'animate-spin' : ''}
                    />
                    {refreshing ? '探测中...' : '刷新健康'}
                </button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {statuses.map((item) => (
                    <HealthCard
                        key={item.title}
                        title={item.title}
                        view={item.view}
                    />
                ))}
            </div>
        </section>
    );
}
