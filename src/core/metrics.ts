/** 计算核心:健康度/加权/漏斗/今日行动排序 —— 纯函数 */

export interface HealthInput {
  /** 合作频次 0-100(近 12 月合作次数归一化) */
  contactFrequency: number | null;
  /** 回款及时性 0-100 */
  paymentPunctuality: number | null;
  /** 沟通响应度 0-100 */
  responseRate: number | null;
  /** 满意度 0-100 */
  satisfaction: number | null;
}

/** 健康度:合作频次 30% + 回款及时 30% + 响应 20% + 满意 20%;任一维度缺失视为新客户 → 70 */
export function healthScore(i: HealthInput): number {
  const { contactFrequency: f, paymentPunctuality: p, responseRate: r, satisfaction: s } = i;
  if (f === null || p === null || r === null || s === null) return 70;
  return Math.round(f * 0.3 + p * 0.3 + r * 0.2 + s * 0.2);
}

export interface DealLike {
  value: number;
  probability: number;
  stage: string;
  customerId: string;
}

export function weightedValue(d: DealLike): number {
  // 概率兜底:自定义阶段历史数据可能缺 probability,按中漏斗 40% 计,避免加权金额为 NaN
  return Math.round(d.value * (d.probability ?? 0.4));
}

export function funnel(deals: DealLike[]): Record<string, { count: number; value: number }> {
  const out: Record<string, { count: number; value: number }> = {};
  for (const d of deals) {
    const bucket = (out[d.stage] ??= { count: 0, value: 0 });
    bucket.count += 1;
    bucket.value += d.value;
  }
  return out;
}

/** 今日行动排序规则引擎(非 AI,确定性):score = 沉默天数×2 + 价值分×10 + 阶段权重 + 逾期奖励 */
const STAGE_W: Record<string, number> = {
  报价: 5, 谈判: 5, 商机: 4, SQL: 3, MQL: 2, 线索: 1, 签约: 0, 输单: 0, 流失: 0,
};
const GRADE_W: Record<string, number> = { S: 3, A: 2, B: 1, C: 0 };

export interface NbaInput {
  deal: DealLike & { id: string; title: string; lastTouchDays: number };
  grade: string;
  hasOverduePayment: boolean;
}

export interface NbaItem {
  dealId: string;
  title: string;
  score: number;
  daysSilent: number;
}

export function nextBestActions(items: NbaInput[], topN = 5): NbaItem[] {
  const scored = items.map((it) => ({
    dealId: it.deal.id,
    title: it.deal.title,
    daysSilent: it.deal.lastTouchDays,
    score:
      it.deal.lastTouchDays * 2 +
      (GRADE_W[it.grade] ?? 0) * 10 +
      (STAGE_W[it.deal.stage] ?? 0) +
      (it.hasOverduePayment ? 15 : 0),
  }));
  // 稳定排序:分数相同按沉默天数降序
  return scored.sort((a, b) => b.score - a.score || b.daysSilent - a.daysSilent).slice(0, topN);
}
