import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '../Icons';
import Chip from './Chip';

export interface SelectBoxOption {
    label: string;
    value: string | number;
}

interface SelectBoxProps {
    /** 筛选器场景可省略; 省略时不渲染标题块 */
    label?: string;
    description?: string;
    options: readonly SelectBoxOption[];
    /** 已选值 (单选 0..1 项; 多选 0..n 项), 顺序无关 */
    value: readonly (string | number)[];
    multiple?: boolean;
    placeholder?: string;
    onChange: (next: (string | number)[]) => void;
}

/** 下拉面板最大高度 (与 max-h-64 一致) */
const PANEL_MAX_HEIGHT = 256;
/** 面板与触发框的间距 */
const PANEL_GAP = 4;
/** 面板与视口边缘的留白 */
const VIEWPORT_MARGIN = 8;

interface PanelPosition {
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
}

/**
 * 下拉选择框 (单选 / 多选共用)
 *
 * 结构对齐 WebUI 其它自建控件: 标题 / 描述 / 控件 纵向排列, 标题不放进框内;
 * 筛选器场景可省略标题。触发框复用 `.input-field` 外观 + 右侧箭头, 点开弹出
 * listbox, 选项右侧带勾选标记 (下拉交互对齐 NapCat 原生面板的 select)。
 *
 * 面板经 portal 挂到 document.body 并采用 fixed 定位: 避免被卡片等祖先的
 * transform 堆叠上下文或滚动容器的 overflow 裁剪; 随滚动 / 缩放重新定位,
 * 上下空间不足时自动向上翻转。多选在同一面板内勾选, 触发框以胶囊展示已选项
 * (点胶囊 X 直接移除), 提交顺序按 options 声明顺序回填 (与后端清洗结果一致)。
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
    const [panelPosition, setPanelPosition] =
        useState<PanelPosition | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const updatePanelPosition = useCallback(() => {
        const trigger = rootRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const spaceBelow =
            window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - VIEWPORT_MARGIN;
        const placeAbove =
            spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;

        setPanelPosition({
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(
                0,
                Math.min(
                    PANEL_MAX_HEIGHT,
                    placeAbove ? spaceAbove : spaceBelow,
                ),
            ),
            ...(placeAbove
                ? {
                      bottom:
                          window.innerHeight - rect.top + PANEL_GAP,
                  }
                : { top: rect.bottom + PANEL_GAP }),
        });
    }, []);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            // 面板已 portal 到 body, 需单独判断, 否则点选项会先被外点关闭
            if (rootRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const onViewportChange = () => updatePanelPosition();

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener(
                'scroll',
                onViewportChange,
                true,
            );
            window.removeEventListener('resize', onViewportChange);
        };
    }, [open, updatePanelPosition]);

    const toggleOpen = () => {
        if (open) {
            setOpen(false);
            return;
        }
        updatePanelPosition();
        setOpen(true);
    };

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
            {label && (
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                    {label}
                </div>
            )}
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
                    onClick={toggleOpen}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget)
                            return;
                        if (
                            event.key === 'Enter' ||
                            event.key === ' '
                        ) {
                            event.preventDefault();
                            toggleOpen();
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

                {open &&
                    panelPosition &&
                    createPortal(
                        <div
                            ref={panelRef}
                            style={{
                                left: panelPosition.left,
                                width: panelPosition.width,
                                maxHeight: panelPosition.maxHeight,
                                ...(panelPosition.top !== undefined
                                    ? { top: panelPosition.top }
                                    : {
                                          bottom: panelPosition.bottom,
                                      }),
                            }}
                            className="fixed z-[60] p-1 overflow-y-auto bg-white dark:bg-[#1e1e20] border border-gray-100 dark:border-gray-800 rounded-lg shadow-lg animate-scale-in"
                        >
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
                        </div>,
                        document.body,
                    )}
            </div>
        </div>
    );
}
