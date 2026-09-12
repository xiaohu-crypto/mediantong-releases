import type { ReactNode } from "react";
import { Btn } from "../common";

export interface RelatedItem {
  id: string;
  title: string;
  sub?: string;
  /** 右侧元信息(金额/状态 Chip 等) */
  meta?: ReactNode;
  onClick?: () => void;
}

interface RelatedListWidgetProps {
  title: string;
  items: RelatedItem[];
  emptyText?: string;
  onAdd?: () => void;
}

/** 关联记录列表卡片 */
export function RelatedListWidget({ title, items, emptyText = "暂无数据", onAdd }: RelatedListWidgetProps) {
  return (
    <div className="card widget-card">
      <div className="h-row" style={{ padding: "14px 16px 0", marginBottom: 4 }}>
        <span className="h-title sm">{title}</span>
        {onAdd ? (
          <Btn kind="ghost" sm style={{ marginLeft: "auto" }} onClick={onAdd}>
            + 新增
          </Btn>
        ) : null}
      </div>
      <div style={{ padding: "4px 16px 14px" }}>
        {items.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            {emptyText}
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="mini-row"
              onClick={it.onClick}
              style={it.onClick ? { cursor: "pointer" } : undefined}
            >
              <span className="ev">
                <span style={{ fontWeight: 550 }}>{it.title}</span>
                {it.sub ? <span className="cell-sub" style={{ display: "block" }}>{it.sub}</span> : null}
              </span>
              {it.meta}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
