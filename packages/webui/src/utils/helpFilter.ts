import type {
    Cmd,
    ContentHelp,
    ContentHelpMethod,
    InstructionSet,
} from '../types';

/**
 * 帮助面板的搜索过滤 / 选中态 (纯函数)
 *
 * 渲染规则移植自上游渲染服务 napcat-help-generate, 此处只承载"过滤"部分:
 * 文本搜索叠加在分组/方法/步骤粒度上, 剥离内联 HTML 后做大小写不敏感匹配。
 * 抽为纯函数以便单测 (组件层不可纯测的 IO 部分留在 HelpPage)。
 */

// ---------- 类型守卫 ----------

export function isInstructionSet(
    item: InstructionSet | ContentHelp,
): item is InstructionSet {
    return Array.isArray((item as InstructionSet).instructions);
}

// ---------- 搜索辅助 ----------

/** 剥离内联 HTML, 仅用于搜索文本匹配 */
export function stripHtml(text: string): string {
    return text.replace(/<[^>]+>/g, '');
}

export function matches(text: string, q: string): boolean {
    return stripHtml(text).toLowerCase().includes(q);
}

// ---------- 分组过滤 ----------

export function filterInstructionSet(
    item: InstructionSet,
    q: string,
): InstructionSet | null {
    if (!q || matches(item.groupName, q)) return item;
    const instructions = item.instructions.filter(
        (inst) => matches(inst.cmd, q) || matches(inst.desc, q),
    );
    if (instructions.length === 0) return null;
    return { ...item, instructions };
}

export function filterContentHelp(
    item: ContentHelp,
    q: string,
): ContentHelp | null {
    if (!q || matches(item.groupName, q)) return item;
    const methods = item.methods
        .map((method): ContentHelpMethod | null => {
            if (matches(method.name, q)) return method;
            const steps = method.steps.filter((step) =>
                matches(
                    Array.isArray(step) ? step.join(' ') : step,
                    q,
                ),
            );
            if (steps.length === 0) return null;
            return { ...method, steps };
        })
        .filter((m): m is ContentHelpMethod => m !== null);
    if (methods.length === 0) return null;
    return { ...item, methods };
}

export function filterCmd(cmd: Cmd, q: string): Cmd {
    const groups = cmd.cmd
        .map((item) =>
            isInstructionSet(item)
                ? filterInstructionSet(item, q)
                : filterContentHelp(item, q),
        )
        .filter(
            (item): item is InstructionSet | ContentHelp =>
                item !== null,
        );
    return { ...cmd, cmd: groups };
}

// ---------- 选中面板 ----------

/**
 * 搜索后决定激活的面板下标:
 * 无搜索词时保持当前; 有搜索词时, 当前面板若无命中则切到首个有命中的面板,
 * 全无命中则保持当前。
 */
export function resolveActivePanel(
    groupsPerPanel: readonly number[],
    current: number,
    hasQuery: boolean,
): number {
    if (!hasQuery) return current;
    if ((groupsPerPanel[current] ?? 0) > 0) return current;
    const idx = groupsPerPanel.findIndex((count) => count > 0);
    return idx >= 0 ? idx : current;
}
