/**
 * 标签输入纯函数
 *
 * 范式: docs/webui-config-pattern.md 的 stringList 标签输入。
 * 分隔符与 shared 的 parseStringList 一致 (逗号 / 换行), 保证前后端一致。
 */

/**
 * 追加标签: trim / 去空 / 去重后并入, 返回新数组。
 *
 * 已有项保持原位, 新项按入参顺序追加; 不修改原数组。
 */
export function appendTags(
    list: readonly string[],
    tags: readonly string[],
): string[] {
    const next = [...list];
    for (const raw of tags) {
        const tag = raw.trim();
        if (tag.length > 0 && !next.includes(tag)) next.push(tag);
    }
    return next;
}

/** 移除首个匹配项, 返回新数组; 未命中则原样复制 */
export function removeTag(
    list: readonly string[],
    value: string,
): string[] {
    const index = list.indexOf(value);
    if (index < 0) return [...list];
    return [...list.slice(0, index), ...list.slice(index + 1)];
}

/**
 * 键入过程中按分隔符 (逗号 / 换行) 切分:
 * 除最后一段 (仍在输入的未完成段) 外, 前面的完整段成为待提交标签,
 * 尾段原样保留在输入框 (供继续输入或回车 / 失焦提交)。
 */
export function splitPending(raw: string): {
    complete: string[];
    pending: string;
} {
    const segments = raw.split(/[,\n\r]/);
    const pending = segments.pop() ?? '';
    const complete = segments
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    return { complete, pending };
}
