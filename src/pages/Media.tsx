import { useMemo, useState } from "react";
import { db } from "../db/db";
import type { Customer, MediaResource, PostBuy, PricePoint, RateCard, ScheduleItem, Supplier } from "../types";
import { Btn, Chip, Field, Modal, money, uid, useToast } from "../ui/common";
import { IconPlus } from "../components/icons";

interface Props {
  suppliers: Supplier[]; resources: MediaResource[]; ratecards: RateCard[];
  items: ScheduleItem[]; postbuys: PostBuy[]; customers: Customer[];
  reload: () => Promise<void>;
}

const emptyRf = { name: "", type: "效果广告", supplierId: "", intro: "", advantage: "", cases: "" };

export default function Media(props: Props) {
  const { show, node } = useToast();
  const [tab, setTab] = useState<"排期" | "资源与刊例" | "报价器" | "投后 PostBuy">("排期");
  const [resOpen, setResOpen] = useState(false);
  const [editResId, setEditResId] = useState<string | null>(null);
  const [rf, setRf] = useState(emptyRf);
  const [rcFor, setRcFor] = useState<string | null>(null);
  const [rc, setRc] = useState({ version: "", effectiveFrom: "2026-10-01", listPrice: "" });
  const [buyOpen, setBuyOpen] = useState(false);
  const [bf, setBf] = useState({ customerId: "", name: "", resourceId: "", start: "2026-10-01", end: "2026-11-30", cost: "", sellPrice: "", rebate: "", status: "待确认" });
  const [csv, setCsv] = useState("");
  const [pointModal, setPointModal] = useState<{ resourceId: string; point?: PricePoint; idx: number } | null>(null);
  const [pf, setPf] = useState<PricePoint>({ name: "", city: "", form: "", size: "", qty: 1, footfall: 0, price: 0, status: "可售" });

  /* 报价器状态 */
  const [qCustomer, setQCustomer] = useState("");
  const [qPicks, setQPicks] = useState<{ resourceId: string; pointIdx: number; months: number }[]>([]);

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

  function openNewResource() { setEditResId(null); setRf(emptyRf); setResOpen(true); }
  function openEditResource(r: MediaResource) {
    setEditResId(r.id);
    setRf({ name: r.name, type: r.type, supplierId: r.supplierId, intro: r.intro ?? "", advantage: r.advantage ?? "", cases: r.cases ?? "" });
    setResOpen(true);
  }

  async function saveResource() {
    if (!rf.name.trim()) { show("资源名称必填"); return; }
    const base = { name: rf.name.trim(), type: rf.type, supplierId: rf.supplierId || (suppliers[0]?.id ?? ""), intro: rf.intro.trim(), advantage: rf.advantage.trim(), cases: rf.cases.trim() };
    if (editResId) {
      const old = resources.find((r) => r.id === editResId);
      await db.put("resources", { ...(old as MediaResource), ...base }, "编辑资源「" + base.name + "」");
    } else {
      await db.put("resources", { id: uid("re"), ...base, places: [] }, "新增媒体资源");
    }
    setResOpen(false); setRf(emptyRf); setEditResId(null);
    show("资源已保存");
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

  /* === 点位管理 === */
  function openPoint(r: MediaResource, idx: number) {
    const list = r.places ?? [];
    const p = list[idx];
    setPointModal({ resourceId: r.id, point: p, idx });
    setPf(p ?? { name: "", city: "", form: "", size: "", qty: 1, footfall: 0, price: 0, status: "可售" });
  }
  async function savePoint() {
    if (!pointModal) return;
    if (!pf.name.trim()) { show("点位名称必填"); return; }
    const r = resources.find((x) => x.id === pointModal.resourceId);
    if (!r) return;
    const list = [...(r.places ?? [])];
    const np: PricePoint = { ...pf, name: pf.name.trim(), qty: Math.max(1, Number(pf.qty) || 1), footfall: Number(pf.footfall) || 0, price: Number(pf.price) || 0 };
    if (pointModal.point) list[pointModal.idx] = np; else list.push(np);
    await db.put("resources", { ...r, places: list }, "保存点位「" + np.name + "」");
    setPointModal(null);
    show("点位已保存");
    await props.reload();
  }
  async function delPoint(idx: number) {
    if (!pointModal) return;
    const r = resources.find((x) => x.id === pointModal.resourceId);
    if (!r) return;
    const list = [...(r.places ?? [])];
    list.splice(idx, 1);
    await db.put("resources", { ...r, places: list }, "删除点位");
    setPointModal(null);
    await props.reload();
  }

  /* === 自助报价器 === */
  function addQuoteLine() { setQPicks([...qPicks, { resourceId: resources[0]?.id ?? "", pointIdx: -1, months: 1 }]); }
  function updLine(i: number, patch: Partial<typeof qPicks[number]>) {
    const arr = [...qPicks]; arr[i] = { ...arr[i], ...patch }; setQPicks(arr);
  }
  const quoteRows = useMemo(() => qPicks.map((p) => {
    const r = resources.find((x) => x.id === p.resourceId);
    const pt = r?.places?.[p.pointIdx];
    const unitPrice = pt?.price ?? 0;
    const months = Math.max(1, p.months || 1);
    return { resource: r?.name ?? "—", point: pt?.name ?? "—", city: pt?.city ?? "—", months, unitPrice, total: unitPrice * months * (pt?.qty ?? 1) };
  }), [qPicks, resources]);
  const quoteTotal = quoteRows.reduce((s, r) => s + r.total, 0);

  function exportQuoteHtml() {
    const rows = quoteRows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.resource}</td><td>${r.point}(${r.city})</td><td>${r.months}个月</td><td style="text-align:right">${money(r.unitPrice)}/月</td><td style="text-align:right">${money(r.total)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>自助报价单</title><style>body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:760px;margin:40px auto;color:#17181C}h1{font-size:22px}h1 span{color:#FE2C55}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}th,td{border:1px solid #E4E6EB;padding:8px 10px;text-align:left}th{background:#F5F6F8}.total{margin-top:12px;font-size:16px;font-weight:700}.note{color:#7A7F89;font-size:11px;margin-top:20px}</style></head><body><h1>自助报价单 <span>· ${nameOf(qCustomer)}</span></h1><p>报价时点:${new Date().toLocaleDateString("zh-CN")}</p><table><tr><th>#</th><th>媒体资源</th><th>点位</th><th>时长</th><th>单价</th><th>小计</th></tr>${rows}</table><p class="total">合计:${money(quoteTotal)}</p><p class="note">本报价由点位价 × 时长自动计算;实际成交价以签约为准。</p></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `自助报价单_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    show("报价单已导出");
  }

  function exportScheduleQuote() {
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

  /* Excel 媒介库模板导出/导入(CSV 格式,UTF-8 BOM,Excel 直接打开) */
  function exportMediaCsv() {
    const esc = (s: string) => "\"" + (s ?? "").replace(/"/g, "\"\"") + "\"";
    const head = "资源名称,类型,供应商,简介,优势,历史案例,点位名称,城市,形式,规格,数量,月人流,点位月价,点位状态";
    const lines = [head];
    for (const r of resources) {
      const pts = r.places ?? [];
      if (pts.length === 0) {
        lines.push([r.name, r.type, suName(r.supplierId), r.intro ?? "", r.advantage ?? "", r.cases ?? "", "", "", "", "", "", "", "", ""].map(esc).join(","));
      } else {
        for (const p of pts) {
          lines.push([r.name, r.type, suName(r.supplierId), r.intro ?? "", r.advantage ?? "", r.cases ?? "", p.name, p.city, p.form, p.size, String(p.qty), String(p.footfall), String(p.price), p.status].map(esc).join(","));
        }
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `媒介库模板_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    show("媒介库 CSV 已导出(可用 Excel 编辑)");
  }

  async function importMediaCsv(text: string) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { show("CSV 无有效数据行"); return; }
    let resN = 0, ptN = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/("([^"]|"")*"|[^,]*)/g)?.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
      if (cols.length < 6) continue;
      const [name, type, suName_, intro, advantage, cases, pName, city, form, size, qty, footfall, price, pStatus] = cols;
      if (!name) continue;
      let r = resources.find((x) => x.name === name);
      const sup = suppliers.find((s) => s.name === suName_);
      const base = { name, type: type || "效果广告", supplierId: sup?.id ?? suppliers[0]?.id ?? "", intro, advantage, cases };
      if (!r) {
        r = { id: uid("re"), ...base, places: [] };
        await db.put("resources", r, "CSV导入资源「" + name + "」");
        resN++;
      } else {
        await db.put("resources", { ...r, ...base, places: r.places ?? [] }, "CSV更新资源「" + name + "」");
      }
      if (pName) {
        const places = [...(r.places ?? [])];
        const existing = places.findIndex((p) => p.name === pName);
        const np: PricePoint = { name: pName, city, form, size, qty: Number(qty) || 1, footfall: Number(footfall) || 0, price: Number(price) || 0, status: (pStatus as PricePoint["status"]) || "可售" };
        if (existing >= 0) places[existing] = np; else places.push(np);
        await db.put("resources", { ...r, places }, "CSV导入点位");
        ptN++;
      }
    }
    show(`导入完成:资源 ${resN} 条新增,点位 ${ptN} 条`);
    await props.reload();
  }

  function onMediaCsvFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { void importMediaCsv(String(fr.result ?? "")); };
    fr.readAsText(f, "utf-8");
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>媒介策略中心</h1><div className="date">供应商 / 刊例版本锁定 / 点位档案 / 自助报价 / PostBuy 回填</div></div>
        <div className="actions">
          <Btn kind="ghost" onClick={exportScheduleQuote}>导出排期报价单(脱敏)</Btn>
          <Btn kind="primary" onClick={() => setBuyOpen(true)}><IconPlus size={14} /> 新建排期</Btn>
        </div>
      </div>

      <div className="tabs">
        {(["排期", "资源与刊例", "报价器", "投后 PostBuy"] as const).map((t) => (
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
                依据:受众画像 + 竞品监测 + 历史 Post-Buy。
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
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Btn kind="ghost" sm onClick={exportMediaCsv}>导出CSV模板</Btn>
              <label className="btn ghost sm" style={{ margin: 0 }}>
                导入CSV
                <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => onMediaCsvFile(e)} />
              </label>
              <Btn kind="primary" sm onClick={openNewResource}><IconPlus size={12} /> 新增资源</Btn>
            </div>
          </div>
          <table className="tgrid">
            <thead><tr><th>资源</th><th>类型</th><th>供应商</th><th>档案</th><th>点位</th><th>刊例价</th><th>操作</th></tr></thead>
            <tbody>
              {resources.map((r) => {
                const cards = props.ratecards.filter((x) => x.resourceId === r.id && !x.deletedAt).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
                const pts = r.places ?? [];
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}
                      <div className="cell-sub">{r.type}</div>
                    </td>
                    <td>{r.type}</td>
                    <td>{suName(r.supplierId)}</td>
                    <td style={{ maxWidth: 220 }}>
                      {r.intro ? <div className="cell-sub" style={{ color: "var(--ink-2)" }}>{r.intro}</div> : null}
                      {r.advantage ? <div className="cell-sub" style={{ color: "var(--success)" }}>优势:{r.advantage}</div> : null}
                      {r.cases ? <div className="cell-sub" style={{ color: "var(--ink-3)" }}>案例:{r.cases}</div> : null}
                      {!r.intro && !r.advantage && !r.cases ? <span className="cell-sub">未填写</span> : null}
                    </td>
                    <td>
                      {pts.length === 0 ? <span className="cell-sub">0 点位</span> : (
                        <div>{pts.map((p, i) => (
                          <div key={i} className="cell-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={"chip " + (p.status === "可售" ? "data" : p.status === "占用" ? "warn" : "gray")} style={{ fontSize: 10, padding: "0 5px" }}>{p.status}</span>
                            {p.name}({p.city}) {money(p.price)}/月
                            <a href="#" style={{ marginLeft: 4, color: "var(--brand)" }} onClick={(e) => { e.preventDefault(); openPoint(r, i); }}>改</a>
                          </div>
                        ))}
                          <a href="#" style={{ fontSize: 11, color: "var(--brand)" }} onClick={(e) => { e.preventDefault(); openPoint(r, -1); }}>+ 点位</a>
                        </div>
                      )}
                    </td>
                    <td>
                      {cards.map((c) => (
                        <div key={c.id} className="cell-sub num">{c.version} · 刊例 {money(c.listPrice)}</div>
                      ))}
                      {cards.length === 0 ? <span className="cell-sub">未登记</span> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Btn kind="data" sm onClick={() => openEditResource(r)}>编辑</Btn>
                      <Btn kind="ghost" sm onClick={() => { setRcFor(r.id); setRc({ version: "2026-Q4", effectiveFrom: "2026-10-01", listPrice: String(cards[0]?.listPrice ?? "") }); }}>刊例</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ padding: "10px 14px", fontSize: "var(--text-xs)" }}>
            点位档案含城市/形式/规格/数量/人流/月价/状态;CSV 模板可批量维护后导入。
          </p>
        </div>
      )}

      {tab === "报价器" && (
        <div className="card card-pad">
          <div className="h-row" style={{ marginBottom: 12 }}>
            <span className="h-title sm">自助报价器 · 选点位 × 时长自动算价</span>
            <Btn kind="primary" sm style={{ marginLeft: "auto" }} onClick={addQuoteLine}><IconPlus size={12} /> 添加一行</Btn>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Field label="客户(用于导出抬头)">
              <select className="sel" style={{ maxWidth: 280 }} value={qCustomer} onChange={(e) => setQCustomer(e.target.value)}>
                <option value="">不指定</option>
                {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <table className="tgrid">
            <thead><tr><th>媒体资源</th><th>点位</th><th>投放月数</th><th>点位单价/月</th><th>小计</th><th></th></tr></thead>
            <tbody>
              {quoteRows.map((r, i) => {
                const res = resources.find((x) => x.id === qPicks[i].resourceId);
                return (
                  <tr key={i}>
                    <td>
                      <select className="sel" style={{ width: 200 }} value={qPicks[i].resourceId} onChange={(e) => {
                        const rid = e.target.value;
                        const pts = resources.find((x) => x.id === rid)?.places ?? [];
                        updLine(i, { resourceId: rid, pointIdx: pts.length ? 0 : -1 });
                      }}>
                        {resources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="sel" style={{ width: 200 }} value={qPicks[i].pointIdx} onChange={(e) => updLine(i, { pointIdx: Number(e.target.value) })}>
                        <option value={-1}>选择点位…</option>
                        {(res?.places ?? []).map((p, pi) => <option key={pi} value={pi}>{p.name}({p.city}) · {money(p.price)}/月</option>)}
                      </select>
                    </td>
                    <td><input className="inp num" type="number" min={1} style={{ width: 80 }} value={qPicks[i].months} onChange={(e) => updLine(i, { months: Number(e.target.value) })} /></td>
                    <td className="num">{money(r.unitPrice)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(r.total)}</td>
                    <td><Btn kind="ghost" sm onClick={() => setQPicks(qPicks.filter((_, j) => j !== i))}>删</Btn></td>
                  </tr>
                );
              })}
              {qPicks.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)", padding: 20 }}>点击"添加一行"开始配置报价</td></tr> : null}
            </tbody>
          </table>
          {qPicks.length > 0 ? (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>合计:{money(quoteTotal)}</span>
              <Btn kind="primary" onClick={exportQuoteHtml}>导出报价单 HTML</Btn>
            </div>
          ) : null}
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
                  <tr key={p.id}>
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
        <Modal title={editResId ? "编辑媒体资源" : "新增媒体资源"} onClose={() => setResOpen(false)} footer={
          <div className="grow"><Btn kind="ghost" onClick={() => setResOpen(false)}>取消</Btn><Btn kind="primary" onClick={() => { void saveResource(); }}>保存</Btn></div>
        }>
          <Field label="资源名称"><input className="inp" style={{ width: "100%" }} value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} /></Field>
          <div className="field-row">
            <Field label="类型">
              <select className="sel" style={{ width: "100%" }} value={rf.type} onChange={(e) => setRf({ ...rf, type: e.target.value })}>
                {["效果广告", "内容种草", "品牌曝光", "线下", "达人"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="供应商">
              <select className="sel" style={{ width: "100%" }} value={rf.supplierId} onChange={(e) => setRf({ ...rf, supplierId: e.target.value })}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}({s.type})</option>)}
              </select>
            </Field>
          </div>
          <Field label="媒体介绍(资源档案)">
            <textarea className="inp" rows={2} style={{ width: "100%" }} value={rf.intro} onChange={(e) => setRf({ ...rf, intro: e.target.value })} placeholder="如:抖音信息流,覆盖 18-35 岁女性,日均曝光 5000 万" />
          </Field>
          <Field label="核心优势">
            <input className="inp" style={{ width: "100%" }} value={rf.advantage} onChange={(e) => setRf({ ...rf, advantage: e.target.value })} placeholder="如:定向精准、起量快" />
          </Field>
          <Field label="历史合作品牌/案例">
            <input className="inp" style={{ width: "100%" }} value={rf.cases} onChange={(e) => setRf({ ...rf, cases: e.target.value })} placeholder="如:完美日记、花西子、珀莱雅" />
          </Field>
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

      {pointModal ? (
        <Modal title={pointModal.point ? "编辑点位" : "新增点位"} onClose={() => setPointModal(null)} footer={
          <div className="grow" style={{ display: "flex", gap: 8 }}>
            {pointModal.point ? <Btn kind="danger" onClick={() => { void delPoint(pointModal.idx); }}>删除</Btn> : <span />}
            <Btn kind="ghost" onClick={() => setPointModal(null)}>取消</Btn>
            <Btn kind="primary" onClick={() => { void savePoint(); }}>保存</Btn>
          </div>
        }>
          <Field label="点位名称"><input className="inp" style={{ width: "100%" }} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="如:北京国贸 LED 大屏 A面" /></Field>
          <div className="field-row">
            <Field label="城市"><input className="inp" style={{ width: "100%" }} value={pf.city} onChange={(e) => setPf({ ...pf, city: e.target.value })} /></Field>
            <Field label="形式"><input className="inp" style={{ width: "100%" }} value={pf.form} onChange={(e) => setPf({ ...pf, form: e.target.value })} placeholder="LED/框架/信息流/达人短视频" /></Field>
          </div>
          <div className="field-row">
            <Field label="规格"><input className="inp" style={{ width: "100%" }} value={pf.size} onChange={(e) => setPf({ ...pf, size: e.target.value })} placeholder="如:12m×8m / 竖版9:16" /></Field>
            <Field label="数量"><input className="inp num" type="number" min={1} style={{ width: "100%" }} value={pf.qty} onChange={(e) => setPf({ ...pf, qty: Number(e.target.value) })} /></Field>
          </div>
          <div className="field-row">
            <Field label="月人流/曝光"><input className="inp num" style={{ width: "100%" }} value={pf.footfall} onChange={(e) => setPf({ ...pf, footfall: Number(e.target.value) })} /></Field>
            <Field label="月单价(元)"><input className="inp num" style={{ width: "100%" }} value={pf.price} onChange={(e) => setPf({ ...pf, price: Number(e.target.value) })} /></Field>
          </div>
          <Field label="状态">
            <select className="sel" style={{ width: "100%" }} value={pf.status} onChange={(e) => setPf({ ...pf, status: e.target.value as PricePoint["status"] })}>
              {(["可售", "占用", "锁位"] as const).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </Modal>
      ) : null}
      {node}
    </div>
  );
}
