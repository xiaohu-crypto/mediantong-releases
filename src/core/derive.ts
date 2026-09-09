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
