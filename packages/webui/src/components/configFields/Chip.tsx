import { IconX } from '../Icons';

interface ChipProps {
    label: string;
    onRemove: () => void;
}

/**
 * 胶囊标签: 文字 + 删除按钮。
 *
 * 供 stringList 标签输入与多选下拉共用; 删除点击阻止冒泡,
 * 以便嵌入可点击容器 (如下拉触发框) 时不会连带触发容器交互。
 */
export default function Chip({ label, onRemove }: ChipProps) {
    return (
        <span className="chip">
            <span className="truncate max-w-[12rem]">{label}</span>
            <button
                type="button"
                className="chip-remove"
                aria-label={`移除 ${label}`}
                onClick={(event) => {
                    event.stopPropagation();
                    onRemove();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <IconX size={12} />
            </button>
        </span>
    );
}
