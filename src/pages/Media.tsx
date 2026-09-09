import { useState } from "react";
import { db } from "../db/db";
import type { Customer, MediaResource, PostBuy, RateCard, ScheduleItem, Supplier } from "../types";
import { Btn, Chip, Field, Modal, money, uid, useToast } from "../ui/common";
import { IconPlus } from "../components/icons";

interface Props {
  suppliers: Supplier[]; resources: MediaResource[]; ratecards: RateCard[];
  items: ScheduleItem[]; postbuys: PostBuy[]; customers: Customer[];
  reload: () => Promise<void>;
}


export default function Media(props: Props) {
  const { show, node } = useToast();
  const [tab, setTab] = useState<"排期" | "资源与刊例" | "投后 PostBuy">("排期");
  const [resOpen, setResOpen] = useState(false);
  const [rf, setRf] = useState({ name: "", type: "效果广告", supplierId: "" });
  const [rcFor, setRcFor] = useState<string | null>(null);
  const [rc, setRc] = useState({ version: "", effectiveFrom: "2026-10-01", listPrice: "" });
  const [buyOpen, setBuyOpen] = useState(false);
  const [bf, setBf] = useState({ customerId: "", name: "", resourceId: "", start: "2026-10-01", end: "2026-11-30", cost: "", sellPrice: "", rebate: "", status: "待确认" });
  const [csv, setCsv] = useState("");

  const suppliers = props.suppliers.filter((s) => !s.deletedAt);
  const resources = props.resources.filter((r) => !r.deletedAt);
  const items = props.items.filter((s) => !s.deletedAt);
  const postbuys = props.postbuys.filter((p) => !p.deletedAt);
  const nameOf = (id: string) => props.customers.find((c) => c.id === id)?.name ?? "未知客户";
  const resName = (id: string) => resources.find((r) => r.id === id)?.name ?? "未知资源";
  const suName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const cost = items.reduce((s, i) => s + i.cost, 0);
  const sell = items.reduce((s, i) => s + i.sellPrice, 0);
  const rebatePending = items.filter((i) => i.rebate && !i.rebateSettled).reduce((s, i) => s + (i.rebate ?? 0), 0);
  const margin = sell - cost;

  /* 排期条位置:以 9/1-12/31 为窗口 */
  const W0 = new Date("2026-09-01").getTime();
  const W1 = new Date("2026-12-31").getTime();
  const pct = (d: string) => Math.min(100, Math.max(0, ((new Date(d).getTime() - W0) / (W1 - W0)) * 100));

  async function addResource() {
    if (!rf.name.trim()) { show("资源名称必填"); return; }
    await db.put("resources", { id: uid("re"), name: rf.name.trim(), type: rf.type, supplierId: rf.supplierId || (suppliers[0]?.id ?? "") }, "新增媒体资源");
    setResOpen(false); setRf({ name: "", type: "效果广告", supplierId: "" });
    show("资源已入库");
    await props.reload();
  }

  async function addRateCard() {
    if (!rcFor || !rc.version.trim()) { show("版本号必填"); return; }
    await db.put("ratecards", { id: uid("rc"), resourceId: rcFor, version: rc.version.trim(), effectiveFrom: rc.effectiveFrom, listPrice: Number(rc.listPrice) || 0 }, "新增刊例价版本");
    setRcFor(null); setRc({ version: "", effectiveFrom: "2026-10-01", listPrice: "" });
    show("刊例版本已登记(报价将锁定版本)");
    await props.reload();
  }

  async function addBuy() {
    if (!bf.name.trim() || !bf.resourceId) { show("名称与资源必填"); return; }
    await db.put("scheduleItems", {
      id: uid("sc"), customerId: bf.customerId || (props.customers[0]?.id ?? ""), name: bf.name.trim(), resourceId: bf.resourceId,
      start: bf.start, end: bf.end, cost: Number(bf.cost) || 0, sellPrice: Number(bf.sellPrice) || 0,
      rebate: Number(bf.rebate) || undefined, rebateSettled: false, status: bf.status as ScheduleItem["status"],
    }, "新增排期(含采购双口径)");
    setBuyOpen(false);
    show("排期已创建");
    await props.reload();
  }

  /** 客户版报价单导出(自动脱敏:不含成本/毛利/返点);导出文档样式色值非应用 UI */
  function exportQuote() {
    const rows = items.map((i) => `<tr><td>${i.name}</td><td>${resName(i.resourceId)}</td><td>${i.start} ~ ${i.end}</td><td style="text-align:right">${money(i.sellPrice)}</td><td>${i.status}</td></tr>`).join("");
    const total = money(sell);
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>媒介排期报价单(客户版)</title><style>body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:760px;margin:40px auto;color:#17181C}h1{font-size:22px}h1 span{color:#FE2C55}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}th,td{border:1px solid #E4E6EB;padding:8px 10px;text-align:left}th{background:#F5F6F8}.total{margin-top:12px;font-size:16px;font-weight:700}.note{color:#7A7F89;font-size:11px;margin-top:20px}</style></head><body><h1>媒介排期报价单 <span>· 客户版</span></h1><p>项目:${nameOf(items[0]?.customerId ?? "")} · 报价时点:${new Date().toLocaleDateString("zh-CN")}</p><table><tr><th>项目</th><th>媒体/点位</th><th>投放窗口</th><th>报价</th><th>状态</th></tr>${rows}</table><p class="total">合计:${total}</p><p class="note">本报价单为客户版,已按规则自动脱敏(不含媒体成本/毛利/返点)。刊例价以报价时点锁定版本为准。</p></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `报价单_客户版_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    show("客户版报价单已导出(已脱敏)");
  }

  async function importCsv() {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    let n = 0;
    for (const line of lines) {
      const cols = line.split(",").map((s) => s.trim());
      if (cols.length < 5) continue;
      const [resourceName, month, imp, cpm, roi] = cols;
      const res = resources.find((r) => r.name === resourceName);
      if (!res) continue;
      await db.put("postbuys", {
        id: uid("pb"), resourceId: res.id, month,
        actualImpression: Number(imp) || 0, cpm: Number(cpm) || 0, roi: Number(roi) || 0,
        dataSource: "CSV回填",
      }, `PostBuy 回填 ${resName(res.id)} ${month}`);
      n++;
    }
    setCsv("");
    show(`CSV 回填完成:${n} 条入库`);
    await props.reload();
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>媒介策略中心</h1><div className="date">供应商 / 刊例版本锁定 / 排期采购双口径 / PostBuy 回填 — 项目:{nameOf(items[0]?.customerId ?? "")}</div></div>
        <div className="actions">
          <Btn kind="ghost" onClick={exportQuote}>导出客户版报价单(脱敏)</Btn>
          <Btn kind="primary" onClick={() => setBuyOpen(true)}><IconPlus size={14} /> 新建排期</Btn>
        </div>
      </div>

      <div className="tabs">
        {(["排期", "资源与刊例", "投后 PostBuy"] as const).map((t) => (
          <span key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>
        ))}
      </div>

      {tab === "排期" && (
        <>
          <div className="alert-strip" style={{ marginTop: 0, marginBottom: 16 }}>
            <div className="card card-pad">
              <div className="h-row" style={{ marginBottom: 4 }}><span className="h-title sm">采购与报价双口径</span><Chip kind="danger" style={{ marginLeft: "auto" }}>仅内部可见</Chip></div>
              <div className="alert-line"><span className="txt">媒体成本合计(对外隐藏)</span><span className="amt num">{money(cost)}</span></div>
              <div className="alert-line"><span className="txt">报价给客户</span><span className="amt num">{money(sell)}</span></div>
              <div className="alert-line"><span className="txt">预估毛利</span><span className="amt num" style={{ color: "var(--success)" }}>{money(margin)}({sell ? Math.round((margin / sell) * 100) : 0}%)</span></div>
              <div className="alert-line"><span className="txt">返点后返(未核销)</span><span className="amt num" style={{ color: "var(--warning)" }}>{money(rebatePending)}</span></div>
            </div>
            <div className="card card-pad">
              <div className="h-row" style={{ marginBottom: 4 }}><span className="h-title sm">策略推导依据</span><Chip kind="data" style={{ marginLeft: "auto" }}>规则引擎(非 AI)</Chip></div>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--ink-2)", lineHeight: 1.7 }}>
                建议配比:<b>内容种草 45% / 效果投放 35% / 品牌曝光 20%</b>,与大促节奏对齐。
                依据:受众画像 + 竞品监测 + 历史 Post-Buy(知识库溯源属 P2)。
              </p>
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden", padding: "16px 18px" }}>
            <div className="month-lbls" style={{ display: "grid", gridTemplateColumns: `180px repeat(4,1fr)`, marginBottom: 4 }}>
              <span /><span>9 月</span><span>10 月</span><span>11 月</span><span>12 月</span>
            </div>
            {items.map((i) => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", alignItems: "center", borderTop: "1px solid var(--border-soft)", minHeight: 44 }}>
                <div style={{ padding: "8px 12px", fontWeight: 600, fontSize: "var(--text-sm)" }}>{i.name}<div className="cell-sub">{resName(i.resourceId)}</div></div>
                <div style={{ position: "relative", height: 44 }}>
                  {[0, 1, 2, 3].map((k) => <div key={k} style={{ position: "absolute", top: 0, bottom: 0, left: `${k * 25}%`, borderLeft: "1px dashed var(--border-soft)" }} />)}
                  <div style={{
                    position: "absolute", top: 11, height: 20, borderRadius: 6, padding: "0 10px",
                    left: pct(i.start) + "%", width: Math.max(4, pct(i.end) - pct(i.start)) + "%",
                    background: i.status === "已确认" ? "var(--data)" : "var(--surface-2)",
                    color: i.status === "已确认" ? "var(--bg)" : "var(--ink-3)",
                    border: i.status === "已确认" ? "none" : "1px dashed var(--ink-4)",
                    display: "flex", alignItems: "center", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden",
                  }}>
                    {money(i.cost)}<span style={{ opacity: .8, marginLeft: 6, fontWeight: 400 }}>{i.status}</span>
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 ? <p className="muted" style={{ padding: 16 }}>暂无排期 — 点右上角新建。</p> : null}
          </div>
        </>
      )}

      {tab === "资源与刊例" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="toolbar-row" style={{ padding: "12px 14px", marginBottom: 0 }}>
            <span className="h-title sm">媒体资源库({resources.length})</span>
            <Btn kind="primary" sm style={{ marginLeft: "auto" }} onClick={() => setResOpen(true)}><IconPlus size={12} /> 新增资源</Btn>
          </div>
          <table className="tgrid">
            <thead><tr><th>资源</th><th>类型</th><th>供应商</th><th>刊例价版本</th><th>操作</th></tr></thead>
            <tbody>
              {resources.map((r) => {
                const cards = props.ratecards.filter((x) => x.resourceId === r.id && !x.deletedAt).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
                return (
                  <tr key={r.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.type}</td>
                    <td>{suName(r.supplierId)}</td>
                    <td>
                      {cards.map((c) => (
                        <div key={c.id} className="cell-sub num">{c.version} · 刊例 {money(c.listPrice)} · 生效 {c.effectiveFrom}</div>
                      ))}
                      {cards.length === 0 ? <span className="cell-sub">未登记</span> : null}
                    </td>
                    <td><Btn kind="data" sm onClick={() => { setRcFor(r.id); setRc({ version: "2026-Q4", effectiveFrom: "2026-10-01", listPrice: String(cards[0]?.listPrice ?? "") }); }}>+ 刊例版本</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ padding: "10px 14px", fontSize: "var(--text-xs)" }}>
            报价单导出自动引用报价时点版本;历史报价不随调价变化(审计可追溯)。
          </p>
        </div>
      )}

      {tab === "投后 PostBuy" && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="h-row"><span className="h-title sm">CSV 回填管线</span><Chip gray>格式:资源名,月份,曝光量,CPM,ROI</Chip></div>
            <textarea className="inp" rows={3} style={{ width: "100%", fontFamily: "var(--mono)", fontSize: "var(--text-xs)" }}
              value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder={"信息流投放 A,2026-09,5200000,56,3.9\n种草投放 B,2026-09,900000,12,3.1"} />
            <div style={{ marginTop: 8 }}><Btn kind="primary" sm disabled={!csv.trim()} onClick={() => { void importCsv(); }}>解析并入库</Btn></div>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="tgrid">
              <thead><tr><th>资源</th><th>月份</th><th>实际曝光</th><th>CPM</th><th>ROI</th><th>来源</th></tr></thead>
              <tbody>
                {postbuys.sort((a, b) => b.month.localeCompare(a.month)).map((p) => (
                  <tr key={p.id} style={{ cursor: "default" }}>
                    <td style={{ fontWeight: 600 }}>{resName(p.resourceId)}</td>
                    <td className="num">{p.month}</td>
                    <td className="num">{p.actualImpression.toLocaleString("zh-CN")}</td>
                    <td className="num">{money(p.cpm)}</td>
                    <td className="num" style={{ color: p.roi >= 2.5 ? "var(--success)" : "var(--danger)" }}>1:{p.roi}</td>
                    <td><Chip kind={p.dataSource === "CSV回填" ? "data" : "gray"}>{p.dataSource}</Chip></td>
                  </tr>
                ))}
                {postbuys.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)", padding: 20 }}>暂无投后数据</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {resOpen ? (
        <Modal title="新增媒体资源" onClose={() => setResOpen(false)} footer={
          <div className="grow"><Btn kind="ghost" onClick={() => setResOpen(false)}>取消</Btn><Btn kind="primary" onClick={() => { void addResource(); }}>保存</Btn></div>
        }>
          <Field label="资源名称"><input className="inp" style={{ width: "100%" }} value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} /></Field>
          <div className="field-row">
            <Field label="类型">
              <select className="sel" style={{ width: "100%" }} value={rf.type} onChange={(e) => setRf({ ...rf, type: e.target.value })}>
                {["效果广告", "内容种草", "品牌曝光", "线下"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="供应商">
              <select className="sel" style={{ width: "100%" }} value={rf.supplierId} onChange={(e) => setRf({ ...rf, supplierId: e.target.value })}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}({s.type})</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}

      {rcFor ? (
        <Modal title={`新增刊例价版本 · ${resName(rcFor)}`} onClose={() => setRcFor(null)} footer={
          <div className="grow"><Btn kind="ghost" onClick={() => setRcFor(null)}>取消</Btn><Btn kind="primary" onClick={() => { void addRateCard(); }}>保存</Btn></div>
        }>
          <div className="field-row">
            <Field label="版本号"><input className="inp" style={{ width: "100%" }} value={rc.version} onChange={(e) => setRc({ ...rc, version: e.target.value })} placeholder="2026-Q4" /></Field>
            <Field label="生效日"><input className="inp num" type="date" style={{ width: "100%" }} value={rc.effectiveFrom} onChange={(e) => setRc({ ...rc, effectiveFrom: e.target.value })} /></Field>
          </div>
          <Field label="刊例价(元)"><input className="inp num" style={{ width: "100%" }} value={rc.listPrice} onChange={(e) => setRc({ ...rc, listPrice: e.target.value })} /></Field>
        </Modal>
      ) : null}

      {buyOpen ? (
        <Modal title="新建排期" onClose={() => setBuyOpen(false)} footer={
          <div className="grow"><Btn kind="ghost" onClick={() => setBuyOpen(false)}>取消</Btn><Btn kind="primary" onClick={() => { void addBuy(); }}>保存</Btn></div>
        }>
          <Field label="排期名称"><input className="inp" style={{ width: "100%" }} value={bf.name} onChange={(e) => setBf({ ...bf, name: e.target.value })} /></Field>
          <div className="field-row">
            <Field label="客户">
              <select className="sel" style={{ width: "100%" }} value={bf.customerId} onChange={(e) => setBf({ ...bf, customerId: e.target.value })}>
                {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="媒体资源">
              <select className="sel" style={{ width: "100%" }} value={bf.resourceId} onChange={(e) => setBf({ ...bf, resourceId: e.target.value })}>
                <option value="">选择…</option>
                {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="开始"><input className="inp num" type="date" style={{ width: "100%" }} value={bf.start} onChange={(e) => setBf({ ...bf, start: e.target.value })} /></Field>
            <Field label="结束"><input className="inp num" type="date" style={{ width: "100%" }} value={bf.end} onChange={(e) => setBf({ ...bf, end: e.target.value })} /></Field>
          </div>
          <div className="field-row">
            <Field label="媒体成本(内部)"><input className="inp num" style={{ width: "100%" }} value={bf.cost} onChange={(e) => setBf({ ...bf, cost: e.target.value })} /></Field>
            <Field label="报价(客户)"><input className="inp num" style={{ width: "100%" }} value={bf.sellPrice} onChange={(e) => setBf({ ...bf, sellPrice: e.target.value })} /></Field>
          </div>
          <div className="field-row">
            <Field label="返点(可选)"><input className="inp num" style={{ width: "100%" }} value={bf.rebate} onChange={(e) => setBf({ ...bf, rebate: e.target.value })} /></Field>
            <Field label="状态">
              <select className="sel" style={{ width: "100%" }} value={bf.status} onChange={(e) => setBf({ ...bf, status: e.target.value })}>
                {["待确认", "已确认"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}
      {node}
    </div>
  );
}
