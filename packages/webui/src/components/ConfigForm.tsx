import type { ComponentType } from 'react';
import type {
    ConfigField,
    PluginConfig,
    ValueFieldDescriptor,
} from 'shared';
import { FIELDS } from 'shared';
import BooleanField from './configFields/BooleanField';
import {
    type ConfigGroup,
    groupFields,
} from './configFields/groupFields';
import { DisplayField } from './configFields/LayoutFields';
import LoginField from './configFields/LoginField';
import MultiSelectField from './configFields/MultiSelectField';
import NumberField from './configFields/NumberField';
import PasswordField from './configFields/PasswordField';
import SelectField from './configFields/SelectField';
import StringListField from './configFields/StringListField';
import TextField from './configFields/TextField';
import { IconTerminal } from './Icons';

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

/** WebUI 分组 (模块级常量, FIELDS 是静态声明) */
const GROUPS: readonly ConfigGroup[] = groupFields(
    FIELDS_UI,
    'webui',
);

interface ConfigFormProps {
    config: PluginConfig;
    onChange: (key: keyof PluginConfig, value: unknown) => void;
    /** 按字段 key 覆盖渲染 (可选); 未覆盖的走内置 kind 控件 */
    overrides?: Record<string, FieldRenderer>;
}

/**
 * 通用配置表单
 *
 * 直接消费 shared 的 FIELDS 描述符, 按 section 切成多张卡片, 每张卡片内
 * 按 kind 渲染对应控件。新增配置项无需改本文件 (除非要定制某个字段的交互)。
 */
export default function ConfigForm({
    config,
    onChange,
    overrides,
}: ConfigFormProps) {
    const renderField = (field: ConfigField) => {
        // 分组行由 groupFields 消费, 不会出现在组内
        if (field.kind === 'section') return null;
        // 登录块: 无 key, 自带取数与交互
        if (field.kind === 'login') {
            return <LoginField key="login" field={field} />;
        }
        // 展示字段: 无 key, 不落盘
        if (!('key' in field)) {
            return (
                <DisplayField
                    key={`display-${field.content}`}
                    field={field}
                />
            );
        }

        const value: unknown = config[field.key];
        const handleChange = (v: unknown) => onChange(field.key, v);

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
    };

    return (
        <div className="space-y-5">
            {GROUPS.map((group) => (
                <div
                    key={group.key}
                    className="card p-5 hover-lift animate-fade-in-up"
                >
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                        <IconTerminal
                            size={16}
                            className="text-gray-400"
                        />
                        {group.label}
                    </h3>
                    {group.description && (
                        <p className="text-xs text-gray-400 -mt-3 mb-4">
                            {group.description}
                        </p>
                    )}
                    <div className="space-y-5">
                        {group.fields.map(renderField)}
                    </div>
                </div>
            ))}
        </div>
    );
}
