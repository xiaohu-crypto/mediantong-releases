import { useState } from "react";
import { db } from "../db/db";
import { weightedValue } from "../core/metrics";
import type { Baseline, Contract, Deal, Payment, ScheduleItem, PostBuy } from "../types";
import { Btn, Chip, Field, money, uid, useToast } from "../ui/common";

interface Props {
  contracts: Contract[]; payments: Payment[]; deals: Deal[]; items: ScheduleItem[]; baselines: Baseline[];
  postbuys?: import("../types").PostBuy[]; resources?: import("../types").MediaResource[];
  reload: () => Promise<void>;
}

type Metric = "签约额" | "回款" | "毛利";

export default function Data(props: Props) {
  const { show, node } = useToast();
  const [metric, setMetric] = useState<Metric>("签约额");
  const [bl, setBl] = useState({ dimension: "", metric: "", value: "" });

  const contracts = props.contracts.filter((c) => !c.deletedAt);
  const payments = props.payments.filter((p) => !p.deletedAt);
  const items = props.items.filter((i) => !i.deletedAt);
  const baselines = props.baselines.filter((b) => !b.deletedAt);

  const mediaCost = items.reduce((s, i) => s + i.cost, 0);
  const kpiSign = contracts.reduce((s, c) => s + c.amount, 0);
  const kpiPaid = payments.filter((p) => p.status === "已收").reduce((s, p) => s + p.amount, 0);
  const dueNow = payments.filter((p) => new Date(p.dueDate).getTime() <= Date.now());
  const paidOfDue = dueNow.filter((p) => p.status === "已收").reduce((s, p) => s + p.amount, 0);
  const dueTotal = dueNow.reduce((s, p) => s + p.amount, 0);
  const collectRate = dueTotal ? Math.round((paidOfDue / dueTotal) * 100) : 100;
  const marginRate = kpiSign ? Math.round(((kpiSign - mediaCost) / kpiSign) * 100) : 0;
  const activeDeals = props.deals.filter((d) => !d.deletedAt && !["输单", "流失", "签约"].includes(d.stage));
  const weighted = activeDeals.reduce((s, d) => s + weightedValue(d), 0);

  /* 近 6 个月趋势(按口径) */
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthVal = (m: string): number => {
    if (metric === "签约额") return contracts.filter((c) => c.signDate.startsWith(m)).reduce((s, c) => s + c.amount, 0);
    if (metric === "回款") return payments.filter((p) => p.paidDate?.startsWith(m)).reduce((s, p) => s + p.amount, 0);
    /* 毛利口径:月度毛利 = 本月签约额 − 本月分摊媒体成本;媒体成本按全部合同数均摊,每月合同减同一分摊值(与需求文档 2.3 一致) */
    const total = contracts.length || 1;
    return contracts.filter((c) => c.signDate.startsWith(m)).reduce((s, c) => s + (c.amount - mediaCost / total), 0);
  };
  const vals = months.map(monthVal);
  const maxV = Math.max(...vals, 1);

  const thisMonth = months[5];
  function momArrow(cur: number, prev: number) {
    if (!prev) return " · 环比—";
    const pct = Math.round(((cur - prev) / prev) * 100);
    const up = pct >= 0;
    return ' · <span style="color:' + (up ? "var(--success)" : "var(--danger)") + '">' + (up ? "▲" : "▼") + " " + Math.abs(pct) + "%</span>";
  }
  const monthContracts = contracts.filter((c) => c.signDate.startsWith(thisMonth));

  async function addBaseline() {
    if (!bl.dimension || !bl.metric || !bl.value) { show("三项均必填"); return; }
    await db.put("baselines", { id: uid("bl"), dimension: bl.dimension, metric: bl.metric, value: bl.value, source: "手动维护" }, "新增基准值");
    setBl({ dimension: "", metric: "", value: "" });
    show("基准值已保存");
    await props.reload();
  }

  /* 导出物(HTML 成绩单)使用独立浅色打印样式,色值属导出文档而非应用 UI */
  function exportReport() {
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>月度成绩单 ${thisMonth}</title><style>body{font-family:'PingFang SC',sans-serif;max-width:680px;margin:48px auto;color:#17181C;background:#F5F6F8;padding:32px;border-radius:16px}.card{background:#fff;border:1px solid #E4E6EB;border-radius:14px;padding:28px}.k{color:#7A7F89;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.v{font-size:30px;font-weight:800;margin:4px 0 18px}.v b{color:#FE2C55}h1{font-size:22px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}td{padding:8px 6px;border-bottom:1px solid #EEF0F3}</style></head><body><div class="card"><h1>月度成绩单 · ${thisMonth}</h1><p class="k">媒体广告个人工作台 · 自动生成</p><div class="v"><b class="num">${money(monthContracts.reduce((s, c) => s + c.amount, 0))}</b></div><table>
      <tr><td>本月新签合同</td><td class="num">${monthContracts.length} 份</td></tr>
      <tr><td>累计签约额(口径:${metric})</td><td class="num">${money(metric === "回款" ? kpiPaid : metric === "毛利" ? kpiSign - mediaCost : kpiSign)}</td></tr>
      <tr><td>回款率(到期口径)</td><td class="num">${collectRate}%</td></tr>
      <tr><td>综合毛利率</td><td class="num">${marginRate}%</td></tr>
      <tr><td>在途加权商机</td><td class="num">${money(weighted)}</td></tr>
      <tr><td>本月完成任务</td><td class="num">见工作管理看板</td></tr>
    </table><p style="color:#7A7F89;font-size:11px;margin-top:16px">品牌高光面排版 · 数据口径见需求文档 2.3 · 本地生成不上传</p></div></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `月度成绩单_${thisMonth}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    show("月度成绩单已导出");
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>数据分析报表</h1><div className="date">口径可切换(签约额/回款/毛利)· 基准值表让数据可解读 · 演示口径:合同签约额</div></div>
        <div className="actions">
          <select className="sel" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {["签约额", "回款", "毛利"].map((m) => <option key={m}>{m}</option>)}
          </select>
          <Btn kind="primary" onClick={exportReport}>生成月度成绩单</Btn>
        </div>
      </div>

      <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <div className="kpi card-pad card"><div className="muted" style={{ fontSize: "var(--text-xs)" }}>累计签约额</div><div style={{ fontSize: 22, fontWeight: 750 }} className="num">{money(kpiSign)}</div><div className="cell-sub">合同口径<span dangerouslySetInnerHTML={{ __html: momArrow(vals[5], vals[4]) }} /></div></div>
        <div className="kpi card-pad card"><div className="muted" style={{ fontSize: "var(--text-xs)" }}>已收回款</div><div style={{ fontSize: 22, fontWeight: 750 }} className="num">{money(kpiPaid)}</div><div className="cell-sub">回款率(到期口径)<span className="num"> {collectRate}%</span></div></div>
        <div className="kpi card-pad card"><div className="muted" style={{ fontSize: "var(--text-xs)" }}>综合毛利率</div><div style={{ fontSize: 22, fontWeight: 750 }} className="num">{marginRate}%</div><div className="cell-sub">合同 − 媒体成本(扣返点前)</div></div>
        <div className="kpi card-pad card"><div className="muted" style={{ fontSize: "var(--text-xs)" }}>在途加权商机</div><div style={{ fontSize: 22, fontWeight: 750 }} className="num">{money(weighted)}</div><div className="cell-sub">{activeDeals.length} 个商机</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="h-row"><span className="h-title sm">{metric}趋势(近 6 个月)</span><Chip kind="data" style={{ marginLeft: "auto" }}>青=数据系列</Chip></div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160, padding: "12px 4px 0" }}>
          {months.map((m, i) => (
            <div key={m} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-3)", marginBottom: 4 }} className="num">{vals[i] ? money(vals[i]).replace("¥", "") : "—"}</div>
              <div style={{ height: Math.max(4, (vals[i] / maxV) * 110), background: i === 5 ? "var(--brand)" : "var(--chart-1)", borderRadius: "6px 6px 0 0", opacity: i === 5 ? 1 : .85 }} />
              <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-4)", marginTop: 6 }}>{m.slice(5)}月</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="h-row"><span className="h-title sm">商机漏斗</span><Chip kind="data" style={{ marginLeft: "auto" }}>各阶段数量</Chip></div>
        {(() => {
          const stages = ["线索", "MQL", "SQL", "商机", "报价", "谈判", "签约"];
          const counts = stages.map((st) => props.deals.filter((d) => !d.deletedAt && d.stage === st).length);
          const maxC = Math.max(...counts, 1);
          const lost = props.deals.filter((d) => !d.deletedAt && (d.stage === "输单" || d.stage === "流失")).length;
          return (
            <div style={{ padding: "12px 0" }}>
              {stages.map((st, i) => (
                <div key={st} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 40, fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>{st}</div>
                  <div style={{ flex: 1, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: (counts[i] / maxC) * 100 + "%", background: i === stages.length - 1 ? "var(--success)" : "var(--chart-1)", height: 22, display: "flex", alignItems: "center", paddingLeft: 6, fontSize: 11, color: "#fff", fontWeight: 600 }}>
                      {counts[i]}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
                <div style={{ width: 40, textAlign: "right" }}>输单</div>
                <div style={{ flex: 1, color: "var(--danger)" }}>{lost} 个</div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="h-row"><span className="h-title sm">投放ROI看板</span><Chip kind="data" style={{ marginLeft: "auto" }}>PostBuy 口径</Chip></div>
        {(() => {
          const pbs = (props.postbuys ?? []).filter((p) => !p.deletedAt);
          if (pbs.length === 0) return <p className="muted" style={{ padding: 12 }}>暂无投后数据,去媒介页录入PostBuy</p>;
          const resName = (id: string) => (props.resources ?? []).find((r) => r.id === id)?.name ?? id;
          return (
            <table className="tgrid">
              <thead><tr><th>媒体资源</th><th>月份</th><th>曝光</th><th>CPM</th><th>ROI</th><th>CTR</th></tr></thead>
              <tbody>
                {pbs.slice(-10).reverse().map((pb: PostBuy) => (
                  <tr key={pb.id}>
                    <td style={{ fontWeight: 600 }}>{resName(pb.resourceId)}</td>
                    <td>{pb.month}</td>
                    <td className="num">{pb.actualImpression.toLocaleString()}</td>
                    <td className="num">¥{pb.cpm}</td>
                    <td className="num" style={{ color: pb.roi >= 1 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>{pb.roi}x</td>
                    <td className="num">{pb.ctr ? pb.ctr + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>

      <div className="card card-pad">
        <div className="h-row"><span className="h-title sm">行业基准值表</span><button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => window.print()}>导出PDF</button><Chip gray style={{ marginLeft: "auto" }}>可维护 · 图表解读依据</Chip></div>
        <table className="tgrid">
          <thead><tr><th>行业/维度</th><th>指标</th><th>基准值</th><th>来源</th></tr></thead>
          <tbody>
            {baselines.map((b) => (
              <tr key={b.id} style={{ cursor: "default" }}>
                <td style={{ fontWeight: 600 }}>{b.dimension}</td><td>{b.metric}</td>
                <td className="num" style={{ fontWeight: 650 }}>{b.value}</td><td className="cell-sub">{b.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="field-row" style={{ marginTop: 10 }}>
          <Field label="行业/维度"><input className="inp" style={{ width: "100%" }} value={bl.dimension} onChange={(e) => setBl({ ...bl, dimension: e.target.value })} /></Field>
          <Field label="指标"><input className="inp" style={{ width: "100%" }} value={bl.metric} onChange={(e) => setBl({ ...bl, metric: e.target.value })} /></Field>
        </div>
        <Field label="基准值(如 ¥45-70 / ≥1:2.5)"><input className="inp num" style={{ width: "100%" }} value={bl.value} onChange={(e) => setBl({ ...bl, value: e.target.value })} /></Field>
        <Btn kind="data" onClick={() => { void addBaseline(); }}>保存基准值</Btn>
      </div>
      {node}
    </div>
  );
}
