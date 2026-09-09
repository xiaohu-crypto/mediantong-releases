import { db } from "../../db/db";

export interface AiConfig {
  baseUrl: string; model: string;
  cloudEnabled: boolean; allowSensitiveCloud: boolean;
}
export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: "https://apihub.agnes-ai.com/v1",
  model: "agnes-2.5-flash",
  cloudEnabled: true,
  allowSensitiveCloud: true,
};

export interface KeyRecord { enc?: string; plain?: string }

export async function getAiConfig(): Promise<AiConfig> {
  return db.getSetting<AiConfig>("aiConfig", DEFAULT_AI_CONFIG);
}

export async function saveAiConfig(cfg: AiConfig): Promise<void> {
  await db.setSetting("aiConfig", cfg);
}

/** 密钥:Electron 下经 safeStorage 加密存储;浏览器回退明文并标记 */
export async function saveAiKey(plain: string): Promise<{ encrypted: boolean }> {
  if (window.mta?.aiSaveKey) {
    const rec = await window.mta.aiSaveKey(plain);
    await db.setSetting("aiKey", rec);
    return { encrypted: !!rec.enc };
  }
  await db.setSetting("aiKey", { plain } as KeyRecord);
  return { encrypted: false };
}

export async function loadAiKey(): Promise<{ key: string; encrypted: boolean }> {
  const rec = await db.getSetting<KeyRecord | null>("aiKey", null);
  if (!rec) return { key: "", encrypted: false };
  if (rec.enc && window.mta?.aiLoadKey) {
    const key = await window.mta.aiLoadKey(rec);
    return { key, encrypted: true };
  }
  return { key: rec.plain ?? "", encrypted: false };
}

export interface ChatResult { ok: boolean; content?: string; error?: string; tokens?: number; model?: string }

export async function aiChat(messages: { role: string; content: string }[]): Promise<ChatResult> {
  const cfg = await getAiConfig();
  const { key } = await loadAiKey();
  if (!key) return { ok: false, error: "未配置 API Key(系统管理 → AI 设置)" };
  if (!window.mta?.aiChat) return { ok: false, error: "云模型调用需要 Electron 环境" };
  const r = await window.mta.aiChat({ baseUrl: cfg.baseUrl, apiKey: key, model: cfg.model, messages });
  if (!r.ok) return { ok: false, error: r.error ?? `HTTP ${r.status ?? "?"}` , model: cfg.model };
  const tokens = r.usage?.total_tokens ?? 0;
  if (tokens > 0) {
    const m = new Date().toISOString().slice(0, 7);
    const u = await db.getSetting("aiUsage", { month: m, calls: 0, tokens: 0 });
    const nu = u.month === m ? { month: m, calls: u.calls + 1, tokens: u.tokens + tokens } : { month: m, calls: 1, tokens };
    await db.setSetting("aiUsage", nu);
  }
  return { ok: true, content: r.content ?? "", tokens, model: cfg.model };
}
