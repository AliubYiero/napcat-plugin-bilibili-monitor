import { useMemo, useState } from 'react';
import type {
    LiveMonitorView,
    LiveTargetView,
    MonitorTargetInput,
} from 'shared';
import {
    IconActivity,
    IconChevronDown,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconTrash,
} from '../../components/Icons';
import type { SessionInfo } from '../../types';
import {
    buildOnlinePolyline,
    filterLiveRows,
    formatDateTime,
    formatLiveDuration,
    liveStatusLabel,
    sessionKey,
    sessionName,
} from '../../utils/monitorView';
import ConfirmDialog from './ConfirmDialog';

interface LiveTabProps {
    live: LiveMonitorView[];
    sessions: SessionInfo[];
    loading: boolean;
    onAdd: () => void;
    onRefresh: () => void;
    onRemove: (
        uid: string,
        target: MonitorTargetInput,
    ) => Promise<void>;
    onToggleOnline: (
        uid: string,
        target: MonitorTargetInput,
        enabled: boolean,
    ) => Promise<void>;
}

export default function LiveTab({
    live,
    sessions,
    loading,
    onAdd,
    onRefresh,
    onRemove,
    onToggleOnline,
}: LiveTabProps) {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<
        'all' | 'streaming' | 'offline'
    >('all');
    const [session, setSession] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [pendingRemove, setPendingRemove] = useState<{
        uid: string;
        target: MonitorTargetInput;
        label: string;
    } | null>(null);

    const sessionOptions = useMemo(() => {
        const map = new Map<
            string,
            { type: 'group' | 'private'; id: string }
        >();
        for (const row of live) {
            for (const target of row.targets) {
                map.set(sessionKey(target.type, target.id), {
                    type: target.type,
                    id: target.id,
                });
            }
        }
        return [...map.values()].sort((a, b) =>
            sessionName(sessions, a.type, a.id).localeCompare(
                sessionName(sessions, b.type, b.id),
                'zh-CN',
            ),
        );
    }, [live, sessions]);

    const rows = useMemo(
        () => filterLiveRows(live, { search, status, session }),
        [live, search, status, session],
    );

    const toggleExpanded = (uid: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
    };

    const handleToggle = async (
        uid: string,
        target: LiveTargetView,
    ) => {
        const key = `${uid}:${target.type}:${target.id}`;
        setBusyKey(key);
        try {
            await onToggleOnline(uid, target, !target.onlineEnabled);
        } finally {
            setBusyKey(null);
        }
    };

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setBusyKey(
            `${pendingRemove.uid}:${pendingRemove.target.type}:${pendingRemove.target.id}`,
        );
        try {
            await onRemove(pendingRemove.uid, pendingRemove.target);
            setPendingRemove(null);
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative w-full sm:w-64">
                        <IconSearch
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            className="input-field pl-9"
                            placeholder="搜索主播名称、UID 或标题"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                        />
                    </div>
                    <select
                        className="input-field w-full sm:w-32"
                        value={status}
                        onChange={(event) =>
                            setStatus(
                                event.target.value as
                                    | 'all'
                                    | 'streaming'
                                    | 'offline',
                            )
                        }
                    >
                        <option value="all">全部状态</option>
                        <option value="streaming">直播中</option>
                        <option value="offline">未开播</option>
                    </select>
                    <select
                        className="input-field w-full sm:w-44"
                        value={session}
                        onChange={(event) =>
                            setSession(event.target.value)
                        }
                    >
                        <option value="">全部会话</option>
                        {sessionOptions.map((item) => (
                            <option
                                key={sessionKey(item.type, item.id)}
                                value={sessionKey(item.type, item.id)}
                            >
                                {sessionName(
                                    sessions,
                                    item.type,
                                    item.id,
                                )}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={onRefresh}
                    >
                        <IconRefresh size={13} />
                        刷新
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary text-xs"
                        onClick={onAdd}
                    >
                        <IconPlus size={13} />
                        新增直播监听
                    </button>
                </div>
            </div>

            <p className="text-xs text-gray-400">
                共 {live.length} 个主播，
                {
                    live.filter((row) => row.status === 'streaming')
                        .length
                }{' '}
                个直播中
                {rows.length !== live.length &&
                    `，筛选后 ${rows.length} 个`}
            </p>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
                                <th className="sticky left-0 z-10 w-8 bg-gray-50 px-2 py-2.5 dark:bg-[#1e1e20]" />
                                <th className="sticky left-8 z-10 bg-gray-50 px-3 py-2.5 font-medium dark:bg-[#1e1e20]">
                                    主播
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    状态
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    标题 / 分区
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    本场时长
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    同接
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    目标
                                </th>
                                <th className="w-14 px-3 py-2.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {rows.map((row) => {
                                const isExpanded = expanded.has(
                                    row.uid,
                                );
                                return (
                                    <FragmentRow
                                        key={row.uid}
                                        row={row}
                                        sessions={sessions}
                                        expanded={isExpanded}
                                        busyKey={busyKey}
                                        onToggleExpanded={() =>
                                            toggleExpanded(row.uid)
                                        }
                                        onToggleOnline={handleToggle}
                                        onRemove={(target) =>
                                            setPendingRemove({
                                                uid: row.uid,
                                                target,
                                                label: sessionName(
                                                    sessions,
                                                    target.type,
                                                    target.id,
                                                ),
                                            })
                                        }
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {rows.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <IconActivity
                            size={32}
                            className="mx-auto text-gray-300 dark:text-gray-600"
                        />
                        <p className="mt-3 text-sm text-gray-400">
                            {loading
                                ? '加载直播监听中...'
                                : live.length === 0
                                  ? '暂无直播监听'
                                  : '没有符合筛选条件的主播'}
                        </p>
                        {!loading && live.length === 0 && (
                            <button
                                type="button"
                                className="btn btn-primary mt-4 text-xs"
                                onClick={onAdd}
                            >
                                <IconPlus size={13} />
                                新增第一个监听
                            </button>
                        )}
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={pendingRemove !== null}
                title="移除直播监听"
                message={
                    pendingRemove
                        ? `确定将「${pendingRemove.label}」从主播 ${pendingRemove.uid} 的直播监听中移除吗？\n同接监听会一并关闭，且不会补推。`
                        : ''
                }
                confirmLabel="移除"
                busy={busyKey !== null}
                onCancel={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
            />
        </div>
    );
}

function FragmentRow({
    row,
    sessions,
    expanded,
    busyKey,
    onToggleExpanded,
    onToggleOnline,
    onRemove,
}: {
    row: LiveMonitorView;
    sessions: SessionInfo[];
    expanded: boolean;
    busyKey: string | null;
    onToggleExpanded: () => void;
    onToggleOnline: (uid: string, target: LiveTargetView) => void;
    onRemove: (target: LiveTargetView) => void;
}) {
    return (
        <>
            <tr className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                <td className="sticky left-0 z-10 bg-white px-2 py-2.5 dark:bg-[#1e1e20]">
                    <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        onClick={onToggleExpanded}
                        aria-label={
                            expanded ? '收起明细' : '展开明细'
                        }
                    >
                        <IconChevronDown
                            size={14}
                            className={`transition-transform ${
                                expanded ? 'rotate-180' : ''
                            }`}
                        />
                    </button>
                </td>
                <td className="sticky left-8 z-10 bg-white px-3 py-2.5 dark:bg-[#1e1e20]">
                    <div className="flex items-center gap-2.5">
                        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs text-gray-400 dark:bg-white/[0.06]">
                            {row.uname.slice(0, 1)}
                            {row.avatar && (
                                <img
                                    src={row.avatar}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-cover"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => {
                                        event.currentTarget.style.display =
                                            'none';
                                    }}
                                />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate font-medium text-gray-800 dark:text-gray-200">
                                {row.uname}
                            </div>
                            <div className="font-mono text-[11px] text-gray-400">
                                UID {row.uid}
                            </div>
                        </div>
                    </div>
                </td>
                <td className="px-3 py-2.5">
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            row.status === 'streaming'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400'
                        }`}
                    >
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${
                                row.status === 'streaming'
                                    ? 'bg-primary'
                                    : 'bg-gray-400'
                            }`}
                        />
                        {liveStatusLabel(row.status)}
                    </span>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                    <div
                        className="truncate text-gray-700 dark:text-gray-300"
                        title={row.title}
                    >
                        {row.title || '—'}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-400">
                        {[row.parentAreaName, row.areaName]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                    </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                    {formatLiveDuration(row.durationSec)}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                    <div>
                        当前{' '}
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                            {row.onlineCurrent ?? '—'}
                        </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                        峰值 {row.onlinePeak ?? '—'}
                    </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                    {row.targets.length}
                </td>
                <td className="px-3 py-2.5 text-right">
                    <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={onToggleExpanded}
                    >
                        {expanded ? '收起' : '明细'}
                    </button>
                </td>
            </tr>

            {expanded && (
                <tr className="bg-gray-50/40 dark:bg-white/[0.015]">
                    <td colSpan={8} className="px-4 py-4">
                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 text-[11px] font-medium text-gray-400">
                                    推送目标
                                </div>
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {row.targets.map((target) => {
                                        const key = `${row.uid}:${target.type}:${target.id}`;
                                        return (
                                            <div
                                                key={`${target.type}:${target.id}`}
                                                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-[#1e1e20]"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate text-xs text-gray-700 dark:text-gray-300">
                                                        {sessionName(
                                                            sessions,
                                                            target.type,
                                                            target.id,
                                                        )}
                                                    </div>
                                                    <div className="mt-0.5 font-mono text-[10px] text-gray-400">
                                                        {target.type ===
                                                        'group'
                                                            ? '群'
                                                            : 'QQ'}{' '}
                                                        {target.id}
                                                        {target.mentionCount >
                                                            0 && (
                                                            <span className="ml-2 text-primary">
                                                                @
                                                                {
                                                                    target.mentionCount
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-shrink-0 items-center gap-2">
                                                    <label
                                                        className="flex items-center gap-1.5 text-[10px] text-gray-400"
                                                        title="同接监听（依附于直播监听）"
                                                    >
                                                        同接
                                                        <span className="toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    target.onlineEnabled
                                                                }
                                                                disabled={
                                                                    busyKey ===
                                                                    key
                                                                }
                                                                onChange={() =>
                                                                    onToggleOnline(
                                                                        row.uid,
                                                                        target,
                                                                    )
                                                                }
                                                            />
                                                            <span className="slider" />
                                                        </span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        className="text-gray-400 hover:text-red-500"
                                                        onClick={() =>
                                                            onRemove(
                                                                target,
                                                            )
                                                        }
                                                        aria-label="移除目标"
                                                    >
                                                        <IconTrash
                                                            size={14}
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                    <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
                                        <span>同接曲线</span>
                                        <span>
                                            {row.onlineSnapshots
                                                .length > 0
                                                ? `${row.onlineSnapshots.length} 个采样点`
                                                : '暂无采样'}
                                        </span>
                                    </div>
                                    <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-[#1e1e20]">
                                        {row.onlineSnapshots.length >=
                                        2 ? (
                                            <svg
                                                viewBox="0 0 260 52"
                                                className="h-14 w-full"
                                                preserveAspectRatio="none"
                                                role="img"
                                            >
                                                <title>
                                                    同接人数变化曲线
                                                </title>
                                                <polyline
                                                    points={buildOnlinePolyline(
                                                        row.onlineSnapshots,
                                                        260,
                                                        52,
                                                    )}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinejoin="round"
                                                    strokeLinecap="round"
                                                    className="text-primary"
                                                />
                                            </svg>
                                        ) : (
                                            <div className="flex h-14 items-center justify-center text-[11px] text-gray-400">
                                                采集满两个点后显示曲线
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-[11px] text-gray-400">
                                        内容分段
                                    </div>
                                    <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-[#1e1e20]">
                                        {row.liveContents.length ===
                                        0 ? (
                                            <div className="text-[11px] text-gray-400">
                                                暂无历史分段
                                            </div>
                                        ) : (
                                            row.liveContents.map(
                                                (content) => (
                                                    <div
                                                        key={`${content.startTime}-${content.endTime}-${content.title}`}
                                                        className="text-[11px]"
                                                    >
                                                        <div className="truncate text-gray-600 dark:text-gray-300">
                                                            {
                                                                content.title
                                                            }
                                                        </div>
                                                        <div className="mt-0.5 text-gray-400">
                                                            {[
                                                                content.parentAreaName,
                                                                content.areaName,
                                                            ]
                                                                .filter(
                                                                    Boolean,
                                                                )
                                                                .join(
                                                                    ' · ',
                                                                )}{' '}
                                                            ·{' '}
                                                            {formatDateTime(
                                                                content.startTime *
                                                                    1000,
                                                            )}{' '}
                                                            →{' '}
                                                            {formatDateTime(
                                                                content.endTime *
                                                                    1000,
                                                            )}
                                                        </div>
                                                    </div>
                                                ),
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
