import { Fragment, useMemo, useState } from 'react';
import type { DynMonitorView, MonitorTargetInput } from 'shared';
import SelectBox, {
    type SelectBoxOption,
} from '../../components/configFields/SelectBox';
import {
    IconChevronDown,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconTrash,
} from '../../components/Icons';
import type { SessionInfo } from '../../types';
import { formatRelative, sessionName } from '../../utils/monitorView';
import ConfirmDialog from './ConfirmDialog';

const HEALTH_FILTER_OPTIONS: readonly SelectBoxOption[] = [
    { label: '全部健康状态', value: 'all' },
    { label: '正常', value: 'ok' },
    { label: '最近失败', value: 'failed' },
];

interface DynTabProps {
    dyn: DynMonitorView[];
    sessions: SessionInfo[];
    loggedIn: boolean;
    loading: boolean;
    onAdd: () => void;
    onRefresh: () => void;
    onRemove: (
        uid: string,
        target: MonitorTargetInput,
    ) => Promise<void>;
}

export default function DynTab({
    dyn,
    sessions,
    loggedIn,
    loading,
    onAdd,
    onRefresh,
    onRemove,
}: DynTabProps) {
    const [search, setSearch] = useState('');
    const [healthFilter, setHealthFilter] = useState<
        'all' | 'ok' | 'failed'
    >('all');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [pendingRemove, setPendingRemove] = useState<{
        uid: string;
        target: MonitorTargetInput;
        label: string;
    } | null>(null);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return dyn.filter((row) => {
            if (healthFilter === 'ok' && row.health.lastError) {
                return false;
            }
            if (healthFilter === 'failed' && !row.health.lastError) {
                return false;
            }
            if (!query) return true;
            return (
                row.uid.includes(query) ||
                row.uname.toLowerCase().includes(query)
            );
        });
    }, [dyn, search, healthFilter]);

    const toggleExpanded = (uid: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
    };

    const confirmRemove = async () => {
        if (!pendingRemove) return;
        setBusy(true);
        try {
            await onRemove(pendingRemove.uid, pendingRemove.target);
            setPendingRemove(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(10rem,16rem)_9rem_1fr] sm:items-center">
                <div className="relative min-w-0">
                    <IconSearch
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        className="input-field pl-9"
                        placeholder="搜索主播名称或 UID"
                        value={search}
                        onChange={(event) =>
                            setSearch(event.target.value)
                        }
                    />
                </div>
                <SelectBox
                    options={HEALTH_FILTER_OPTIONS}
                    value={[healthFilter]}
                    placeholder="全部健康状态"
                    onChange={(next) =>
                        setHealthFilter(
                            next[0] as 'all' | 'ok' | 'failed',
                        )
                    }
                />
                <div className="flex items-center gap-2 whitespace-nowrap sm:justify-self-end">
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
                        新增动态监听
                    </button>
                </div>
            </div>

            {!loggedIn && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                    动态监听需要 B 站登录。请在私聊执行
                    <span className="cmd mx-1">#bili user login</span>
                    扫码登录后再添加。
                </div>
            )}

            <p className="text-xs text-gray-400">
                共 {dyn.length} 个主播，
                {dyn.reduce(
                    (total, row) => total + row.targets.length,
                    0,
                )}{' '}
                个推送目标
                {rows.length !== dyn.length &&
                    `，筛选后 ${rows.length} 个`}
            </p>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
                                <th className="sticky left-0 z-10 w-8 bg-gray-50 px-2 py-2.5 dark:bg-[#1e1e20]" />
                                <th className="sticky left-8 z-10 bg-gray-50 px-3 py-2.5 font-medium dark:bg-[#1e1e20]">
                                    主播
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    目标
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    缓存动态
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    最近检查
                                </th>
                                <th className="px-3 py-2.5 font-medium">
                                    状态
                                </th>
                                <th className="w-14 px-3 py-2.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {rows.map((row) => {
                                const isExpanded = expanded.has(
                                    row.uid,
                                );
                                const hasError =
                                    !!row.health.lastError;
                                return (
                                    <Fragment key={row.uid}>
                                        <tr className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                                            <td className="sticky left-0 z-10 bg-white px-2 py-2.5 dark:bg-[#1e1e20]">
                                                <button
                                                    type="button"
                                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                                    onClick={() =>
                                                        toggleExpanded(
                                                            row.uid,
                                                        )
                                                    }
                                                    aria-label={
                                                        isExpanded
                                                            ? '收起明细'
                                                            : '展开明细'
                                                    }
                                                >
                                                    <IconChevronDown
                                                        size={14}
                                                        className={`transition-transform ${
                                                            isExpanded
                                                                ? 'rotate-180'
                                                                : ''
                                                        }`}
                                                    />
                                                </button>
                                            </td>
                                            <td className="sticky left-8 z-10 bg-white px-3 py-2.5 dark:bg-[#1e1e20]">
                                                <div className="font-medium text-gray-800 dark:text-gray-200">
                                                    {row.uname}
                                                </div>
                                                <div className="font-mono text-[11px] text-gray-400">
                                                    UID {row.uid}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500">
                                                {row.targets.length}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500">
                                                {row.cachedCount}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500">
                                                {formatRelative(
                                                    row.health
                                                        .lastCheckAt,
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                        hasError
                                                            ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                                                            : row
                                                                    .health
                                                                    .lastSuccessAt
                                                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                              : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400'
                                                    }`}
                                                >
                                                    <span
                                                        className={`h-1.5 w-1.5 rounded-full ${
                                                            hasError
                                                                ? 'bg-red-500'
                                                                : row
                                                                        .health
                                                                        .lastSuccessAt
                                                                  ? 'bg-emerald-500'
                                                                  : 'bg-gray-400'
                                                        }`}
                                                    />
                                                    {hasError
                                                        ? '异常'
                                                        : row.health
                                                                .lastSuccessAt
                                                          ? '正常'
                                                          : '未检查'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <button
                                                    type="button"
                                                    className="text-[11px] text-primary hover:underline"
                                                    onClick={() =>
                                                        toggleExpanded(
                                                            row.uid,
                                                        )
                                                    }
                                                >
                                                    {isExpanded
                                                        ? '收起'
                                                        : '明细'}
                                                </button>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-gray-50/40 dark:bg-white/[0.015]">
                                                <td
                                                    colSpan={7}
                                                    className="px-4 py-4"
                                                >
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="mb-2 text-[11px] font-medium text-gray-400">
                                                                推送目标
                                                            </div>
                                                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                                {row.targets.map(
                                                                    (
                                                                        target,
                                                                    ) => (
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
                                                                                    {
                                                                                        target.id
                                                                                    }
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className="text-gray-400 hover:text-red-500"
                                                                                onClick={() =>
                                                                                    setPendingRemove(
                                                                                        {
                                                                                            uid: row.uid,
                                                                                            target,
                                                                                            label: sessionName(
                                                                                                sessions,
                                                                                                target.type,
                                                                                                target.id,
                                                                                            ),
                                                                                        },
                                                                                    )
                                                                                }
                                                                                aria-label="移除目标"
                                                                            >
                                                                                <IconTrash
                                                                                    size={
                                                                                        14
                                                                                    }
                                                                                />
                                                                            </button>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="grid gap-2 text-[11px] text-gray-500 sm:grid-cols-3">
                                                            <div>
                                                                最近检查：
                                                                {formatRelative(
                                                                    row
                                                                        .health
                                                                        .lastCheckAt,
                                                                )}
                                                            </div>
                                                            <div>
                                                                最近成功：
                                                                {formatRelative(
                                                                    row
                                                                        .health
                                                                        .lastSuccessAt,
                                                                )}
                                                            </div>
                                                            <div className="truncate">
                                                                最近错误：
                                                                {row
                                                                    .health
                                                                    .lastError ??
                                                                    '无'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {rows.length === 0 && (
                    <div className="py-12 text-center empty-state">
                        <p className="text-sm text-gray-400">
                            {loading
                                ? '加载动态监听中...'
                                : dyn.length === 0
                                  ? '暂无动态监听'
                                  : '没有匹配的主播'}
                        </p>
                        {!loading && dyn.length === 0 && (
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
                title="移除动态监听"
                message={
                    pendingRemove
                        ? `确定将「${pendingRemove.label}」从主播 ${pendingRemove.uid} 的动态监听中移除吗？\n移除最后一个目标时会同时清理该主播的动态缓存。`
                        : ''
                }
                confirmLabel="移除"
                busy={busy}
                onCancel={() => setPendingRemove(null)}
                onConfirm={confirmRemove}
            />
        </div>
    );
}
