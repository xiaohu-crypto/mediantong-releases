import type { ReactNode } from "react";

interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: Record<string, unknown>) => ReactNode;
}

interface TableWidgetProps {
  title: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  emptyText?: string;
  maxRows?: number;
}

export function TableWidget({ title, columns, rows, emptyText = "暂无数据", maxRows = 5 }: TableWidgetProps) {
  const shown = rows.slice(0, maxRows);
  const overflow = rows.length > maxRows;

  return (
    <div className="card card-pad">
      <div className="h-row"><span className="h-title sm">{title}</span></div>
      {shown.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)", padding: "8px 0" }}>{emptyText}</p>
      ) : (
        <>
          <table className="tgrid">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align === "right" ? "right" : "left" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align === "right" ? "right" : "left" }}>
                      {c.render ? c.render(row) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {overflow ? (
            <div className="cell-sub" style={{ marginTop: 8, textAlign: "center" }}>
              共 {rows.length} 条 · 显示前 {maxRows} 条
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
