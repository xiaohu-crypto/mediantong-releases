/** 分级路由:敏感任务默认本地;脱敏后或非敏感任务走云(需求文档 6.1) */

export type Sensitivity = "sensitive" | "normal";
export type RouteTarget = "local" | "cloud";

const SENSITIVE_KEYWORDS = ["客户档案", "聊天记录", "合同", "回款", "客户资料", "名片", "客户信息"];

export function classify(task: string): Sensitivity {
  return SENSITIVE_KEYWORDS.some((k) => task.includes(k)) ? "sensitive" : "normal";
}

export interface RouteOptions { cloudEnabled: boolean; allowSensitiveCloud: boolean; agentEnabled?: boolean }
export interface RouteDecision { target: RouteTarget; reason: string }

export function route(task: string, o: RouteOptions): RouteDecision {
  if (o.agentEnabled === false) return { target: "local", reason: "该 AI Agent 已关闭(系统管理 → AI 设置)" };
  const s = classify(task);
  if (!o.cloudEnabled) return { target: "local", reason: "云模型总开关未开启" };
  if (s === "sensitive" && !o.allowSensitiveCloud) return { target: "local", reason: "敏感数据默认本地(可在 AI 设置允许脱敏后上云)" };
  return { target: "cloud", reason: s === "sensitive" ? "敏感数据已脱敏后上云" : "非敏感任务" };
}
