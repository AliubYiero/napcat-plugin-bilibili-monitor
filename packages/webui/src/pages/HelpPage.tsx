import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconHelp, IconSearch } from '../components/Icons';
import type {
    Cmd,
    ContentHelp,
    Instruction,
    InstructionSet,
} from '../types';
import { noAuthFetch } from '../utils/api';
import {
    filterCmd,
    isInstructionSet,
    resolveActivePanel,
} from '../utils/helpFilter';

/**
 * 帮助文档页
 *
 * 渲染后端 GET /help 返回的全部帮助面板 (内容为 cmds 权威源原样, 未做权限过滤,
 * 等同超级管理员视图)。渲染规则移植自上游渲染服务 napcat-help-generate:
 * - InstructionSet: 文本转义, 权限/会话范围以徽章标识
 * - ContentHelp: name 转义, steps 含可信内联 HTML (dangerouslySetInnerHTML)
 *
 * 搜索过滤与面板选择为纯函数, 见 utils/helpFilter。
 */

// ---------- 徽章与标题 ----------

function PermissionTag({
    item,
}: {
    item: InstructionSet | ContentHelp;
}) {
    if (item.isAdmin === true) {
        return (
            <span className="text-[10px] leading-none px-1.5 py-1 rounded bg-orange-500 text-white font-medium">
                ADMIN
            </span>
        );
    }
    if (item.isSuperAdmin === true) {
        return (
            <span className="text-[10px] leading-none px-1.5 py-1 rounded bg-violet-500 text-white font-medium">
                SUPER ADMIN
            </span>
        );
    }
    return null;
}

function LimitTag({ inst }: { inst: Instruction }) {
    if (inst.onlyPrivate === true) {
        return (
            <span className="text-[10px] leading-none px-1.5 py-1 rounded bg-sky-500 text-white font-medium">
                仅私聊
            </span>
        );
    }
    if (inst.onlyGroup === true) {
        return (
            <span className="text-[10px] leading-none px-1.5 py-1 rounded bg-emerald-500 text-white font-medium">
                仅群聊
            </span>
        );
    }
    return null;
}

/** 分组标题样式: 超管紫 / 管理员橙 / 普通主题色 */
function headingClass(item: InstructionSet | ContentHelp): string {
    if (item.isAdmin === true) {
        return 'bg-orange-500/10 border-orange-500 text-orange-500';
    }
    if (item.isSuperAdmin === true) {
        return 'bg-violet-500/10 border-violet-500 text-violet-500';
    }
    return 'bg-primary/10 border-primary text-primary';
}

function GroupHeading({
    item,
}: {
    item: InstructionSet | ContentHelp;
}) {
    return (
        <h3
            className={`flex items-center gap-2 px-3 py-2 border-l-4 text-sm font-semibold ${headingClass(item)}`}
        >
            <span>{item.groupName}</span>
            <PermissionTag item={item} />
        </h3>
    );
}

// ---------- 分组渲染 ----------

function InstructionSetBlock({ item }: { item: InstructionSet }) {
    return (
        <div>
            <GroupHeading item={item} />
            <div className="mt-3 space-y-2">
                {item.instructions.map((inst) => (
                    <div
                        key={inst.cmd}
                        className="rounded-lg bg-gray-50/70 dark:bg-white/[0.02] p-3"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="cmd">{inst.cmd}</span>
                            <LimitTag inst={inst} />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-400">
                            {inst.desc}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ContentHelpBlock({ item }: { item: ContentHelp }) {
    return (
        <div>
            <GroupHeading item={item} />
            <div className="mt-3 space-y-4">
                {item.methods.map((method, mi) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 图文方法为静态有序列表
                    <div key={`method-${mi}`}>
                        {method.name.trim() !== '' && (
                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
                                {method.name}
                            </div>
                        )}
                        {method.steps.map((step, si) => {
                            const prefix =
                                method.steps.length > 1
                                    ? `${si + 1}. `
                                    : '• ';
                            if (Array.isArray(step)) {
                                return (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: 步骤为静态有序列表
                                    <div key={`step-${si}`}>
                                        <div
                                            className="text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                                            // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容来自 cmds 权威源, 视为可信
                                            dangerouslySetInnerHTML={{
                                                __html: `${prefix}${step[0] ?? ''}`,
                                            }}
                                        />
                                        {step
                                            .slice(1)
                                            .map((sub, k) => (
                                                <div
                                                    // biome-ignore lint/suspicious/noArrayIndexKey: 子步骤为静态有序列表
                                                    key={`sub-${si}-${k}`}
                                                    className="ml-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400"
                                                    // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容来自 cmds 权威源, 视为可信
                                                    dangerouslySetInnerHTML={{
                                                        __html: `- ${sub}`,
                                                    }}
                                                />
                                            ))}
                                    </div>
                                );
                            }
                            return (
                                <div
                                    // biome-ignore lint/suspicious/noArrayIndexKey: 步骤为静态有序列表
                                    key={`step-${si}`}
                                    className="text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                                    // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容来自 cmds 权威源, 视为可信
                                    dangerouslySetInnerHTML={{
                                        __html: `${prefix}${step}`,
                                    }}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function GroupBlock({
    item,
}: {
    item: InstructionSet | ContentHelp;
}) {
    if (isInstructionSet(item)) {
        return <InstructionSetBlock item={item} />;
    }
    return <ContentHelpBlock item={item} />;
}

// ---------- 页面 ----------

export default function HelpPage() {
    const [panels, setPanels] = useState<Cmd[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [active, setActive] = useState(0);

    const fetchHelp = useCallback(async () => {
        setLoading(true);
        try {
            const res = await noAuthFetch<Cmd[]>('/help');
            if (res.code === 0 && res.data) {
                setPanels(res.data);
            }
        } catch (e) {
            console.error('Help fetch failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHelp();
    }, [fetchHelp]);

    const q = search.trim().toLowerCase();

    const filteredPanels = useMemo(
        () =>
            panels.map((panel) => ({
                meta: panel,
                groups: filterCmd(panel, q).cmd,
            })),
        [panels, q],
    );

    const totalMatches = useMemo(
        () => filteredPanels.reduce((n, p) => n + p.groups.length, 0),
        [filteredPanels],
    );

    // 搜索后当前 Tab 无命中时, 自动切到首个有命中的 Tab
    useEffect(() => {
        setActive((cur) =>
            resolveActivePanel(
                filteredPanels.map((p) => p.groups.length),
                cur,
                q.length > 0,
            ),
        );
    }, [q, filteredPanels]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">
                        正在获取帮助文档...
                    </div>
                </div>
            </div>
        );
    }

    if (panels.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <IconHelp
                        size={32}
                        className="text-gray-300 dark:text-gray-600"
                    />
                    <div className="text-gray-400 text-sm">
                        暂无可用的帮助内容
                    </div>
                </div>
            </div>
        );
    }

    const showTabs = filteredPanels.length > 1;
    const activePanel = filteredPanels[active] ?? filteredPanels[0];

    return (
        <div className="space-y-4">
            {/* Tab 切换 (仅多面板时) */}
            {showTabs && (
                <div className="flex items-center gap-1 border-b border-gray-100 dark:border-gray-800 overflow-x-auto animate-fade-in-down">
                    {filteredPanels.map((panel, i) => {
                        const empty =
                            !!q && panel.groups.length === 0;
                        const isActive = i === active;
                        return (
                            <button
                                type="button"
                                key={panel.meta.id}
                                disabled={empty}
                                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                                    empty
                                        ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                        : isActive
                                          ? 'border-primary text-primary'
                                          : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                                onClick={() => setActive(i)}
                            >
                                {panel.meta.title} (
                                {panel.groups.length})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 搜索 */}
            <div className="relative w-full sm:max-w-xs animate-fade-in-down">
                <IconSearch
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                    className="input-field pl-9"
                    placeholder="搜索指令或说明..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {q && (
                <p className="text-xs text-gray-400">
                    搜索到 {totalMatches} 个分组
                </p>
            )}

            {/* 内容 */}
            <div className="card p-5 hover-lift animate-fade-in-up">
                {!showTabs && (
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                        <IconHelp
                            size={16}
                            className="text-gray-400"
                        />
                        {activePanel.meta.title}
                    </h3>
                )}

                {activePanel.groups.length === 0 ? (
                    <div className="py-12 text-center empty-state">
                        <IconHelp
                            size={32}
                            className="mx-auto text-gray-300 dark:text-gray-600 mb-3"
                        />
                        <p className="text-gray-400 text-sm">
                            {q
                                ? '没有匹配的指令'
                                : '暂无可用的帮助内容'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {activePanel.groups.map((item, i) => (
                            <GroupBlock
                                // biome-ignore lint/suspicious/noArrayIndexKey: 分组为静态有序列表
                                key={`${item.groupName}-${i}`}
                                item={item}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
