import type { ReactNode } from "react";

interface FieldsWidgetProps {
  title?: string;
  fields: { label: string; value: ReactNode }[];
  /** 列数,默认 2 */
  columns?: 1 | 2;
  /** P4 编辑模式:展开字段可见性配置 */
  editing?: boolean;
  /** P4 可见字段 label 列表;undefined = 全部可见 */
  visibleFields?: string[];
  /** P4 勾选变化回调(传完整可见 label 数组) */
  onVisibleFieldsChange?: (visible: string[]) => void;
}

/** 字段键值对展示卡片,value 支持任意 ReactNode(健康度环/Chip 等) */
export function FieldsWidget({ title, fields, columns = 2, editing, visibleFields, onVisibleFieldsChange }: FieldsWidgetProps) {
  /* 非编辑模式:按 visibleFields 过滤(undefined 表示全显);编辑模式下仍实时预览当前勾选结果 */
  const visibleSet = visibleFields ? new Set(visibleFields) : null;
  const shown = visibleSet ? fields.filter((f) => visibleSet.has(f.label)) : fields;

  function toggleField(label: string, checked: boolean) {
    if (!onVisibleFieldsChange) return;
    /* 以当前 fields 全集为基准:checked 加入,unchecked 移除 */
    const base = new Set(fields.map((f) => f.label));
    const current = new Set(
      (visibleFields ?? []).filter((l) => base.has(l)),
    );
    if (checked) current.add(label);
    else current.delete(label);
    onVisibleFieldsChange(Array.from(current));
  }

  return (
    <div className="card widget-card">
      {title ? (
        <div className="h-row" style={{ padding: "14px 16px 0", marginBottom: 4 }}>
          <span className="h-title sm">{title}</span>
        </div>
      ) : null}
      <div
        className="kv-grid"
        style={{
          gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
          padding: title ? "8px 16px 14px" : "14px 16px",
          gap: "10px 16px",
        }}
      >
        {shown.map((f, i) => (
          <div className="kv" key={i}>
            <span className="k">{f.label}</span>
            <span className="v">{f.value}</span>
          </div>
        ))}
        {shown.length === 0 ? (
          <div className="kv" style={{ gridColumn: "1 / -1" }}>
            <span className="v" style={{ color: "var(--ink-3)", fontSize: "var(--text-xs)" }}>暂无显示字段(在下方勾选要显示的字段)</span>
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="field-visibility">
          <div className="h-title sm" style={{ marginBottom: 6, fontSize: "var(--text-xs)", color: "var(--ink-3)" }}>字段显示</div>
          {fields.map((f) => {
            const checked = visibleSet ? visibleSet.has(f.label) : true;
            return (
              <label key={f.label}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleField(f.label, e.target.checked)}
                />
                {f.label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
