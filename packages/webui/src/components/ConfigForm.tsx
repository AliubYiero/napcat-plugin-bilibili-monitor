import type { ComponentType } from 'react';
import type {
    ConfigField,
    PluginConfig,
    ValueFieldDescriptor,
} from 'shared';
import { FIELDS } from 'shared';
import BooleanField from './configFields/BooleanField';
import {
    DisplayField,
    SectionField,
} from './configFields/LayoutFields';
import MultiSelectField from './configFields/MultiSelectField';
import NumberField from './configFields/NumberField';
import PasswordField from './configFields/PasswordField';
import SelectField from './configFields/SelectField';
import StringListField from './configFields/StringListField';
import TextField from './configFields/TextField';

/** 覆盖组件 props: 逃生舱只改呈现, 不清洗语义 */
export interface FieldRenderProps<T = unknown> {
    field: ValueFieldDescriptor;
    value: T;
    onChange: (value: T) => void;
}

export type FieldRenderer = ComponentType<FieldRenderProps>;

/**
 * 遍历视图: 收窄为描述符统一类型。
 * FIELDS 是 `as const` 字面量元组, 其元素类型只含模板当前已有的 kind;
 * 直接遍历会让 switch 无法覆盖全部 kind (如暂无 number 字段时 number 分支报错)。
 */
const FIELDS_UI: readonly ConfigField[] = FIELDS;

interface ConfigFormProps {
    config: PluginConfig;
    onChange: (key: keyof PluginConfig, value: unknown) => void;
    /** 按字段 key 覆盖渲染 (可选); 未覆盖的走内置 kind 控件 */
    overrides?: Record<string, FieldRenderer>;
}

/**
 * 通用配置表单
 *
 * 直接消费 shared 的 FIELDS 描述符, 按 kind 渲染对应控件。
 * 新增配置项无需改本文件 (除非要定制某个字段的交互)。
 */
export default function ConfigForm({
    config,
    onChange,
    overrides,
}: ConfigFormProps) {
    return (
        <div className="space-y-5">
            {FIELDS_UI.map((field) => {
                // 仅原生面板显示的字段: 自建前端跳过 (scope 只影响呈现)
                if (field.scope === 'panel') return null;
                // 布局/展示字段: 无 key, 不落盘
                if (!('key' in field)) {
                    return field.kind === 'section' ? (
                        <SectionField
                            key={`section-${field.label}`}
                            field={field}
                        />
                    ) : (
                        <DisplayField
                            key={`display-${field.content}`}
                            field={field}
                        />
                    );
                }

                const value: unknown = config[field.key];
                const handleChange = (v: unknown) =>
                    onChange(field.key, v);

                const Override = overrides?.[field.key];
                if (Override) {
                    return (
                        <Override
                            key={field.key}
                            field={field}
                            value={value}
                            onChange={handleChange}
                        />
                    );
                }

                switch (field.kind) {
                    case 'boolean':
                        return (
                            <BooleanField
                                key={field.key}
                                field={field}
                                value={value as boolean}
                                onChange={handleChange}
                            />
                        );
                    case 'text':
                        return (
                            <TextField
                                key={field.key}
                                field={field}
                                value={value as string}
                                onChange={handleChange}
                            />
                        );
                    case 'password':
                        return (
                            <PasswordField
                                key={field.key}
                                field={field}
                                value={value as string}
                                onChange={handleChange}
                            />
                        );
                    case 'number':
                        return (
                            <NumberField
                                key={field.key}
                                field={field}
                                value={value as number}
                                onChange={handleChange}
                            />
                        );
                    case 'select':
                        return (
                            <SelectField
                                key={field.key}
                                field={field}
                                value={value as string | number}
                                onChange={handleChange}
                            />
                        );
                    case 'multiSelect':
                        return (
                            <MultiSelectField
                                key={field.key}
                                field={field}
                                value={value as (string | number)[]}
                                onChange={handleChange}
                            />
                        );
                    case 'stringList':
                        return (
                            <StringListField
                                key={field.key}
                                field={field}
                                value={value as string[]}
                                onChange={handleChange}
                            />
                        );
                }

                return null;
            })}
        </div>
    );
}
