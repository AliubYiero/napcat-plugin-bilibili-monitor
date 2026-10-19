import { useEffect, useState } from 'react';
import type { NumberFieldDescriptor } from 'shared';
import type { ValueFieldProps } from './types';

export default function NumberField({
    field,
    value,
    onChange,
}: ValueFieldProps<NumberFieldDescriptor, number>) {
    const [local, setLocal] = useState(String(value));
    useEffect(() => {
        setLocal(String(value));
    }, [value]);

    const commit = () => {
        const parsed = Number(local);
        if (
            local.trim() !== '' &&
            Number.isFinite(parsed) &&
            parsed !== value
        ) {
            onChange(parsed);
        } else {
            setLocal(String(value));
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
            <input
                className="input-field"
                type="number"
                value={local}
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && commit()}
            />
        </div>
    );
}
