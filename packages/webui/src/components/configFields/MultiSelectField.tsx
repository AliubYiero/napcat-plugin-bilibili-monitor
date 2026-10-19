import type { MultiSelectFieldDescriptor } from 'shared';
import SelectBox from './SelectBox';
import type { ValueFieldProps } from './types';

export default function MultiSelectField({
    field,
    value,
    onChange,
}: ValueFieldProps<
    MultiSelectFieldDescriptor,
    readonly (string | number)[]
>) {
    return (
        <SelectBox
            label={field.label}
            description={field.description}
            options={field.options}
            value={value}
            multiple
            onChange={onChange}
        />
    );
}
