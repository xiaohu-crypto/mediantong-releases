interface KpiWidgetProps {
  title: string;
  value: string;
  sub?: string;
  trend?: { value: number; label: string };
}

export function KpiWidget({ title, value, sub, trend }: KpiWidgetProps) {
  const up = (trend?.value ?? 0) >= 0;
  return (
    <div className="card card-pad">
      <div className="muted" style={{ fontSize: "var(--text-xs)" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 750, marginTop: 4 }} className="num">{value}</div>
      {(sub || trend) ? (
        <div className="cell-sub" style={{ marginTop: 2 }}>
          {sub}
          {trend ? (
            <span className="num" style={{ color: up ? "var(--success)" : "var(--danger)", marginLeft: 4 }}>
              {up ? "▲" : "▼"} {Math.abs(trend.value)}% {trend.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
