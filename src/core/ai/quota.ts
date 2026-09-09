/** 月度成本限额:纯函数,达 100% 暂停云调用,≥80% 告警(需求 8.7 成本护栏) */
export interface Usage { month: string; calls: number; tokens: number }
export type QuotaLevel = "ok" | "warn" | "exceeded";
export interface QuotaState { level: QuotaLevel; ratio: number; msg: string }

export function quotaState(usage: Usage, monthlyTokenLimit: number, nowMonth?: string): QuotaState {
  if (!monthlyTokenLimit || monthlyTokenLimit <= 0) return { level: "ok", ratio: 0, msg: "" };
  const m = nowMonth ?? new Date().toISOString().slice(0, 7);
  if (usage.month !== m) return { level: "ok", ratio: 0, msg: "" }; // 跨月自然重置
  const ratio = usage.tokens / monthlyTokenLimit;
  if (ratio >= 1) return { level: "exceeded", ratio, msg: `本月 tokens 已达限额(${usage.tokens}/${monthlyTokenLimit})` };
  if (ratio >= 0.8) return { level: "warn", ratio, msg: `本月 tokens 已用 ${Math.round(ratio * 100)}%,接近限额` };
  return { level: "ok", ratio, msg: "" };
}