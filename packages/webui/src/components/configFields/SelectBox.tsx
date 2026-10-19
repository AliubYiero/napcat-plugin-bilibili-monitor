import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '../Icons';
import Chip from './Chip';

export interface SelectBoxOption {
    label: string;
    value: string | number;
}

interface SelectBoxProps {
    label: string;
    description?: string;
    options: readonly SelectBoxOption[];
    /** 已选值 (单选 0..1 项; 多选 0..n 项), 顺序无关 */
    value: readonly (string | number)[];
    multiple?: boolean;
    placeholder?: string;
    onChange: (next: (string | number)[]) => void;
}

/**
 * 下拉选择框 (单选 / 多选共用)
 *
 * 结构对齐 WebUI 其它自建控件: 标题 / 描述 / 控件 纵向排列, 标题不放进框内。
 * 触发框复用 `.input-field` 外观 + 右侧箭头; 点开弹出 listbox, 选项右侧带勾选标记
 * (下拉交互对齐 NapCat 原生面板的 select)。多选在同一面板内勾选,
 * 触发框以胶囊展示已选项 (点胶囊 X 直接移除), 提交顺序按 options 声明顺序回填
 * (与后端清洗结果一致)。
 */
export default function SelectBox({
    label,
    description,
    options,
    value,
    multiple = false,
    placeholder = '请选择',
    onChange,
}: SelectBoxProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (
                rootRef.current &&
                !rootRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const selectedOptions = options.filter((option) =>
        value.includes(option.value),
    );
    const filled = selectedOptions.length > 0;

    const select = (optionValue: string | number) => {
        if (multiple) {
            const selected = new Set(value);
            if (selected.has(optionValue))
                selected.delete(optionValue);
            else selected.add(optionValue);
            onChange(
                options
                    .map((option) => option.value)
                    .filter((v) => selected.has(v)),
            );
        } else {
            onChange([optionValue]);
            setOpen(false);
        }
    };

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                {label}
            </div>
            {description && (
                <div className="text-xs text-gray-400 mb-2">
                    {description}
                </div>
            )}
            <div ref={rootRef} className="relative">
                <div
                    role="combobox"
                    tabIndex={0}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => setOpen((prev) => !prev)}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget)
                            return;
                        if (
                            event.key === 'Enter' ||
                            event.key === ' '
                        ) {
                            event.preventDefault();
                            setOpen((prev) => !prev);
                        } else if (event.key === 'Escape') {
                            setOpen(false);
                        }
                    }}
                    className="input-field flex items-center justify-between gap-2 cursor-pointer text-left"
                >
                    <span className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                        {filled ? (
                            multiple ? (
                                selectedOptions.map((option) => (
                                    <Chip
                                        key={String(option.value)}
                                        label={option.label}
                                        onRemove={() =>
                                            select(option.value)
                                        }
                                    />
                                ))
                            ) : (
                                <span className="truncate">
                                    {selectedOptions[0].label}
                                </span>
                            )
                        ) : (
                            <span className="text-gray-400">
                                {placeholder}
                            </span>
                        )}
                    </span>
                    <IconChevronDown
                        size={16}
                        className={`flex-shrink-0 transition-transform duration-150 ${
                            open ? 'rotate-180' : ''
                        }`}
                    />
                </div>

                {open && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 p-1 max-h-64 overflow-y-auto bg-white dark:bg-[#1e1e20] border border-gray-100 dark:border-gray-800 rounded-lg shadow-lg animate-scale-in">
                        <div
                            role="listbox"
                            aria-multiselectable={multiple}
                            className="flex flex-col gap-0.5 outline-none"
                        >
                            {options.map((option) => {
                                const selected = value.includes(
                                    option.value,
                                );
                                return (
                                    <button
                                        key={String(option.value)}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() =>
                                            select(option.value)
                                        }
                                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border-none bg-transparent"
                                    >
                                        <span className="flex-1 truncate">
                                            {option.label}
                                        </span>
                                        {selected && (
                                            <IconCheck
                                                size={14}
                                                className="flex-shrink-0 text-primary"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
