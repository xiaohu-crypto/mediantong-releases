export interface TimelineEntry {
  id: string;
  ts: number;
  /** 接触/任务/商机/回款 */
  kind: string;
  title: string;
}

interface TimelineWidgetProps {
  title?: string;
  entries: TimelineEntry[];
  emptyText?: string;
}

const KIND_COLOR: Record<string, string> = {
  接触: "var(--success)",
  任务: "var(--warning)",
  商机: "var(--brand)",
  回款: "var(--data)",
};

/** 合并时间线卡片,按时间降序 */
export function TimelineWidget({ title, entries, emptyText = "暂无动态" }: TimelineWidgetProps) {
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  return (
    <div className="card widget-card">
      {title ? (
        <div className="h-row" style={{ padding: "14px 16px 0", marginBottom: 4 }}>
          <span className="h-title sm">{title}</span>
        </div>
      ) : null}
      <div style={{ paddingBottom: 10 }}>
        {sorted.length === 0 ? (
          <p className="muted" style={{ padding: "0 18px", fontSize: "var(--text-sm)", margin: 0 }}>
            {emptyText}
          </p>
        ) : (
          sorted.map((it) => (
            <div className="tl-item" key={it.id}>
              <span className="tl-dot" style={{ background: KIND_COLOR[it.kind] ?? "var(--ink-4)" }} />
              <div>
                <div className="tl-title">
                  <span className="chip gray" style={{ fontSize: 10, padding: "0 6px", marginRight: 6 }}>
                    {it.kind}
                  </span>
                  {it.title}
                </div>
                <div className="tl-time">{new Date(it.ts).toLocaleString("zh-CN")}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
