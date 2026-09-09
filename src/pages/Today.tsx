import { useState } from "react";
import { nextBestActions } from "../core/metrics";
import { daysSince, healthOf } from "../core/derive";
import type { Customer, Deal, Milestone, Objective, Payment, ContactPoint, Task } from "../types";
import { Btn, Chip, money, Progress, useToast } from "../ui/common";
import { genScript } from "../core/ai/script";
import { uid } from "../ui/common";
import { db } from "../db/db";
import { IconWallet } from "../components/icons";

interface Props {
  customers: Customer[]; deals: Deal[]; payments: Payment[]; cps: ContactPoint[];
  objectives: Objective[]; tasks: Task[]; milestones: Milestone[];
  reload: () => Promise<void>;
  openQuick: () => void; goCrm: (customerId: string) => void;
}

export default function Today(props: Props) {
  void props.reload;
  const { show, node } = useToast();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [gen, setGen] = useState<Record<string, { busy?: boolean; text?: string; badge?: "云" | "本地"; reason?: string; error?: string }>>({});

  const active = props.deals.filter((d) => !["签约", "输单", "流失"].includes(d.stage) && !d.deletedAt);
  const nameOf = (id: string) => props.customers.find((c) => c.id === id)?.name ?? "未知客户";
  const gradeOf = (id: string) => props.customers.find((c) => c.id === id)?.grade ?? "C";
  const overdueCids = new Set(props.payments.filter((p) => p.status === "逾期" && !p.deletedAt).map((p) => p.customerId));

  const nba = nextBestActions(
    active.map((d) => ({
      deal: { ...d, lastTouchDays: daysSince(d.lastTouchAt) },
      grade: gradeOf(d.customerId),
      hasOverduePayment: overdueCids.has(d.customerId),
    })),
    5
  );
  const dealById = (id: string) => props.deals.find((d) => d.id === id);

  const today = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][today.getDay()];
  const obj = props.objectives[0];

  const lowHealth = props.customers.filter((c) => !c.deletedAt && healthOf(c.id, props.cps, props.payments) < 60);
  const overdue = props.payments.filter((p) => p.status === "逾期" && !p.deletedAt);
  const dueSoon = props.payments.filter((p) => {
    if (p.status !== "未到" || p.deletedAt) return false;
    const diff = (new Date(p.dueDate).getTime() - Date.now()) / 86400000;
    return diff <= 7;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>今日驾驶舱</h1>
          <div className="date">{today.getFullYear()} 年 {today.getMonth() + 1} 月 {today.getDate()} 日 {week}</div>
          <div className="greet">下午好 — {active.length} 个在途商机、{overdue.length} 笔逾期回款,行动清单已按规则引擎排好。</div>
        </div>
        <div className="actions">
          <Btn kind="primary" onClick={props.openQuick}>+ 快速采集</Btn>
        </div>
      </div>

      <div className="grid-c">
        <div className="card card-pad">
          <div className="h-row">
            <span className="h-title">AI 建议 · 今天最该做的</span>
            <Chip kind="brand">Next-Best-Action</Chip>
            <span className="muted" style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>规则引擎:沉默天数 × 价值 × 阶段(非 AI)</span>
          </div>
          <div className="nbxs">
            {nba.map((n, i) => {
              const d = dealById(n.dealId);
              if (!d) return null;
              return (
                <div className="nbx-item" key={n.dealId}>
                  <div className={"prio " + (i === 0 ? "hot" : i < 3 ? "warm" : "cool")}>{i + 1}</div>
                  <div className="nbx-body">
                    <div className="nbx-title">{nameOf(d.customerId)} · {d.title} <span className="tag num">· 商机 {money(d.value)}</span></div>
                    <div className="nbx-meta">
                      <span className="dot-flag" style={{ background: overdueCids.has(d.customerId) ? "var(--danger)" : n.daysSilent > 14 ? "var(--warning)" : "var(--data)" }} />
                      已沉默 {n.daysSilent} 天 · 阶段:{d.stage} · 等级:{gradeOf(d.customerId)}
                      {overdueCids.has(d.customerId) ? <Chip kind="danger">有逾期回款</Chip> : null}
                    </div>
                    <div className="nbx-actions">
'                      <Btn kind="draft" sm disabled={!!gen[d.id]?.busy}
                        onClick={() => {
                          const c = props.customers.find((x) => x.id === d.customerId);
                          if (!c) return;
                          setGen((s) => ({ ...s, [d.id]: { busy: true } }));
                          void genScript(d, c, props.cps).then((r) => {
                            setGen((s) => ({ ...s, [d.id]: { busy: false, text: r.ok ? r.content : undefined, badge: r.badge, reason: r.reason, error: r.error } }));
                          });
                        }}>{gen[d.id]?.busy ? "生成中…" : "生成跟进话术草稿"}</Btn>'
                      <Btn kind="done" sm onClick={() => { setDone((s) => ({ ...s, [n.dealId]: true })); show("已记录:今日已跟进"); }}>记录为已跟进</Btn>
                      <Btn kind="done" sm onClick={() => props.goCrm(d.customerId)}>打开客户</Btn>
                    </div>
'                  </div>
                  {gen[d.id]?.text ? (
                    <div style={{ marginTop: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 12px", whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>
                      <Chip kind={gen[d.id]?.badge === "云" ? "data" : "gray"} style={{ marginBottom: 4 }}>{gen[d.id]?.badge} · {gen[d.id]?.reason}</Chip>
                      <div>{gen[d.id]?.text}</div>
                    </div>
                  ) : null}
                  {gen[d.id]?.error ? <div className="cell-sub" style={{ color: "var(--danger)", marginTop: 6 }}>云调用失败:{gen[d.id]?.error}(已保留本地路径)</div> : null}
                  {done[n.dealId] ? <Chip kind="green">已跟进</Chip> : null}'
                </div>
              );
            })}
            {nba.length === 0 ? <p className="muted" style={{ padding: "16px 0" }}>暂无在途商机 — 点击右上角快速采集开始。</p> : null}
          </div>
        </div>

        <div className="side-stack">
          {props.milestones.slice(0, 1).map((m) => {
            const days = Math.max(0, Math.ceil((new Date(m.date).getTime() - Date.now()) / 86400000));
            return (
              <div className="card" key={m.name}>
                <div className="countdown">
                  <div className="num">{days}<span style={{ fontSize: "var(--text-sm)", color: "var(--ink-3)", fontWeight: 600 }}>天</span></div>
                  <div>
                    <div className="lbl">下一个营销节点</div>
                    <div style={{ fontWeight: 650, marginTop: 2 }}>{m.name}</div>
                    <div className="lbl" style={{ marginTop: 2 }}>{m.date}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {obj ? (
            <div className="card card-pad">
              <div className="h-row"><span className="h-title sm">{obj.quarter} 目标 KR 进度</span></div>
              {obj.keyResults.map((kr) => (
                <Progress key={kr.name} label={kr.name} v={kr.progress} warn={kr.name.includes("回款") && kr.progress < 90} />
              ))}
            </div>
          ) : null}

          <div className="card card-pad">
            <div className="h-row"><span className="h-title sm">今日日程</span><span className="muted" style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>来自任务</span></div>
            {props.tasks.filter((t) => !t.deletedAt && t.due && t.kanbanCol !== "完成").slice(0, 4).map((t) => (
              <div className="mini-row" key={t.id}><time>{t.priority === "高" ? "!!" : "·"}</time><span className="ev">{t.title}</span></div>
            ))}
            {props.tasks.filter((t) => t.due && t.kanbanCol !== "完成").length === 0 ? <p className="muted">今日无截止任务</p> : null}
          </div>
        </div>
      </div>

      <div className="alert-strip">
        <div className="card card-pad">
          <div className="h-row" style={{ marginBottom: 4 }}>
            <span className="h-title sm">预警</span>
            <Chip kind="danger">{lowHealth.length > 0 ? "需关注" : "无"}</Chip>
          </div>
          {lowHealth.map((c) => (
            <div className="alert-line" key={c.id}>
              <span className="dot-flag" style={{ background: "var(--danger)" }} />
              <span className="txt">健康度偏低:<b>{c.name}</b>(<span className="num">{healthOf(c.id, props.cps, props.payments)}</span> 分)</span>
'              <span style={{ display: "inline-flex", gap: 6 }}>
              <button className="btn done sm" onClick={() => props.goCrm(c.id)}>查看</button>
              <button className="btn done sm" onClick={() => { void (async () => {
                const list = await db.getSetting<{ id: string; at: number; title: string; body: string }[]>("snoozed", []);
                list.push({ id: uid("sn"), at: Date.now() + 3600000, title: "健康度预警 · " + c.name, body: "1 小时前设置的稍后提醒:该客户健康度偏低,建议跟进。" });
                await db.setSetting("snoozed", list);
                show("已设 1 小时后提醒");
              })(); }}>稍后提醒</button>
              </span>'
            </div>
          ))}
          {lowHealth.length === 0 ? <p className="muted">暂无预警</p> : null}
        </div>

        <div className="card card-pad">
          <div className="h-row" style={{ marginBottom: 4 }}>
            <span className="h-title sm">待回款</span>
            <span style={{ marginLeft: "auto", color: "var(--brand)" }}><IconWallet size={18} /></span>
          </div>
          {overdue.map((p) => (
            <div className="alert-line" key={p.id}>
              <span className="txt">{nameOf(p.customerId)} · <Chip kind="danger">逾期</Chip></span>
              <span className="amt num">{money(p.amount)}</span>
              <time>{p.dueDate}</time>
            </div>
          ))}
          {dueSoon.map((p) => (
            <div className="alert-line" key={p.id}>
              <span className="txt">{nameOf(p.customerId)} · <Chip kind="warn">7 日内到期</Chip></span>
              <span className="amt num">{money(p.amount)}</span>
              <time>{p.dueDate}</time>
            </div>
          ))}
          {overdue.length + dueSoon.length === 0 ? <p className="muted">暂无待回款</p> : null}
        </div>
      </div>
      {node}
    </div>
  );
}
