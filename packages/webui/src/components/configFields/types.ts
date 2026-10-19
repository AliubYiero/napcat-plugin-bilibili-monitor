/**
 * 字段控件公共 props
 *
 * 每个 kind 一个控件; 控件只负责"呈现 + 提交", 不做清洗 (清洗由后端从 kind 派生)。
 */

export interface ValueFieldProps<TField, TValue> {
    field: TField;
    value: TValue;
    onChange: (value: TValue) => void;
}
