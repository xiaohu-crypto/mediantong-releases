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
  const decision = route("客户资料-话术草稿", { cloudEnabled: cfg.cloudEnabled, allowSensitiveCloud: cfg.allowSensitiveCloud, agentEnabled: cfg.agents?.script !== false });
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

/* ===== P3:结构化跟进建议解析(纯函数,可测试) ===== */
export interface StructuredAdvice {
  summary: string;       // 总结
  decisions: string[];   // 关键决策(客户方)
  todos: string[];        // 待办事项(我方)
  risks: string[];       // 风险提示
}

type SecKey = "summary" | "decisions" | "todos" | "risks";

/** 各区块可识别的标题别名(长名在前,避免"决策"误吃"关键决策") */
const SEC_ALIASES: { key: SecKey; names: string[] }[] = [
  { key: "summary", names: ["总结", "概述", "客户现状"] },
  { key: "decisions", names: ["关键决策", "客户决策", "决策事项"] },
  { key: "todos", names: ["待办事项", "待办", "行动项", "我方动作", "下一步"] },
  { key: "risks", names: ["风险提示", "风险点", "风险"] },
];

/** 把 AI 返回文本中的列表块拆成条目:支持换行逐条,也支持行内 "1. xxx 2. yyy" */
function splitItems(block: string): string[] {
  const items: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const re = /(\d+)\s*[.、)]\s*([^]*?)(?=\s+\d+\s*[.、)]|$)/g;
    let m: RegExpExecArray | null;
    let matched = false;
    while ((m = re.exec(line)) !== null) {
      const txt = m[2].trim().replace(/^[-•·*]\s*/, "");
      if (txt) items.push(txt);
      matched = true;
    }
    if (!matched) {
      const txt = line.replace(/^[-•·*]\s*/, "").trim();
      if (txt) items.push(txt);
    }
  }
  return items;
}

/**
 * 解析 AI 按约定格式输出的结构化建议:
 *   支持 【总结】/【关键决策】/【待办】/【风险】 或 ## 总结 等标题写法;
 *   列表支持 "1. xxx"、"1、xxx"、"- xxx" 及行内混排。
 * 未识别到任何区块标题时返回 null(调用方回退纯文本展示)。
 */
export function parseStructuredAdvice(text: string): StructuredAdvice | null {
  if (!text || !text.trim()) return null;
  // 归一化 markdown 标题 "## 总结" → "【总结】"(补全闭括号,标题后同行内容归入本区块)
  const norm = text.replace(/^[ \t]*#{1,6}[ \t]*(.+?)[ \t]*$/gm, "【$1】");

  const names: { name: string; key: SecKey }[] = [];
  for (const sec of SEC_ALIASES) for (const n of sec.names) names.push({ name: n, key: sec.key });
  names.sort((a, b) => b.name.length - a.name.length);
  const alt = names.map((x) => x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  // 标题允许【】包裹或行首纯文本;不要求标题在行尾,同一行后续内容归本区块
  const re = new RegExp("(?:^|\\n)[ \\t]*【?[ \\t]*(" + alt + ")[ \\t]*】?[ \\t]*[:：]?[ \\t]*", "g");

  /* headerStart=区块标题在文本中的起始(含前导换行后),contentStart=标题后正文起始;
     切区块时当前块应止于下一个标题的 headerStart,避免把下个标题残留进当前块 */
  const marks: { key: SecKey; headerStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const hit = names.find((x) => x.name === m![1]);
    marks.push({ key: hit!.key, headerStart: m.index + (m[0].startsWith("\n") ? 1 : 0), contentStart: m.index + m[0].length });
  }
  if (marks.length === 0) return null;

  const out: StructuredAdvice = { summary: "", decisions: [], todos: [], risks: [] };
  const seen = new Set<SecKey>();
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (seen.has(mk.key)) continue;
    seen.add(mk.key);
    const nextStart = i + 1 < marks.length ? marks[i + 1].headerStart : norm.length;
    const block = norm.slice(mk.contentStart, nextStart).trim();
    if (mk.key === "summary") out.summary = block.replace(/\s*\n\s*/g, " ").trim();
    else out[mk.key] = splitItems(block).slice(0, mk.key === "risks" ? 2 : 3);
  }
  if (!out.summary && out.decisions.length === 0 && out.todos.length === 0 && out.risks.length === 0) return null;
  return out;
}