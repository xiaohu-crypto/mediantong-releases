import { useEffect, useMemo, useState } from "react";
import { db } from "../db/db";
import { funnel } from "../core/metrics";
import { healthOf, latestTouch } from "../core/derive";
import { validateCustomer } from "../core/validators";
import type { Contact, ContactPoint, Contract, Customer, Deal, Payment, Rel, Task } from "../types";
import { Btn, Chip, money, Modal, Field, uid, useToast } from "../ui/common";
import { IconClose, IconPlus, IconSearch } from "../components/icons";

interface Props {
  customers: Customer[]; contacts: Contact[]; rels: Rel[]; deals: Deal[];
  contracts: Contract[]; payments: Payment[]; cps: ContactPoint[]; tasks: Task[];
  reload: () => Promise<void>;
  focusCustomerId?: string | null;
}

interface SavedView { name: string; q: string; industry: string; sortKey: "name" | "health" | "deal" }

const CH = { 微信: "var(--success)", 拜访: "var(--brand)", 电话: "var(--data)", 邮件: "var(--ink-4)" } as const;

export default function CRM(props: Props) {
  const { show, node } = useToast();
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "health" | "deal">("name");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  useEffect(() => {
    void (async () => setSavedViews(await db.getSetting<SavedView[]>("crmViews", [])))();
  }, []);
  const [openId, setOpenId] = useState<string | null>(props.focusCustomerId ?? null);
  const [tab, setTab] = useState<"概览" | "决策链" | "时间线" | "合同与回款">("概览");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "", grade: "C", billingTitle: "", billingTaxNo: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});

  const customers = props.customers.filter((c) => !c.deletedAt);
  const deals = props.deals.filter((d) => !d.deletedAt);
  const payments = props.payments.filter((p) => !p.deletedAt);
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? "未知客户";

  const industries = Array.from(new Set(customers.map((c) => c.industry)));
  const rows = useMemo(() => {
    const f = customers.filter((c) =>
      (industry === "" || c.industry === industry) &&
      (q === "" || c.name.includes(q))
    );
    return f.sort((a, b) => {
      if (sortKey === "health") return healthOf(b.id, props.cps, payments) - healthOf(a.id, props.cps, payments);
      if (sortKey === "deal") {
        const dv = (cid: string) => deals.filter((d) => d.customerId === cid && !["签约", "输单", "流失"].includes(d.stage)).reduce((s, d) => s + d.value, 0);
        return dv(b.id) - dv(a.id);
      }
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [customers, industry, q, sortKey, props.cps, payments, deals]);

  const f = funnel(deals);
  const open = openId ? customers.find((c) => c.id === openId) ?? null : null;

  async function submitAdd() {
    const errs = validateCustomer(form, customers.map((c) => c.name));
    if (Object.keys(errs).length) { setErrs(errs); return; }
    await db.put("customers", { id: uid("c"), name: form.name.trim(), industry: form.industry || "待补充", grade: form.grade as Customer["grade"], billingTitle: form.billingTitle || undefined, billingTaxNo: form.billingTaxNo || undefined }, "新增客户");
    show("客户已建档");
    setAddOpen(false); setForm({ name: "", industry: "", grade: "C", billingTitle: "", billingTaxNo: "" }); setErrs({});
    await props.reload();
  }

  async function tryDelete(c: Customer) {
    const linked = deals.filter((d) => d.customerId === c.id).length;
    if (linked > 0) { show(`删除被阻止:「${c.name}」存在 ${linked} 个关联商机;请先处理商机或改用归档`); return; }
    await db.softDelete("customers", c.id, `删除客户「${c.name}」(入回收站)`);
    setOpenId(null);
    show("已移入回收站(30 天内可恢复)");
    await props.reload();
  }

  async function saveView() {
    const v: SavedView = { name: viewName.trim() || `视图${savedViews.length + 1}`, q, industry, sortKey };
    const next = [...savedViews, v];
    setSavedViews(next);
    await db.setSetting("crmViews", next);
    setViewName(""); setSavingView(false);
    show("视图已保存");
  }
  async function applyView(v: SavedView) { setQ(v.q); setIndustry(v.industry); setSortKey(v.sortKey); }
  async function delView(i: number) {
    const next = savedViews.filter((_, idx) => idx !== i);
    setSavedViews(next);
    await db.setSetting("crmViews", next);
  }

  const drawerC = open;
  const drawerDeals = drawerC ? deals.filter((d) => d.customerId === drawerC.id) : [];
  const drawerContracts = drawerC ? props.contracts.filter((x) => x.customerId === drawerC.id && !x.deletedAt) : [];
  const drawerPays = drawerC ? payments.filter((p) => p.customerId === drawerC.id) : [];
  const drawerTasks = drawerC ? props.tasks.filter((t) => t.customerId === drawerC.id && !t.deletedAt) : [];
  const drawerRels = drawerC ? props.rels.filter((r) => r.customerId === drawerC.id && !r.deletedAt) : [];
  const drawerCps = drawerC ? props.cps.filter((p) => p.customerId === drawerC.id && !p.deletedAt).sort((a, b) => b.time - a.time) : [];
  const drawerContacts = drawerRels.map((r) => ({ rel: r, contact: props.contacts.find((x) => x.id === r.contactId) }));

  return (
    <div>
      <div className="page-head">
        <div><h1>CRM 客户管理</h1><div className="date">客户 {customers.length} · 在途商机 {deals.filter((d) => !["签约", "输单", "流失"].includes(d.stage)).length} 个 · 点击行打开 360° 抽屉</div></div>
        <div className="actions"><Btn kind="primary" onClick={() => setAddOpen(true)}><IconPlus size={14} /> 新增客户</Btn></div>
      </div>

      <div className="funnel">
        {(["线索", "MQL", "SQL", "商机", "签约"] as const).map((s, i) => (
          <div className={"fseg" + (i === 0 ? " hot" : "")} key={s}>
            <span className="n num">{f[s]?.count ?? 0}</span>
            <span className="l">{s}{f[s] ? ` · ${money(f[s].value)}` : ""}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, padding: "12px 14px 0", flexWrap: "wrap" }}>
          {savedViews.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <Chip kind="data" >{v.name}</Chip>
              <button className="btn done sm" onClick={() => { void applyView(v); }}>应用</button>
              <button className="btn done sm" onClick={() => { void delView(i); }}>×</button>
            </span>
          ))}
          {savingView ? (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <input className="inp" style={{ width: 140, minHeight: 28, padding: "2px 8px", fontSize: "var(--text-xs)" }} value={viewName}
                onChange={(e) => setViewName(e.target.value)} placeholder="视图名" />
              <Btn kind="data" sm onClick={() => { void saveView(); }}>确定</Btn>
              <Btn kind="done" sm onClick={() => setSavingView(false)}>取消</Btn>
            </span>
          ) : null}
        </div>
        <div className="toolbar-row" style={{ padding: "10px 14px 0", marginBottom: 4 }}>
          <div className="filter-input">
            <IconSearch size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索客户…" />
          </div>
          <select className="sel" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">全部行业</option>
            {industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className="sel" value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
            <option value="name">按名称</option>
            <option value="health">按健康度</option>
            <option value="deal">按商机额</option>
          </select>
          <Btn kind="draft" sm onClick={() => setSavingView(true)} style={{ marginLeft: "auto" }}>保存为视图</Btn>
        </div>
        <div className="tgrid-wrap">
          <table className="tgrid">
            <thead><tr><th>客户</th><th>行业</th><th>等级</th><th>健康度</th><th>在途商机</th><th>最近跟进</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const h = healthOf(c.id, props.cps, payments);
                const activeDeals = deals.filter((d) => d.customerId === c.id && !["签约", "输单", "流失"].includes(d.stage));
                const lt = latestTouch(c.id, props.cps);
                const cls = h >= 80 ? "good" : h >= 60 ? "mid" : "low";
                return (
                  <tr key={c.id} onClick={() => { setOpenId(c.id); setTab("概览"); }}>
                    <td><div className="cname"><span className="dot" style={{ background: h >= 80 ? "var(--success)" : h >= 60 ? "var(--warning)" : "var(--danger)" }} />{c.name}</div><div className="cell-sub">{c.industry}</div></td>
                    <td>{c.industry}</td>
                    <td><Chip kind={c.grade === "A" || c.grade === "S" ? "brand" : "gray"}>{c.grade}</Chip></td>
                    <td><div className="mini-hp"><div className="hp-dot"><i className={cls} style={{ width: h + "%" }} /></div><span className="hp-val num" style={{ color: h >= 80 ? "var(--success)" : h >= 60 ? "var(--warning)" : "var(--danger)" }}>{h}</span></div></td>
                    <td className="num">{activeDeals.length ? `${activeDeals.length} 个 · ${money(activeDeals.reduce((s, d) => s + d.value, 0))}` : "—"}</td>
                    <td>{lt ? new Date(lt).toLocaleDateString("zh-CN") : "—"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)", padding: 24 }}>没有匹配的客户</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* 360 抽屉 */}
      <div className={"drawer-mask" + (open ? " open" : "")} onClick={() => setOpenId(null)} />
      <aside className={"drawer" + (open ? " open" : "")}>
        {drawerC ? (
          <>
            <div className="drawer-head">
              <div className="detail-avatar">{drawerC.name.slice(0, 1)}</div>
              <div>
                <div className="detail-title">{drawerC.name}</div>
                <div className="detail-sub">
                  <Chip kind={drawerC.grade === "A" || drawerC.grade === "S" ? "brand" : "gray"}>{drawerC.grade} 级</Chip>
                  <Chip>{drawerC.industry}</Chip>
                  {drawerC.parentId ? <Chip gray>属集团 {nameOf(drawerC.parentId)}</Chip> : null}
                </div>
              </div>
              <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setOpenId(null)} aria-label="关闭"><IconClose size={16} /></button>
            </div>
            <div className="dtabs">
              {(["概览", "决策链", "时间线", "合同与回款"] as const).map((t) => (
                <span key={t} className={"dtab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>
              ))}
            </div>
            <div className="drawer-body">
              {tab === "概览" && (
                <div className="kv-grid">
                  <div className="score-wrap">
                    <svg width="52" height="52" className="ring"><circle className="bg" cx="26" cy="26" r="21" /><circle className="fg" cx="26" cy="26" r="21" strokeDasharray="132" strokeDashoffset={132 - (132 * healthOf(drawerC.id, props.cps, payments)) / 100} /></svg>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-4)" }}>客户健康度(派生)</div>
                      <div className="score-num num">{healthOf(drawerC.id, props.cps, payments)}<span style={{ fontSize: "var(--text-sm)", color: "var(--ink-4)", fontWeight: 500 }}> / 100</span></div>
                    </div>
                  </div>
                  <div className="kv"><span className="k">开票抬头</span><span className="v" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{drawerC.billingTitle ?? "未建档"}</span></div>
                  <div className="kv"><span className="k">税号</span><span className="v" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{drawerC.billingTaxNo ?? "未建档"}</span></div>
                  <div className="kv"><span className="k">在途商机</span><span className="v num">{drawerDeals.filter((d) => !["输单", "流失"].includes(d.stage)).length} 个</span></div>
                  <div className="kv"><span className="k">累计商机额</span><span className="v num">{money(drawerDeals.reduce((s, d) => s + d.value, 0))}</span></div>
                </div>
              )}
              {tab === "决策链" && (
                <div>
                  <div className="dsec">角色徽章制(不画图谱)</div>
                  {drawerContacts.map(({ rel, contact }) => (
                    <div className="chain-row" key={rel.id}>
                      <div className="chain-avatar">{contact?.name.slice(0, 1) ?? "?"}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{contact?.name}
                          {contact?.employmentStatus !== "在职" ? <Chip kind="danger">关系风险:{contact?.employmentStatus}</Chip> : null}
                        </div>
                        <div className="cell-sub">{contact?.title} · {contact?.phone ?? "无手机号"}</div>
                      </div>
                      <span className="chain-role"><Chip kind={rel.role === "决策人DM" ? "danger" : rel.role === "影响者" ? "data" : "gray"}>{rel.role}</Chip></span>
                    </div>
                  ))}
                  {drawerContacts.length === 0 ? <p className="muted" style={{ padding: "12px 18px" }}>暂无联系人关联</p> : null}
                </div>
              )}
              {tab === "时间线" && (
                <div style={{ paddingTop: 10 }}>
                  {drawerCps.map((p) => (
                    <div className="tl-item" key={p.id}>
                      <span className="tl-dot" style={{ background: CH[p.channel] }} />
                      <div>
                        <div className="tl-title">{p.channel} · {p.summary}</div>
                        <div className="tl-time">{new Date(p.time).toLocaleString("zh-CN")}</div>
                      </div>
                    </div>
                  ))}
                  {drawerCps.length === 0 ? <p className="muted" style={{ padding: "0 18px" }}>暂无接触点</p> : null}
                </div>
              )}
              {tab === "合同与回款" && (
                <div style={{ padding: "12px 18px" }}>
                  {drawerContracts.map((ht) => (
                    <div key={ht.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{ht.name}</div>
                      <div className="cell-sub num">{money(ht.amount)} · {ht.signDate} · {ht.status}</div>
                      {drawerPays.filter((p) => p.contractId === ht.id).map((p) => (
                        <div className="alert-line" key={p.id}>
                          <span className="txt">{p.status === "逾期" ? <Chip kind="danger">逾期</Chip> : p.status === "已收" ? <Chip kind="green">已收</Chip> : <Chip kind="warn">{p.status}</Chip>}</span>
                          <span className="amt num">{money(p.amount)}</span>
                          <time>{p.dueDate}</time>
                        </div>
                      ))}
                    </div>
                  ))}
                  {drawerTasks.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="dsec" style={{ padding: 0 }}>关联任务</div>
                      {drawerTasks.map((t) => <div className="mini-row" key={t.id}><span className="ev">{t.title}</span><Chip gray>{t.kanbanCol}</Chip></div>)}
                    </div>
                  ) : null}
                  {drawerContracts.length === 0 ? <p className="muted">暂无合同</p> : null}
                </div>
              )}
            </div>
            <div className="drawer-foot">
              <Btn kind="primary" onClick={() => show("演示:接触点快速记录属 P1 管线")}>记录跟进</Btn>
              <Btn kind="ghost" onClick={() => { void (async () => { await tryDelete(drawerC); })(); }}>删除</Btn>
              <Btn kind="ghost" onClick={() => {
                const bundle = {
                  customer: drawerC,
                  contacts: drawerContacts.map((x) => x.contact),
                  rels: drawerRels,
                  deals: drawerDeals, contracts: drawerContracts, payments: drawerPays,
                  contactPoints: drawerCps, tasks: drawerTasks,
                };
                const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `客户包_${drawerC.name}_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                show("客户包已导出(交接/归档用)");
              }}>导出客户包</Btn>
            </div>
          </>
        ) : null}
      </aside>

      {addOpen ? (
        <Modal title="新增客户" onClose={() => setAddOpen(false)} footer={
          <div className="grow">
            <Btn kind="ghost" onClick={() => setAddOpen(false)}>取消</Btn>
            <Btn kind="primary" onClick={() => { void submitAdd(); }}>保存</Btn>
          </div>
        }>
          <Field label="客户名称" error={errs.name}>
            <input className="inp" style={{ width: "100%" }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="行业"><input className="inp" style={{ width: "100%" }} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></Field>
            <Field label="等级">
              <select className="sel" style={{ width: "100%" }} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                {["S", "A", "B", "C"].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          <Field label="开票抬头(可选)"><input className="inp" style={{ width: "100%" }} value={form.billingTitle} onChange={(e) => setForm({ ...form, billingTitle: e.target.value })} /></Field>
          <Field label="税号(可选)" error={errs.billingTaxNo}><input className="inp num" style={{ width: "100%" }} value={form.billingTaxNo} onChange={(e) => setForm({ ...form, billingTaxNo: e.target.value })} /></Field>
        </Modal>
      ) : null}
      {node}
    </div>
  );
}
