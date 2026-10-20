import { useEffect, useMemo, useState } from 'react';
import type { MonitorTargetInput, MonitorTargetResult } from 'shared';
import { IconCheck, IconSearch, IconX } from '../../components/Icons';
import type { SessionInfo } from '../../types';
import { sessionKey } from '../../utils/monitorView';

interface AddMonitorDialogProps {
    open: boolean;
    kind: 'live' | 'dyn';
    sessions: SessionInfo[];
    onClose: () => void;
    onSubmit: (
        uid: string,
        targets: MonitorTargetInput[],
    ) => Promise<MonitorTargetResult[]>;
    onSubmitted: (results: MonitorTargetResult[]) => void;
}

export default function AddMonitorDialog({
    open,
    kind,
    sessions,
    onClose,
    onSubmit,
    onSubmitted,
}: AddMonitorDialogProps) {
    const [uid, setUid] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [results, setResults] = useState<
        MonitorTargetResult[] | null
    >(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setUid('');
        setSearch('');
        setSelected(new Set());
        setSubmitting(false);
        setResults(null);
        setError(null);
    }, [open]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return sessions;
        return sessions.filter(
            (session) =>
                session.id.includes(query) ||
                session.name?.toLowerCase().includes(query),
        );
    }, [sessions, search]);

    if (!open) return null;

    const toggle = (session: SessionInfo) => {
        const key = sessionKey(session.type, session.id);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        setResults(null);
    };

    const submit = async () => {
        const trimmed = uid.trim();
        if (!/^\d+$/.test(trimmed)) {
            setError('请输入数字主播 UID');
            return;
        }
        if (selected.size === 0) {
            setError('请至少选择一个推送会话');
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const targets: MonitorTargetInput[] = [...selected].map(
                (key) => {
                    const [type, id] = key.split(':');
                    return {
                        type: type as 'group' | 'private',
                        id,
                    };
                },
            );
            const next = await onSubmit(trimmed, targets);
            setResults(next);
            onSubmitted(next);
            if (next.length > 0 && next.every((item) => item.ok)) {
                onClose();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '添加失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={
                    kind === 'live' ? '新增直播监听' : '新增动态监听'
                }
                className="flex max-h-full w-full max-w-lg flex-col rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e20] shadow-xl animate-scale-in"
            >
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {kind === 'live'
                                ? '新增直播监听'
                                : '新增动态监听'}
                        </h3>
                        <p className="mt-1 text-xs text-gray-400">
                            添加后只建立最新状态基线，不补推历史
                        </p>
                    </div>
                    <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="关闭"
                    >
                        <IconX size={16} />
                    </button>
                </div>

                <div className="space-y-3 overflow-y-auto px-5 py-4">
                    <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                            主播 UID
                        </span>
                        <input
                            className="input-field"
                            inputMode="numeric"
                            placeholder="例如 123456"
                            value={uid}
                            onChange={(event) => {
                                setUid(event.target.value);
                                setError(null);
                            }}
                        />
                    </label>

                    <div>
                        <span className="mb-1 block text-xs font-medium text-gray-500">
                            推送会话
                        </span>
                        <div className="relative">
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
                    </div>

                    <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800/60">
                        {filtered.map((session) => {
                            const key = sessionKey(
                                session.type,
                                session.id,
                            );
                            return (
                                <label
                                    key={key}
                                    className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                                >
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                                        checked={selected.has(key)}
                                        onChange={() =>
                                            toggle(session)
                                        }
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-gray-800 dark:text-gray-200">
                                            {session.name ||
                                                (session.type ===
                                                'group'
                                                    ? '未知群'
                                                    : '未知好友')}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                                            <span className="font-mono">
                                                {session.type ===
                                                'group'
                                                    ? '群'
                                                    : 'QQ'}{' '}
                                                {session.id}
                                            </span>
                                            {!session.enabled && (
                                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                                                    指令已禁用，推送不受影响
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                        {filtered.length === 0 && (
                            <p className="px-3 py-8 text-center text-xs text-gray-400">
                                没有匹配的会话
                            </p>
                        )}
                    </div>

                    {results && (
                        <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 dark:bg-white/[0.03]">
                            {results.map((item) => (
                                <div
                                    key={`${item.type}:${item.id}`}
                                    className="flex items-start gap-2 text-xs"
                                >
                                    <span
                                        className={
                                            item.ok
                                                ? 'text-emerald-500'
                                                : 'text-red-500'
                                        }
                                    >
                                        {item.ok ? (
                                            <IconCheck size={13} />
                                        ) : (
                                            <IconX size={13} />
                                        )}
                                    </span>
                                    <span className="text-gray-600 dark:text-gray-300">
                                        <span className="font-mono">
                                            {item.type === 'group'
                                                ? '群'
                                                : 'QQ'}{' '}
                                            {item.id}
                                        </span>
                                        {' · '}
                                        {item.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && (
                        <p className="text-xs text-red-500">
                            {error}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                    <span className="text-[11px] text-gray-400">
                        已选 {selected.size} 个会话
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="btn btn-ghost text-xs"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            {results ? '完成' : '取消'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary text-xs"
                            onClick={submit}
                            disabled={submitting}
                        >
                            {submitting ? '添加中...' : '确认添加'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
