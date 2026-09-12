import type { ContactPoint, Contract, Customer, Deal, Payment, Rel, Task } from "../../types";
import { money } from "../../ui/common";
import { daysSince, healthOf, latestTouch } from "../derive";

/* ===== P3:客户详情本地问数引擎(纯规则匹配,不调云端) ===== */
export interface AskContext {
  customer: Customer;
  deals: Deal[];            // 该客户的所有商机
  contracts: Contract[];    // 该客户的所有合同
  payments: Payment[];       // 该客户的所有回款
  cps: ContactPoint[];     // 该客户的所有接触点
  tasks: Task[];            // 该客户的所有任务
  rels?: Rel[];             // 决策链关联(用于联系人/决策人统计)
}

/** 已结束/不视为在途的商机阶段 */
const DONE_STAGES = ["签约", "输单", "流失"];

function fmtDate(s?: string): string {
  if (!s) return "-";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("zh-CN");
}

function stageOf(customerId: string, deals: Deal[], contracts: Contract[]): string {
  const mine = deals.filter((d) => d.customerId === customerId && !d.deletedAt);
  const hasContract = contracts.some((c) => c.customerId === customerId && !c.deletedAt);
  const hasSigned = mine.some((d) => d.stage === "签约");
  if (hasContract || hasSigned) return "合作";
  if (mine.some((d) => !DONE_STAGES.includes(d.stage))) return "有效";
  if (mine.length > 0 && mine.every((d) => DONE_STAGES.includes(d.stage))) return "流失";
  return "潜在";
}

/**
 * 纯本地规则问数:按关键词识别意图,从 ctx 数据计算答案。
 * 无法识别时提示可问方向。
 */
export function askCustomer(question: string, ctx: AskContext): string {
  const q = (question || "").trim();
  if (!q) return "请输入问题。可尝试:商机 / 合同 / 回款 / 跟进 / 健康度 / 联系人 / 任务 / 概况";

  const c = ctx.customer;
  const deals = ctx.deals.filter((d) => !d.deletedAt);
  const openDeals = deals.filter((d) => !DONE_STAGES.includes(d.stage));
  const contracts = ctx.contracts.filter((x) => !x.deletedAt);
  const pays = ctx.payments.filter((p) => !p.deletedAt);
  const tasks = ctx.tasks.filter((t) => !t.deletedAt);
  const cps = ctx.cps.filter((p) => !p.deletedAt);
  const rels = (ctx.rels ?? []).filter((r) => !r.deletedAt);
  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);


  /* 商机 */
  if (/(商机|pipeline|deal)/i.test(q)) {
    const dist = new Map<string, number>();
    for (const d of openDeals) dist.set(d.stage, (dist.get(d.stage) ?? 0) + 1);
    const distStr = dist.size ? [...dist.entries()].map(([k, v]) => `${k} ${v}个`).join("、") : "无在途";
    return `共 ${deals.length} 个商机,在途 ${openDeals.length} 个,在途金额合计 ${money(openDeals.reduce((s, d) => s + d.value, 0))}。阶段分布:${distStr}。`;
  }

  /* 合同 */
  if (/(合同|签约)/.test(q)) {
    if (!contracts.length) return "该客户暂无签约合同。";
    const list = contracts.map((x) => `${x.name}(${fmtDate(x.signDate)},${money(x.amount)})`).join("; ");
    return `已签约合同 ${contracts.length} 份,合同总额 ${money(sum(contracts))}。明细:${list}。`;
  }

  /* 回款 */
  if (/(回款|逾期|已收|待回款|应收|催款)/.test(q)) {
    if (!pays.length) return "暂无回款记录。";
    const recv = pays.filter((p) => p.status === "已收");
    const overdue = pays.filter((p) => p.status === "逾期");
    const pending = pays.filter((p) => p.status === "未到" || p.status === "部分");
    return `回款概览:已收 ${recv.length} 笔共 ${money(sum(recv))};逾期 ${overdue.length} 笔共 ${money(sum(overdue))};待回款 ${pending.length} 笔共 ${money(sum(pending))}。`;
  }

  /* 跟进 */
  if (/(跟进|接触|沉默|上次|多久|最近联|沟通|回访)/.test(q)) {
    const last = cps.slice().sort((a, b) => b.time - a.time)[0];
    if (!last) return "暂无任何跟进接触记录,建议尽快首次触达。";
    return `最近跟进:${new Date(last.time).toLocaleDateString("zh-CN")}(${last.channel})· ${last.summary}。距今天已沉默 ${daysSince(last.time)} 天。`;
  }

  /* 健康度 */
  if (/(健康|health)/i.test(q)) {
    const h = healthOf(c.id, cps, pays);
    const lv = h >= 80 ? "良好" : h >= 60 ? "一般" : "偏弱,需重点跟进";
    return `客户健康度 ${h}/100,等级:${lv}。`;
  }

  /* 联系人 */
  if (/(联系人|决策人|contact|DM)/i.test(q)) {
    if (!rels.length) return "该客户暂未关联决策链联系人。";
    const dm = rels.filter((r) => r.role === "决策人DM").length;
    return `决策链联系人 ${rels.length} 人,其中决策人(DM)${dm} 人。`;
  }

  /* 任务 */
  if (/(任务|待办)/.test(q)) {
    if (!tasks.length) return "该客户暂无关联任务。";
    const doing = tasks.filter((t) => t.kanbanCol === "进行中").length;
    const high = tasks.filter((t) => t.priority === "高" && t.kanbanCol !== "完成").length;
    const open = tasks.filter((t) => t.kanbanCol !== "完成").length;
    return `关联任务 ${tasks.length} 个(未完成 ${open} 个),进行中 ${doing} 个,高优先级未完成 ${high} 个。`;
  }

  /* 综合概况:放最后,避免"怎么样/如何"等词抢先命中具体意图 */
  if (/(概况|总览|总结|现状|情况|整体|总体)/.test(q)) {
    const h = healthOf(c.id, cps, pays);
    const last = latestTouch(c.id, cps);
    const overdue = pays.filter((p) => p.status === "逾期");
    const recv = pays.filter((p) => p.status === "已收");
    return [
      `客户「${c.name}」(${c.grade} 级 · ${c.industry}),当前阶段:${stageOf(c.id, deals, contracts)},健康度 ${h}/100。`,
      `在途商机 ${openDeals.length} 个,合计 ${money(openDeals.reduce((s, d) => s + d.value, 0))};合同 ${contracts.length} 份,合计 ${money(sum(contracts))}。`,
      `回款:已收 ${money(sum(recv))},逾期 ${overdue.length} 笔 ${money(sum(overdue))}。`,
      last ? `最近跟进 ${fmtDate(new Date(last).toISOString().slice(0, 10))},已沉默 ${daysSince(last)} 天。` : "暂无跟进记录。",
    ].join("");
  }

  return "未理解该问题,可尝试:商机 / 合同 / 回款 / 跟进 / 健康度 / 联系人 / 任务 / 概况";
}