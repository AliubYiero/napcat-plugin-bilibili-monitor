import type { SelectFieldDescriptor } from 'shared';
import SelectBox from './SelectBox';
import type { ValueFieldProps } from './types';

export default function SelectField({
    field,
    value,
    onChange,
}: ValueFieldProps<SelectFieldDescriptor, string | number>) {
    return (
        <SelectBox
            label={field.label}
            description={field.description}
            options={field.options}
            value={[value]}
            onChange={(next) => {
                if (next.length > 0) onChange(next[0]);
            }}
        />
    );
}
