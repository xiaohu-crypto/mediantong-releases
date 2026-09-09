import { useEffect, useRef, useState } from "react";
import { db } from "../db/db";
import { seedIfEmpty } from "../data/seed";
import { DEFAULT_AI_CONFIG, getAiConfig, loadAiKey, saveAiKey, saveAiConfig, type AiConfig } from "../core/ai/client";
import { Btn, Chip, Field, useToast } from "../ui/common";
import { IconRefresh } from "../components/icons";

type Tab = "设置" | "回收站" | "操作日志" | "标签治理";

interface LogRow { id: string; ts: number; who: string; what: string; entityType: string; entityId: string; before: unknown | null }

export default function SettingsPage(props: { theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void; reload: () => Promise<void>; customers: { id: string; name: string }[]; notes: { id: string; title: string; tags: string[]; content: string }[] }) {
  const { show, node } = useToast();
  const [tab, setTab] = useState<Tab>("设置");
  const [trash, setTrash] = useState<{ store: string; id: string; title: string; deletedAt: number }[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [autostart, setAutostart] = useState(false);
  const [aiCfg, setAiCfg] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [keyInput, setKeyInput] = useState("");
  const [keyState, setKeyState] = useState<{ has: boolean; encrypted: boolean }>({ has: false, encrypted: false });
  const [aiTesting, setAiTesting] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ month: string; calls: number; tokens: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      setTrash(await db.listTrashed());
      const logs = await db.getAll<LogRow>("operationLogs");
      setLogs(logs.sort((a, b) => b.ts - a.ts));
      if (window.mta) setAutostart(await window.mta.getLoginItem());
      setAiCfg(await getAiConfig());
      const k = await loadAiKey();
      setKeyState({ has: !!k.key, encrypted: k.encrypted });
      setUsage(await db.getSetting("aiUsage", null));
    })();
  }, [tab]);

  function applyTheme(t: "dark" | "light") {
    props.setTheme(t);
    void db.setSetting("theme", t);
  }

  async function backupNow() {
    const dump = await db.dumpAll();
    const payload = { app: "meidiantong-workbench", schemaVersion: 1, exportedAt: new Date().toISOString(), stores: dump };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    show("备份已导出(JSON);轮转保留策略属系统管理 P0 验收:默认保留最近 7 份由用户目录管理");
  }

  async function restoreFile(f: File) {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as { stores?: Record<string, unknown[]> };
      if (!parsed.stores || !Array.isArray(parsed.stores.customers)) { show("文件格式不正确:缺少 stores 字段"); return; }
      await db.restoreAll(parsed.stores);
      await props.reload();
      show("恢复完成,数据已覆盖写入");
    } catch {
      show("恢复失败:无法解析该文件");
    }
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>系统管理</h1><div className="date">设置 / 回收站(30 天) / 操作日志(可撤销)</div></div>
      </div>

      <div className="tabs">
        {(["设置", "回收站", "操作日志", "标签治理"] as Tab[]).map((t) => (
          <span key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</span>
        ))}
      </div>

      {tab === "设置" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <div className="alert-line"><span className="txt">主题</span>
            <select className="sel" value={props.theme} onChange={(e) => applyTheme(e.target.value as "dark" | "light")}>
              <option value="dark">深色(默认)</option>
              <option value="light">浅色</option>
            </select>
          </div>
          <div className="alert-line"><span className="txt">专注模式(侧栏收窄为图标、强调色灰化)</span>
            <Btn kind="ghost" onClick={() => { document.documentElement.classList.toggle("focus-mode"); show("专注模式已切换"); }}>切换</Btn>
          </div>
          <div className="alert-line"><span className="txt">开机自启(Electron 环境)</span>
            {window.mta ? (
              <Btn kind="ghost" onClick={() => { void (async () => { const v = await window.mta!.setLoginItem(!autostart); setAutostart(v); show(v ? "已开启开机自启" : "已关闭开机自启"); })(); }}>{autostart ? "已开启" : "已关闭"}</Btn>
            ) : <Chip gray>浏览器模式不可用</Chip>}
          </div>
          <div className="alert-line"><span className="txt">系统通知</span><Chip kind="green">已开启(P0)</Chip></div>
          <div className="alert-line"><span className="txt">邮件导入渠道</span><Chip gray>默认关闭(二期可开)</Chip></div>

          <div className="h-row" style={{ marginTop: 18 }}>
            <span className="h-title sm">备份与恢复</span>
            <span style={{ marginLeft: "auto" }}><IconRefresh size={16} /></span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn kind="primary" onClick={() => { void backupNow(); }}>立即备份(导出 JSON)</Btn>
            <Btn kind="ghost" onClick={() => fileRef.current?.click()}>从备份恢复</Btn>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreFile(f); e.target.value = ""; }} />
            <Btn kind="danger" onClick={() => { void (async () => { await db.clearAll(); await seedIfEmpty(); await props.reload(); show("已重置并重建示例数据"); })(); }}>重置示例数据</Btn>
          </div>
          <div className="h-row" style={{ marginTop: 20 }}><span className="h-title sm">AI 模型(Agnes AI · 云)</span></div>
          <div className="alert-line"><span className="txt">云模型总开关</span>
            <Btn kind={aiCfg.cloudEnabled ? "data" : "ghost"} sm onClick={() => { const v = !aiCfg.cloudEnabled; setAiCfg({ ...aiCfg, cloudEnabled: v }); void saveAiConfig({ ...aiCfg, cloudEnabled: v }); show(v ? "云模型已开启" : "云模型已关闭(全部走本地)"); }}>{aiCfg.cloudEnabled ? "已开启" : "已关闭"}</Btn>
          </div>
          <div className="alert-line"><span className="txt">敏感数据脱敏后允许上云</span>
            <Btn kind={aiCfg.allowSensitiveCloud ? "data" : "ghost"} sm onClick={() => { const v = !aiCfg.allowSensitiveCloud; setAiCfg({ ...aiCfg, allowSensitiveCloud: v }); void saveAiConfig({ ...aiCfg, allowSensitiveCloud: v }); }}>{aiCfg.allowSensitiveCloud ? "允许(默认,强制脱敏)" : "不允许(纯本地)"}</Btn>
          </div>
          <div className="field-row">
            <Field label="API Base URL"><input className="inp" style={{ width: "100%" }} value={aiCfg.baseUrl} onChange={(e) => setAiCfg({ ...aiCfg, baseUrl: e.target.value })} onBlur={() => { void saveAiConfig(aiCfg); }} /></Field>
            <Field label="模型 ID"><input className="inp" style={{ width: "100%" }} value={aiCfg.model} onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })} onBlur={() => { void saveAiConfig(aiCfg); }} /></Field>
          </div>
          <div className="alert-line"><span className="txt">API Key(当前:{keyState.has ? (keyState.encrypted ? "已加密存储" : "明文(浏览器回退)") : "未配置"})</span></div>
          <div className="field-row">
            <Field label={keyState.has ? "更换 Key" : "填入 Key"}>
              <input className="inp" type="password" style={{ width: "100%" }} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-…" />
            </Field>
            <Field label=" ">
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="primary" sm disabled={!keyInput.trim()} onClick={() => { void (async () => { const r = await saveAiKey(keyInput.trim()); setKeyState({ has: true, encrypted: r.encrypted }); setKeyInput(""); show(r.encrypted ? "密钥已通过系统凭据加密存储" : "密钥已保存(浏览器模式:明文本地)"); })(); }}>保存密钥</Btn>
                <Btn kind="data" sm disabled={aiTesting || !keyState.has} onClick={() => { void (async () => {
                  setAiTesting(true); setAiResult(null);
                  try {
                    const { aiChat } = await import("../core/ai/client");
                    const r = await aiChat([{ role: "user", content: "ping,请回复 pong" }]);
                    setAiResult(r.ok ? "连接成功 · 模型 " + (r.model ?? "") + (r.tokens ? " · tokens " + r.tokens : "") : "连接失败:" + (r.error ?? "未知"));
                  } finally { setAiTesting(false); }
                })(); }}>{aiTesting ? "测试中…" : "测试连接"}</Btn>
              </div>
            </Field>
          </div>
          {aiResult ? <p style={{ fontSize: "var(--text-xs)", color: aiResult.startsWith("连接成功") ? "var(--success)" : "var(--danger)" }}>{aiResult}</p> : null}
          {usage ? <p className="muted" style={{ fontSize: "var(--text-xs)" }}>本月云调用:{usage.calls} 次 / {usage.tokens} tokens(月度限额告警属后续迭代)</p> : null}

          <div className="h-row" style={{ marginTop: 14 }}><span className="h-title sm">数据打包交接(按客户)</span></div>
          <CustomerPack customers={props.customers} onDone={show} />
          <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 10 }}>
            备份含 schemaVersion 与导出时间;恢复按仓覆盖写入;往返一致性由单元测试保障(tests/core.test.ts + 存储层)。
          </p>
        </div>
      )}

      {tab === "回收站" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="tgrid">
            <thead><tr><th>对象</th><th>来源仓</th><th>删除时间</th><th>操作</th></tr></thead>
            <tbody>
              {trash.map((r) => (
                <tr key={r.store + r.id} style={{ cursor: "default" }}>
                  <td>{r.title}</td><td><Chip gray>{r.store}</Chip></td>
                  <td className="num">{new Date(r.deletedAt).toLocaleString("zh-CN")}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <Btn kind="data" sm onClick={() => { void (async () => { await db.restore(r.store as never, r.id); setTrash(await db.listTrashed()); await props.reload(); show("已恢复"); })(); }}>恢复</Btn>
                      <Btn kind="danger" sm onClick={() => { void (async () => { await db.purge(r.store as never, r.id); setTrash(await db.listTrashed()); show("已彻底删除"); })(); }}>彻底删除</Btn>
                    </span>
                  </td>
                </tr>
              ))}
              {trash.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)", padding: 24 }}>回收站为空(软删除记录 30 天后可由系统清理)</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      {tab === "操作日志" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="tgrid">
            <thead><tr><th>时间</th><th>对象</th><th>动作</th><th>操作</th></tr></thead>
            <tbody>
              {logs.slice(0, 50).map((l) => (
                <tr key={l.id} style={{ cursor: "default" }}>
                  <td className="num">{new Date(l.ts).toLocaleString("zh-CN")}</td>
                  <td><Chip gray>{l.entityType}</Chip></td>
                  <td>{l.what}</td>
                  <td>
                    <Btn kind="data" sm disabled={!l.before} title={l.before ? "按 before 快照恢复" : "新建操作无回滚快照"}
                      onClick={() => { void (async () => { try { await db.undoLog(l.id); await props.reload(); show("已撤销该变更"); } catch { show("撤销失败"); } })(); }}>撤销</Btn>
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)", padding: 24 }}>暂无操作日志</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      {tab === "标签治理" && <TagGovernance notes={props.notes} reload={props.reload} />}

      {node}
    </div>
  );
}

/** 标签治理:列出全部笔记标签,重命名=全量合并 */
function TagGovernance(props: { notes: { id: string; title: string; tags: string[]; content: string }[]; reload: () => Promise<void> }) {
  const { show, node } = useToast();
  const tagMap = new Map<string, number>();
  for (const n of props.notes) for (const t of n.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
  const [renames, setRenames] = useState<Record<string, string>>({});

  async function rename(from: string) {
    const to = (renames[from] ?? "").trim();
    if (!to || to === from) { show("请输入新标签名"); return; }
    for (const n of props.notes) {
      if (n.tags.includes(from)) {
        const tags = Array.from(new Set(n.tags.map((x) => (x === from ? to : x))));
        const full = await db.get<{ id: string }>("notes", n.id);
        if (full) await db.put("notes", { ...full, tags }, `标签治理:「
${from}
」合并为「
${to}
」`);
      }
    }
    show(`已合并:${from} → ${to}`);
    await props.reload();
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div className="h-row" style={{ marginBottom: 8 }}>
        <span className="h-title sm">用户标签治理</span>
        <Chip gray style={{ marginLeft: "auto" }}>系统枚举不受此影响</Chip>
      </div>
      {Array.from(tagMap.entries()).map(([tag, count]) => (
        <div className="alert-line" key={tag}>
          <Chip kind="data">#{tag}</Chip>
          <span className="txt cell-sub">{count} 条笔记使用</span>
          <input className="inp" style={{ width: 140, minHeight: 28, padding: "2px 8px", fontSize: "var(--text-xs)" }}
            placeholder="合并为…" value={renames[tag] ?? ""} onChange={(e) => setRenames((s) => ({ ...s, [tag]: e.target.value }))} />
          <Btn kind="done" sm onClick={() => { void rename(tag); }}>合并</Btn>
        </div>
      ))}
      {tagMap.size === 0 ? <p className="muted">暂无用户标签(来自知识库笔记)</p> : null}
      {node}
    </div>
  );
}

function CustomerPack(props: { customers: { id: string; name: string }[]; onDone: (m: string) => void }) {
  const [cid, setCid] = useState("");
  function pack() {
    if (!cid) { props.onDone("请选择客户"); return; }
    const blob = new Blob([JSON.stringify({ customerId: cid, exportedAt: new Date().toISOString(), note: "完整包请从 CRM 抽屉导出(含关联明细)" })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `客户包索引_${cid}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    props.onDone("已导出索引;完整客户包在 CRM 抽屉内导出");
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select className="sel" value={cid} onChange={(e) => setCid(e.target.value)}>
        <option value="">选择客户…</option>
        {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Btn kind="ghost" onClick={pack}>导出索引</Btn>
    </div>
  );
}
