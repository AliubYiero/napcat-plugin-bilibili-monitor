import { useEffect, useMemo, useState } from 'react';
import type {
    LimitSessionView,
    LimitsView,
    MonitorLimitKind,
} from 'shared';
import { IconRefresh, IconSearch } from '../../components/Icons';
import type { SessionInfo } from '../../types';
import {
    effectiveLimit,
    limitText,
    sessionName,
} from '../../utils/monitorView';

interface LimitsTabProps {
    limits: LimitsView | null;
    sessions: SessionInfo[];
    loading: boolean;
    onRefresh: () => void;
    onSetLimit: (
        session: LimitSessionView,
        kind: MonitorLimitKind,
        max: number,
    ) => Promise<void>;
    onResetLimit: (
        session: LimitSessionView,
        kind: MonitorLimitKind,
    ) => Promise<void>;
}

const KIND_LABELS: Record<MonitorLimitKind, string> = {
    live: '直播',
    online: '同接',
    dyn: '动态',
};

const KINDS: MonitorLimitKind[] = ['live', 'online', 'dyn'];

export default function LimitsTab({
    limits,
    sessions,
    loading,
    onRefresh,
    onSetLimit,
    onResetLimit,
}: LimitsTabProps) {
    const [search, setSearch] = useState('');

    const rows = useMemo(() => {
        if (!limits) return [];
        const query = search.trim().toLowerCase();
        const sorted = [...limits.sessions].sort((a, b) => {
            const nameA = sessionName(sessions, a.type, a.id);
            const nameB = sessionName(sessions, b.type, b.id);
            return nameA.localeCompare(nameB, 'zh-CN');
        });
        if (!query) return sorted;
        return sorted.filter(
            (row) =>
                row.id.includes(query) ||
                sessionName(sessions, row.type, row.id)
                    .toLowerCase()
                    .includes(query),
        );
    }, [limits, search, sessions]);

    if (!limits) {
        return (
            <div className="flex h-64 items-center justify-center empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-sm text-gray-400">
                        {loading
                            ? '加载上限数据中...'
                            : '上限数据不可用'}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:w-72">
                    <IconSearch
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        className="input-field pl-9"
                        placeholder="搜索群名、好友昵称或号码"
                        value={search}
                        onChange={(event) =>
                            setSearch(event.target.value)
                        }
                    />
                </div>
                <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={onRefresh}
                >
                    <IconRefresh size={13} />
                    刷新
                </button>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
                上限范围 {limits.meta.min}~{limits.meta.max}
                ；留空表示跟随默认值。 默认上限：直播 群{' '}
                {limits.meta.defaults.live.group} / 私聊{' '}
                {limits.meta.defaults.live.private}，同接 群{' '}
                {limits.meta.defaults.online.group} / 私聊{' '}
                {limits.meta.defaults.online.private}，动态 群{' '}
                {limits.meta.defaults.dyn.group} / 私聊{' '}
                {limits.meta.defaults.dyn.private}
                。超级管理员私聊无上限。
            </div>

            <p className="text-xs text-gray-400">
                共 {limits.sessions.length} 个有监听或显式上限的会话
                {rows.length !== limits.sessions.length &&
                    `，筛选后 ${rows.length} 个`}
            </p>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
                                <th className="px-4 py-2.5 font-medium">
                                    会话
                                </th>
                                {KINDS.map((kind) => (
                                    <th
                                        key={kind}
                                        className="px-3 py-2.5 font-medium"
                                    >
                                        {KIND_LABELS[kind]}上限
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {rows.map((row) => (
                                <tr
                                    key={`${row.type}:${row.id}`}
                                    className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                                    row.type ===
                                                    'group'
                                                        ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400'
                                                        : 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400'
                                                }`}
                                            >
                                                {row.type === 'group'
                                                    ? '群'
                                                    : '私聊'}
                                            </span>
                                            <span className="truncate text-gray-800 dark:text-gray-200">
                                                {sessionName(
                                                    sessions,
                                                    row.type,
                                                    row.id,
                                                )}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 font-mono text-[10px] text-gray-400">
                                            {row.id}
                                            {row.unlimited && (
                                                <span className="ml-2 text-primary">
                                                    无上限
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    {KINDS.map((kind) => {
                                        const current =
                                            effectiveLimit(
                                                row,
                                                kind,
                                                limits.meta.defaults,
                                            );
                                        const override =
                                            row.limits[kind];
                                        return (
                                            <td
                                                key={kind}
                                                className="px-3 py-3"
                                            >
                                                <LimitCell
                                                    session={row}
                                                    kind={kind}
                                                    current={current}
                                                    override={
                                                        override
                                                    }
                                                    defaultValue={
                                                        limits.meta
                                                            .defaults[
                                                            kind
                                                        ][row.type]
                                                    }
                                                    min={
                                                        limits.meta
                                                            .min
                                                    }
                                                    max={
                                                        limits.meta
                                                            .max
                                                    }
                                                    onSet={onSetLimit}
                                                    onReset={
                                                        onResetLimit
                                                    }
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {rows.length === 0 && (
                    <div className="py-12 text-center text-sm text-gray-400">
                        {search ? '没有匹配的会话' : '暂无会话数据'}
                    </div>
                )}
            </div>
        </div>
    );
}

function LimitCell({
    session,
    kind,
    current,
    override,
    defaultValue,
    min,
    max,
    onSet,
    onReset,
}: {
    session: LimitSessionView;
    kind: MonitorLimitKind;
    current: number | null;
    override: number | undefined;
    defaultValue: number;
    min: number;
    max: number;
    onSet: (
        session: LimitSessionView,
        kind: MonitorLimitKind,
        max: number,
    ) => Promise<void>;
    onReset: (
        session: LimitSessionView,
        kind: MonitorLimitKind,
    ) => Promise<void>;
}) {
    const [value, setValue] = useState(
        override === undefined ? '' : String(override),
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        setValue(override === undefined ? '' : String(override));
        setError(false);
    }, [override]);

    if (session.unlimited) {
        return (
            <div className="space-y-1">
                <div className="text-sm font-medium text-primary">
                    ∞
                </div>
                <div className="text-[10px] text-gray-400">
                    已用 {session.used[kind]}
                </div>
            </div>
        );
    }

    const commit = async () => {
        const trimmed = value.trim();
        if (trimmed === '') {
            if (override !== undefined) {
                setBusy(true);
                try {
                    await onReset(session, kind);
                } finally {
                    setBusy(false);
                }
            }
            return;
        }
        const parsed = Number(trimmed);
        if (
            !Number.isInteger(parsed) ||
            parsed < min ||
            parsed > max
        ) {
            setError(true);
            return;
        }
        if (parsed === override) return;
        setError(false);
        setBusy(true);
        try {
            await onSet(session, kind, parsed);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1.5">
                <input
                    className={`w-16 rounded-lg border px-2 py-1 text-xs outline-none transition-colors ${
                        error
                            ? 'border-red-400 bg-red-50 dark:bg-red-500/10'
                            : 'border-gray-200 bg-white focus:border-primary dark:border-gray-700 dark:bg-[#1e1e20]'
                    }`}
                    inputMode="numeric"
                    placeholder={String(defaultValue)}
                    value={value}
                    disabled={busy}
                    onChange={(event) => {
                        setValue(event.target.value);
                        setError(false);
                    }}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                            setValue(
                                override === undefined
                                    ? ''
                                    : String(override),
                            );
                            setError(false);
                            event.currentTarget.blur();
                        }
                    }}
                />
                {override !== undefined && (
                    <button
                        type="button"
                        className="text-[10px] text-gray-400 hover:text-primary"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await onReset(session, kind);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        恢复
                    </button>
                )}
            </div>
            <div className="text-[10px] text-gray-400">
                已用 {session.used[kind]} / {limitText(current)}
                {override === undefined && '（默认）'}
            </div>
            {error && (
                <div className="text-[10px] text-red-500">
                    {min}~{max} 整数
                </div>
            )}
        </div>
    );
}
