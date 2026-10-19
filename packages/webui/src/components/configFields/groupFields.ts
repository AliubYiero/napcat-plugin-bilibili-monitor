import type { ConfigField } from 'shared';

/** 分组视图: 由扁平 FIELDS 中相邻的 section 切分而来 */
export interface ConfigGroup {
    /** 稳定渲染键 (隐式组为 default, 显式组为 section-<索引>) */
    key: string;
    /** 卡片标题 */
    label: string;
    /** section 的说明文字 (可选) */
    description?: string;
    /** 该组内的可见字段 (不含 section 行) */
    fields: ConfigField[];
}

const DEFAULT_GROUP_LABEL = '基础配置';

/**
 * 把扁平 FIELDS 切分为分组 (纯函数)
 *
 * 语义 (见 docs/config-pattern.md):
 *   - 第一个 section 之前的字段归入「基础配置」;
 *   - 每个可见 section 开启新组, 后续字段归属该组直到下一个 section;
 *   - 被 `scope` 过滤掉的 section 不可见, 也不作为分组边界;
 *   - 只返回非空组 (空 section / 空的基础组不产生空卡片)。
 */
export function groupFields(
    fields: readonly ConfigField[],
    side: 'webui' | 'panel',
): ConfigGroup[] {
    const groups: ConfigGroup[] = [];
    const hiddenScope = side === 'webui' ? 'panel' : 'webui';
    let current: ConfigGroup = {
        key: 'default',
        label: DEFAULT_GROUP_LABEL,
        fields: [],
    };

    const flush = () => {
        if (current.fields.length > 0) groups.push(current);
    };

    fields.forEach((field, index) => {
        if (field.scope === hiddenScope) return;
        if (field.kind === 'section') {
            flush();
            current = {
                key: `section-${index}`,
                label: field.label,
                description: field.description,
                fields: [],
            };
            return;
        }
        current.fields.push(field);
    });
    flush();

    return groups;
}
