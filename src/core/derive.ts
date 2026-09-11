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
