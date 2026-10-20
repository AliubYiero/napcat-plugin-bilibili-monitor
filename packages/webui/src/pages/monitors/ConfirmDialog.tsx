import { IconAlert } from '../../components/Icons';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = '确认',
    busy = false,
    onCancel,
    onConfirm,
}: ConfirmDialogProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="w-full max-w-sm rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e20] p-5 shadow-xl animate-scale-in"
            >
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-amber-500">
                        <IconAlert size={20} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400 whitespace-pre-line">
                            {message}
                        </p>
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? '处理中...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
