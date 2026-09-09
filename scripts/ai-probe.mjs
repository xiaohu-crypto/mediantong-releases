/**
 * Agnes AI 连通性探测:GET /models 验证密钥 + 一次最小补全。
 * 用法(密钥走环境变量,不落盘):
 *   $env:AGNES_KEY="<你的key>"; node scripts/ai-probe.mjs
 * 可选:AGNES_BASE(默认 https://apihub.agnes-ai.com/v1)、AGNES_MODEL
 */
const base = (process.env.AGNES_BASE || "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
const key = process.env.AGNES_KEY || "";
if (!key) { console.error("AGNES_KEY 未设置"); process.exit(1); }
const mask = (s) => s.slice(0, 6) + "..." + s.slice(-4);

(async () => {
  console.log("KEY:", mask(key), "| BASE:", base);
  let models = [];
  try {
    const r = await fetch(base + "/models", { headers: { Authorization: "***" + key } });
    const t = await r.text();
    console.log("[1] GET /models ->", r.status);
    if (r.ok) {
      const j = JSON.parse(t);
      models = (j.data ?? []).map((m) => m.id).filter(Boolean);
      console.log("    可用模型(" + models.length + "):", models.slice(0, 24).join(", "));
    } else {
      console.log("    body:", t.slice(0, 300));
      if (r.status === 401 || r.status === 403) { console.error("结论:密钥无效或权限不足(请确认完整 key)"); process.exit(2); }
    }
  } catch (e) { console.log("    network error:", String(e)); process.exit(3); }

  const model = process.env.AGNES_MODEL || models.find((m) => m.includes("flash")) || models[0] || "agnes-2.5-flash";
  console.log("[2] POST /chat/completions model:", model);
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "***" + key },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "只回复两个字:正常" }], max_tokens: 16 }),
    });
    const t = await r.text();
    console.log("    ->", r.status);
    if (r.ok) {
      const j = JSON.parse(t);
      console.log("    reply:", JSON.stringify(j.choices?.[0]?.message?.content ?? "").slice(0, 120));
      console.log("    usage:", JSON.stringify(j.usage ?? {}));
      console.log("结论:密钥有效,云链路打通;默认模型应设为:", model);
    } else {
      console.log("    body:", t.slice(0, 300));
      process.exit(4);
    }
  } catch (e) { console.log("    network error:", String(e)); process.exit(3); }
})();
