import { useRef, useState } from 'react';
import type { StringListFieldDescriptor } from 'shared';
import { parseStringList } from 'shared';
import {
    appendTags,
    removeTag,
    splitPending,
} from '../../utils/tagList';
import Chip from './Chip';
import type { ValueFieldProps } from './types';

/**
 * 标签输入 (stringList)
 *
 * 回车 / 逗号触发添加, 失焦提交剩余文本, 输入框为空时退格删除末项。
 * 拆分 / 去重 / 删除由 utils/tagList 承载, 与 shared 的 parseStringList 同一分隔语义。
 */
export default function StringListField({
    field,
    value,
    onChange,
}: ValueFieldProps<StringListFieldDescriptor, readonly string[]>) {
    const [pending, setPending] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleInput = (raw: string) => {
        const { complete, pending: rest } = splitPending(raw);
        setPending(rest);
        if (complete.length > 0)
            onChange(appendTags(value, complete));
    };

    const commitPending = () => {
        if (pending.length === 0) return;
        onChange(appendTags(value, parseStringList(pending)));
        setPending('');
    };

    const handleKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitPending();
        } else if (
            event.key === 'Backspace' &&
            pending.length === 0 &&
            value.length > 0
        ) {
            onChange(removeTag(value, value[value.length - 1]));
        }
    };

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                {field.label}
            </div>
            {field.description && (
                <div className="text-xs text-gray-400 mb-2">
                    {field.description}
                </div>
            )}
            <label className="tag-input">
                {value.map((tag) => (
                    <Chip
                        key={tag}
                        label={tag}
                        onRemove={() =>
                            onChange(removeTag(value, tag))
                        }
                    />
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    value={pending}
                    placeholder={
                        value.length === 0
                            ? (field.placeholder ??
                              '输入后按回车添加')
                            : undefined
                    }
                    onChange={(event) =>
                        handleInput(event.target.value)
                    }
                    onKeyDown={handleKeyDown}
                    onBlur={(event) => {
                        const next =
                            event.relatedTarget as Node | null;
                        if (
                            next &&
                            event.currentTarget.parentElement?.contains(
                                next,
                            )
                        ) {
                            return;
                        }
                        commitPending();
                    }}
                />
            </label>
        </div>
    );
}
