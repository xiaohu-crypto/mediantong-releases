interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartWidgetProps {
  title: string;
  data: LineChartPoint[];
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}

export function LineChartWidget({
  title,
  data,
  height = 160,
  color = "var(--chart-1)",
  valueFormatter,
}: LineChartWidgetProps) {
  const fmt = valueFormatter ?? ((v: number) => String(v));

  if (data.length === 0) {
    return (
      <div className="card card-pad">
        <div className="h-row"><span className="h-title sm">{title}</span></div>
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>暂无数据</p>
      </div>
    );
  }

  const W = 400;
  const padL = 36;
  const padR = 12;
  const padT = 28;
  const padB = 24;
  const chartW = W - padL - padR;
  const chartH = height - padT - padB;

  const maxV = Math.max(...data.map((d) => d.value), 1);
  const minV = Math.min(...data.map((d) => d.value), 0);
  const range = maxV - minV || 1;

  const points = data.map((d, i) => {
    const x = padL + (i / (data.length - 1 || 1)) * chartW;
    const y = padT + chartH - ((d.value - minV) / range) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)} L${points[0].x.toFixed(1)},${(padT + chartH).toFixed(1)} Z`;
  const gid = `lg-${title.replace(/\s+/g, "-")}`;

  return (
    <div className="card card-pad">
      <div className="h-row"><span className="h-title sm">{title}</span></div>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height: "auto" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill={color} />
            {i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)" className="num">
                {fmt(p.value)}
              </text>
            ) : null}
            <text x={p.x} y={height - padB + 14} textAnchor="middle" fontSize="10" fill="var(--ink-4)">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
