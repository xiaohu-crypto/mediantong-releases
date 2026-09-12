import { healthScore } from "./metrics";
import type { ContactPoint, Payment } from "../types";

export function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

/** 从接触点与回款记录派生健康度;无接触点 → 冷启动 70 */
export function healthOf(customerId: string, cps: ContactPoint[], payments: Payment[]): number {
  const mine = cps.filter((p) => p.customerId === customerId && !p.deletedAt);
  const freq = mine.length === 0 ? null : Math.min(mine.length / 6, 1) * 100;
  const pays = payments.filter((p) => p.customerId === customerId && !p.deletedAt);
  const punct = pays.length === 0 ? null : (pays.filter((p) => p.status === "已收").length / pays.length) * 100;
  return healthScore({ contactFrequency: freq, paymentPunctuality: punct, responseRate: 70, satisfaction: 70 });
}

export function latestTouch(customerId: string, cps: ContactPoint[]): number | null {
  const times = cps.filter((p) => p.customerId === customerId && !p.deletedAt).map((p) => p.time);
  return times.length ? Math.max(...times) : null;
}

/** 逾期回款通知"发生时间":优先应收到期日(dueDate),缺省退到实收日(paidDate)/记录写入时间(updatedAt) */
export function payNotifyAt(p: Payment): number {
  const due = p.dueDate ? new Date(p.dueDate).getTime() : NaN;
  if (Number.isFinite(due)) return due;
  const paid = p.paidDate ? new Date(p.paidDate).getTime() : NaN;
  if (Number.isFinite(paid)) return paid;
  return (p as { updatedAt?: number }).updatedAt ?? 0;
}

/** 14 天无接触客户通知"发生时间":最近接触时间 + 沉默阈值天数 */
export function staleNotifyAt(lastTouchAt: number, staleDays = 14): number {
  return lastTouchAt + staleDays * 86400000;
}

export type CustomerStage = "潜在" | "有效" | "合作" | "流失";

/**
 * 客户阶段派生:
 * - 合作:存在关联合同 或 有签约状态商机
 * - 有效:存在在途商机(阶段不在 签约/输单/流失)
 * - 流失:所有关联商机均为输单/流失 且 无签约合同
 * - 潜在:以上都不是
 */
export function customerStage(
  customerId: string,
  deals: { customerId: string; stage: string; deletedAt?: number }[],
  contracts: { customerId: string; deletedAt?: number }[]
): CustomerStage {
  const mineDeals = deals.filter((d) => d.customerId === customerId && !d.deletedAt);
  const hasContract = contracts.some((c) => c.customerId === customerId && !c.deletedAt);
  const hasSigned = mineDeals.some((d) => d.stage === "签约");
  if (hasContract || hasSigned) return "合作";
  const hasActive = mineDeals.some((d) => !["签约", "输单", "流失"].includes(d.stage));
  if (hasActive) return "有效";
  if (mineDeals.length > 0 && mineDeals.every((d) => ["输单", "流失"].includes(d.stage))) return "流失";
  return "潜在";
}
