import { desensitize, restore } from "./desensitize";
import { route } from "./router";
import { aiChat, getAiConfig } from "./client";
import type { ContactPoint, Customer, Deal } from "../../types";
import { daysSince } from "../derive";

export interface ScriptResult { ok: boolean; content: string; badge: "云" | "本地"; reason: string; error?: string }

const LOCAL_FALLBACK = (stage: string, silent: number): string =>
  `【本地模板】${stage} 阶段、已沉默 ${silent} 天的建议跟进:\n` +
  `1. 引用上次接触的具体事项开场(避免泛泛问好);\n` +
  `2. 给出一个明确的下一步(排期确认/报价答疑/政策更新);\n` +
  `3. 附上时间锚点:"本周内锁定可保留 Q4 排期优先权"。`;

export async function genScript(d: Deal, c: Customer, cps: ContactPoint[]): Promise<ScriptResult> {
  const cfg = await getAiConfig();
  const decision = route("客户资料-话术草稿", { cloudEnabled: cfg.cloudEnabled, allowSensitiveCloud: cfg.allowSensitiveCloud });
  const silent = daysSince(d.lastTouchAt);
  const last = cps.filter((p) => p.customerId === c.id).sort((a, b) => b.time - a.time)[0];

  if (decision.target === "local") {
    return { ok: true, content: LOCAL_FALLBACK(d.stage, silent), badge: "本地", reason: decision.reason };
  }

  const facts = [
    `客户:${c.name}(等级 ${c.grade},行业 ${c.industry})`,
    `商机:${d.title};阶段:${d.stage};金额:${d.value} 元`,
    `沉默天数:${silent}`,
    last ? `最近接触:${last.summary}` : "最近接触:无记录",
    "请生成 3 条中文跟进话术,每条不超过 60 字,直接可发。",
  ].join("\n");

  const { text, map } = desensitize(facts, [c.name]);
  try {
    const r = await aiChat([
      { role: "system", content: "你是资深的媒体广告销售助理。只输出话术本身,不要解释。" },
      { role: "user", content: text },
    ]);
    if (!r.ok) return { ok: false, content: "", badge: "云", reason: decision.reason, error: r.error ?? "未知错误" };
    return { ok: true, content: restore(r.content ?? "", map), badge: "云", reason: decision.reason };
  } catch (e) {
    return { ok: false, content: "", badge: "云", reason: decision.reason, error: String(e) };
  }
}
