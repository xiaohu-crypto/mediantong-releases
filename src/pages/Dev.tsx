import { useEffect, useState } from "react";
import { db } from "../db/db";
import { weightedValue } from "../core/metrics";
import type { Customer, Deal, DealStage, Pitch } from "../types";
import { Btn, Chip, Field, Modal, money, uid, useToast } from "../ui/common";
import { IconPlus } from "../components/icons";

const STAGES: DealStage[] = ["线索", "MQL", "SQL", "商机", "报价", "谈判", "签约", "输单", "流失"];
const PROB: Record<DealStage, number> = { 线索: 0.05, MQL: 0.1, SQL: 0.25, 商机: 0.4, 报价: 0.6, 谈判: 0.75, 签约: 1, 输单: 0, 流失: 0 };
const MEDDIC = ["Metrics 指标", "Economic buyer 经济决策人", "Decision criteria 决策标准", "Decision process 决策流程", "Identify pain 痛点确认", "Champion 支持者"];
const BANT = ["Budget 预算", "Authority 决策权", "Need 需求", "Timeline 时间"];

const SCRIPTS = [
  { scene: "首次触达", text: "X 总您好,我是专注[行业]媒介投放的顾问。看到贵司近期在[节点]的动作,我们服务过同类客户的组合打法可将获客成本降低 20-30%,方便约 15 分钟交流吗?" },
  { scene: "报价跟进(沉默 7 天+)", text: "X 总,上次报价单(V3,基于 2026-Q3 刊例)不知是否收到?针对贵司量级我们可以再争取[返点/赠量]政策,本周内锁定还可保 Q4 排期优先权。" },
  { scene: "催款(逾期)", text: "X 总,合同[编号]尾款¥[金额]已于[到期日]到期,麻烦安排一下财务;如需对账单或发票重开,我这边马上配合。" },
  { scene: "年框续约", text: "X 总,今年合作复盘:整体 ROI 1:X,优于行业基准 1:2.5。明年框架若提前锁定,可保留今年返点政策并加赠 Q1 排期优先权。" },
];

interface Props {
  deals: Deal[]; customers: Customer[]; pitches: Pitch[];
  reload: () => Promise<void>;
}

export default function Dev(props: Props) {
  const { show, node } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [pitchOpen, setPitchOpen] = useState(false);
  const [extraStages, setExtraStages] = useState<string[]>([]);
  useEffect(() => { void (async () => setExtraStages(await db.getSetting<string[]>("customStages", [])))(); }, []);
  const [pf, setPf] = useState({ name: "", customerId: "", date: new Date().toISOString().slice(0, 10), investment: "", competitors: "", result: "待定", lossReason: "", reviewNote: "" });
  const [aiPitchBusy, setAiPitchBusy] = useState(false);

  const deals = props.deals.filter((d) => !d.deletedAt);
  const nameOf = (id: string) => props.customers.find((c) => c.id === id)?.name ?? "未知客户";
  const active = deals.filter((d) => !["输单", "流失"].includes(d.stage));
  const weightedTotal = active.reduce((s, d) => s + weightedValue(d), 0);

  const pitches = props.pitches.filter((p) => !p.deletedAt);
  const decided = pitches.filter((p) => p.result !== "待定");
  const winRate = decided.length ? Math.round((decided.filter((p) => p.result === "胜").length / decided.length) * 100) : null;

  const sel = deals.find((d) => d.id === selected) ?? null;

  const [efOpen, setEfOpen] = useState(false);
  const [ef, setEf] = useState<{ title: string; value: string; closeDate: string }>({ title: "", value: "", closeDate: "" });

  function openDealEdit(d: Deal) {
    setEf({ title: d.title, value: String(d.value), closeDate: d.closeDate ?? "" });
    setEfOpen(true);
  }

  async function submitDealEdit() {
    if (!sel) return;
    if (!ef.title.trim()) { show("商机标题必填"); return; }
    await db.put("deals", { ...sel, title: ef.title.trim(), value: Number(ef.value) || 0, closeDate: ef.closeDate || undefined }, "编辑商机「" + ef.title.trim() + "」");
    show("商机已更新");
    setEfOpen(false);
    await props.reload();
  }

  async function setStage(d: Deal, stage: DealStage) {
    await db.put("deals", { ...d, stage, probability: PROB[stage] }, `商机「${d.title}」阶段改为 ${stage}`);
    await props.reload();
  }

  async function toggleTag(d: Deal, kind: "meddic" | "bant", tag: string) {
    const arr = d[kind] ?? [];
    const next = arr.includes(tag) ? arr.filter((x) => x !== tag) : [...arr, tag];
    await db.put("deals", { ...d, [kind]: next }, `商机「${d.title}」更新${kind === "meddic" ? "MEDDIC" : "BANT"}`);
    await props.reload();
  }

  async function submitPitch() {
    if (!pf.name.trim()) { show("比稿名称必填"); return; }
    await db.put("pitches", {
      id: uid("pi"), name: pf.name.trim(), customerId: pf.customerId || undefined,
      date: pf.date, investment: Number(pf.investment) || 0, competitors: pf.competitors,
      result: pf.result as Pitch["result"], lossReason: pf.lossReason || undefined, reviewNote: pf.reviewNote || undefined,
    }, "新增比稿记录");
    show("比稿已记录");
    setPitchOpen(false);
    setPf({ name: "", customerId: "", date: new Date().toISOString().slice(0, 10), investment: "", competitors: "", result: "待定", lossReason: "", reviewNote: "" });
    await props.reload();
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>客户开发系统</h1><div className="date">Deal 唯一漏斗 · 加权在途 {money(weightedTotal)} · 比稿胜率 {winRate === null ? "—" : winRate + "%"}({decided.length} 场)</div></div>
        <div className="actions"><Btn kind="primary" onClick={() => setPitchOpen(true)}><IconPlus size={14} /> 登记比稿</Btn></div>
      </div>

      <div className="h-row"><span className="h-title">Pipeline(按阶段)</span><Chip kind="data">点击卡片评估</Chip></div>
      <div className="kanban" style={{ gridTemplateColumns: "repeat(7,1fr)", marginBottom: 16 }}>
        {STAGES.slice(0, 7).map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          return (
            <div className="kcol" key={stage} style={{ minHeight: 200 }}>
              <div className="kcol-head">{stage}<span className="chip gray" style={{ marginLeft: "auto" }}>{col.length}</span></div>
              <div className="kcol-body">
                {col.map((d) => (
                  <div className="kcard" key={d.id} onClick={() => setSelected(d.id)}
                    style={selected === d.id ? { borderColor: "var(--brand)" } : undefined}>
                    <div className="t" style={{ fontSize: "var(--text-xs)" }}>{nameOf(d.customerId)}</div>
                    <div className="cell-sub">{d.title}</div>
                    <div className="m"><span className="num" style={{ fontWeight: 650 }}>{money(d.value)}</span>
                      <span className="chip data" style={{ fontSize: 10, padding: "0 6px" }}>{Math.round(d.probability * 100)}%</span></div>
                  </div>
                ))}
                {col.length === 0 ? <p className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "center" }}>—</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      {sel ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="h-row">
            <span className="h-title sm">{nameOf(sel.customerId)} · {sel.title}</span>
            <Btn kind="ghost" sm style={{ marginLeft: "auto" }} onClick={() => openDealEdit(sel)}>编辑商机</Btn>
            <select className="sel" style={{ marginLeft: "auto" }} value={sel.stage} onChange={(e) => { void setStage(sel, e.target.value as DealStage); }}>
              {[...STAGES, ...extraStages.filter((s) => !STAGES.includes(s as DealStage))].map((s) => <option key={s} value={s}>{s}{PROB[s as DealStage] !== undefined ? "(" + Math.round(PROB[s as DealStage] * 100) + "%)" : ""}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="dsec" style={{ padding: 0 }}>MEDDIC 商机成熟度</div>
              {MEDDIC.map((m) => (
                <div className="mini-row" key={m}>
                  <span className="ev">{m}</span>
                  <Btn kind={(sel.meddic ?? []).includes(m) ? "data" : "done"} sm onClick={() => { void toggleTag(sel, "meddic", m); }}>{(sel.meddic ?? []).includes(m) ? "已确认" : "标记"}</Btn>
                </div>
              ))}
            </div>
            <div>
              <div className="dsec" style={{ padding: 0 }}>BANT 资格</div>
              {BANT.map((b) => (
                <div className="mini-row" key={b}>
                  <span className="ev">{b}</span>
                  <Btn kind={(sel.bant ?? []).includes(b) ? "data" : "done"} sm onClick={() => { void toggleTag(sel, "bant", b); }}>{(sel.bant ?? []).includes(b) ? "已确认" : "标记"}</Btn>
                </div>
              ))}
              <div className="alert-line"><span className="txt">加权金额</span><span className="amt num">{money(weightedValue(sel))}</span></div>
            </div>
          </div>
        </div>
      ) : null}
      {efOpen && sel ? (
        <Modal title="编辑商机" onClose={() => setEfOpen(false)} footer={
          <div className="grow" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn kind="ghost" onClick={() => setEfOpen(false)}>取消</Btn>
            <Btn kind="primary" onClick={() => { void submitDealEdit(); }}>保存</Btn>
          </div>
        }>
          <Field label="商机标题">
            <input className="inp" style={{ width: "100%" }} value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="金额(元)">
              <input className="inp num" style={{ width: "100%" }} value={ef.value} onChange={(e) => setEf({ ...ef, value: e.target.value })} />
            </Field>
            <Field label="预计成交日(可选)">
              <input className="inp num" type="date" style={{ width: "100%" }} value={ef.closeDate} onChange={(e) => setEf({ ...ef, closeDate: e.target.value })} />
            </Field>
          </div>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>概率由阶段自动派生;阶段在上方下拉调整。</p>
        </Modal>
      ) : null}


      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <div className="h-row" style={{ padding: "12px 16px 0" }}><span className="h-title sm">比稿管理(投入/竞对/结果/复盘)</span></div>
        <div className="tgrid-wrap">
          <table className="tgrid">
            <thead><tr><th>比稿</th><th>客户</th><th>日期</th><th>投入</th><th>竞对</th><th>结果</th><th>复盘</th></tr></thead>
            <tbody>
              {pitches.map((p) => (
                <tr key={p.id} style={{ cursor: "default" }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.customerId ? nameOf(p.customerId) : "—"}</td>
                  <td className="num">{p.date}</td>
                  <td className="num">{money(p.investment)}</td>
                  <td>{p.competitors || "—"}</td>
                  <td><Chip kind={p.result === "胜" ? "green" : p.result === "败" ? "danger" : "warn"}>{p.result}</Chip></td>
                  <td className="cell-sub" style={{ maxWidth: 220 }}>{p.reviewNote || p.lossReason || "—"}</td>
                </tr>
              ))}
              {pitches.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-3)", padding: 20 }}>暂无比稿记录</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <div className="h-row"><span className="h-title sm">SOP 话术库</span><Chip gray>内置 4 模板 · 自定义维护属二期</Chip></div>
        {SCRIPTS.map((s) => (
          <div className="alert-line" key={s.scene}>
            <Chip kind="data">{s.scene}</Chip>
            <span className="txt">{s.text}</span>
            <Btn kind="done" sm onClick={() => { void navigator.clipboard.writeText(s.text).then(() => show("话术已复制")); }}>复制</Btn>
          </div>
        ))}
      </div>

      {pitchOpen ? (
        <Modal title="登记比稿" onClose={() => setPitchOpen(false)} footer={
          <div className="grow"><Btn kind="ghost" onClick={() => setPitchOpen(false)}>取消</Btn><Btn kind="primary" onClick={() => { void submitPitch(); }}>保存</Btn></div>
        }>
          <Field label="比稿名称"><input className="inp" style={{ width: "100%" }} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} /></Field>
          <div className="field-row">
            <Field label="客户(可选)">
              <select className="sel" style={{ width: "100%" }} value={pf.customerId} onChange={(e) => setPf({ ...pf, customerId: e.target.value })}>
                <option value="">未关联</option>
                {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="日期"><input className="inp num" type="date" style={{ width: "100%" }} value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} /></Field>
          </div>
          <div className="field-row">
            <Field label="投入成本(元)"><input className="inp num" style={{ width: "100%" }} value={pf.investment} onChange={(e) => setPf({ ...pf, investment: e.target.value })} /></Field>
            <Field label="竞对"><input className="inp" style={{ width: "100%" }} value={pf.competitors} onChange={(e) => setPf({ ...pf, competitors: e.target.value })} /></Field>
          </div>
          <div className="field-row">
            <Field label="结果">
              <select className="sel" style={{ width: "100%" }} value={pf.result} onChange={(e) => setPf({ ...pf, result: e.target.value })}>
                {["待定", "胜", "败"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label={pf.result === "败" ? "败稿原因" : "备注(可选)"}><input className="inp" style={{ width: "100%" }} value={pf.lossReason} onChange={(e) => setPf({ ...pf, lossReason: e.target.value })} /></Field>
          </div>
          <Field label={"复盘要点 " + (pf.customerId ? "" : "(选客户后可用AI)")}>
          <div style={{ display: "flex", gap: 6 }}>
            <textarea className="inp" rows={2} style={{ flex: 1, width: "100%" }} value={pf.reviewNote} onChange={(e) => setPf({ ...pf, reviewNote: e.target.value })} />
            <Btn kind="ghost" sm disabled={aiPitchBusy || !pf.customerId} onClick={() => {
              setAiPitchBusy(true);
              void (async () => {
                const { aiChat } = await import("../core/ai/client");
                const cust = props.customers.find((c) => c.id === pf.customerId);
                const r = await aiChat([
                  { role: "system", content: "你是资深广告投放策划,根据客户信息写一段比稿复盘话术,200字以内,突出投放亮点和下一步建议。" },
                  { role: "user", content: "客户:" + (cust?.name ?? "") + "\n行业:" + (cust?.industry ?? "") + "\n竞争对手:" + pf.competitors + "\n投入:" + pf.investment },
                ]);
                setPf((prev) => ({ ...prev, reviewNote: r.ok ? (r.content ?? "") : "AI调用失败" }));
                setAiPitchBusy(false);
              })();
            }}>{aiPitchBusy ? "…" : "✦"}</Btn>
          </div>
        </Field>
        </Modal>
      ) : null}
      {node}
    </div>
  );
}
