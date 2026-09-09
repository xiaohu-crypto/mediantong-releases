import { useEffect, useMemo, useState } from "react";
import { db } from "../db/db";
import type { Note } from "../types";
import { Btn, Chip, Field, uid, useToast } from "../ui/common";
import { IconPlus } from "../components/icons";

interface Props { notes: Note[]; reload: () => Promise<void>; focusId?: string | null }

export default function Kb(props: Props) {
  const { show, node } = useToast();
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(props.focusId ?? props.notes[0]?.id ?? null);
  const [draft, setDraft] = useState<{ title: string; content: string; tags: string; para: Note["para"] } | null>(null);

  const [mode, setMode] = useState<"list" | "graph">("list");
  const notes = props.notes.filter((n) => !n.deletedAt);
  const sel = notes.find((n) => n.id === selId) ?? null;

  useEffect(() => {
    if (props.focusId) { setSelId(props.focusId); setDraft(null); }
  }, [props.focusId]);

  useEffect(() => {
    if (sel) setDraft({ title: sel.title, content: sel.content, tags: sel.tags.join(", "), para: sel.para });
    else setDraft(null);
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  const backlinks = useMemo(() => {
    if (!sel) return [];
    return notes.filter((n) => n.id !== sel.id && n.content.includes(`[[${sel.title}]]`));
  }, [sel, notes]);

  const outbound = useMemo(() => {
    if (!sel) return [];
    const titles = notes.map((n) => n.title);
    return titles.filter((t) => t !== sel.title && sel.content.includes(`[[${t}]]`));
  }, [sel, notes]);

  function openNew() {
    const n: Note = { id: uid("n"), title: "未命名笔记", content: "", tags: [], para: "Resources", versions: [] };
    void (async () => { await db.put("notes", n, "新建笔记"); await props.reload(); setSelId(n.id); })();
  }

  async function save() {
    if (!sel || !draft) return;
    const versions = sel.content !== draft.content ? [...sel.versions, { ts: Date.now(), content: sel.content }] : sel.versions;
    await db.put("notes", {
      ...sel, title: draft.title.trim() || "未命名笔记", content: draft.content,
      tags: draft.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean), para: draft.para, versions,
    }, `保存笔记「${draft.title}」${versions.length > sel.versions.length ? "(旧版入历史)" : ""}`);
    show("已保存" + (versions.length > (sel.versions?.length ?? 0) ? ",旧版本入历史" : ""));
    await props.reload();
  }

  async function remove() {
    if (!sel) return;
    await db.softDelete("notes", sel.id, `删除笔记「${sel.title}」`);
    setSelId(null);
    await props.reload();
  }

  const filtered = notes.filter((n) => q === "" || n.title.includes(q) || n.content.includes(q) || n.tags.some((t) => t.includes(q)));

  return (
    <div>
      <div className="page-head">
        <div><h1>知识学习系统</h1><div className="date">PARA 归档 · 双链 [[]] · 版本历史 · 标签检索</div></div>
'        <div className="actions">
          <Btn kind={mode === "graph" ? "data" : "ghost"} onClick={() => setMode(mode === "graph" ? "list" : "graph")}>{mode === "graph" ? "列表视图" : "知识图谱"}</Btn>
          <Btn kind="primary" onClick={openNew}><IconPlus size={14} /> 新建笔记</Btn>
        </div>'
      </div>

      {mode === "graph" ? (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div className="h-row"><span className="h-title sm">知识图谱</span><span className="chip data" style={{ marginLeft: "auto" }}>节点 = 笔记 · 连线 = [[双链]] · 点击打开</span></div>
          <svg viewBox="0 0 800 400" style={{ width: "100%", height: 360 }}>
            {(() => {
              const list = notes;
              const cx = 400, cy = 200, r = 150;
              const pos = list.map((n, i) => {
                const ang = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
                return { id: n.id, title: n.title, x: cx + r * Math.cos(ang), y: cy + r * 0.85 * Math.sin(ang) };
              });
              const byTitle = new Map(list.map((n) => [n.title, n.id]));
              const edges: { a: number; b: number }[] = [];
              for (const n of list) {
                const re = /\[\[([^\]]+)\]\]/g; let m;
                while ((m = re.exec(n.content))) {
                  const tid = byTitle.get(m[1]);
                  if (tid && tid !== n.id) edges.push({ a: pos.findIndex((p) => p.id === n.id), b: pos.findIndex((p) => p.id === tid) });
                }
              }
              return (
                <>
                  {edges.map((e, i) => <line key={i} x1={pos[e.a].x} y1={pos[e.a].y} x2={pos[e.b].x} y2={pos[e.b].y} stroke="var(--border)" strokeWidth="1.2" />)}
                  {pos.map((p) => (
                    <g key={p.id} style={{ cursor: "pointer" }} onClick={() => { setSelId(p.id); setMode("list"); }}>
                      <circle cx={p.x} cy={p.y} r="7" fill="var(--data)" />
                      <text x={p.x} y={p.y - 12} textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-2)" }}>{p.title.slice(0, 8)}</text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
        </div>
      ) : null}      <div className="grid-c" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="toolbar-row" style={{ padding: "12px 12px 4px", marginBottom: 0 }}>
            <div className="filter-input" style={{ maxWidth: "none" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题/内容/标签…" />
            </div>
          </div>
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {filtered.map((n) => (
              <div key={n.id} onClick={() => { setSelId(n.id); setDraft(null); }}
                style={{ padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--border-soft)", background: n.id === selId ? "var(--brand-soft)" : "transparent" }}>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{n.title}</div>
                <div className="cell-sub">{n.para} · {n.tags.map((t) => "#" + t).join(" ")}</div>
              </div>
            ))}
            {filtered.length === 0 ? <p className="muted" style={{ padding: 16 }}>无匹配笔记</p> : null}
          </div>
        </div>

        <div className="card card-pad">
          {sel && draft ? (
            <>
              <div className="h-row" style={{ marginBottom: 8 }}>
                <input className="inp" style={{ flex: 1, fontWeight: 650, fontSize: "var(--text-lg)" }} value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <Btn kind="primary" onClick={() => { void save(); }}>保存</Btn>
                <Btn kind="done" onClick={() => { void remove(); }}>删除</Btn>
              </div>
              <div className="h-row" style={{ marginBottom: 8 }}>
                <select className="sel" value={draft.para} onChange={(e) => setDraft({ ...draft, para: e.target.value as Note["para"] })}>
                  {["Projects", "Areas", "Resources", "Archives"].map((p) => <option key={p}>{p}</option>)}
                </select>
                <input className="inp" style={{ flex: 1 }} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="标签,逗号分隔" />
              </div>
              <textarea className="inp" style={{ width: "100%", minHeight: 260, lineHeight: 1.7 }}
                value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="支持 [[笔记标题]] 双链语法" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
                <div>
                  <div className="dsec" style={{ padding: 0 }}>双链引用此笔记({backlinks.length})</div>
                  {backlinks.map((n) => <div className="mini-row" key={n.id}><span className="ev" style={{ cursor: "pointer" }} onClick={() => setSelId(n.id)}>{n.title}</span></div>)}
                  <div className="dsec" style={{ padding: "10px 0 0" }}>此笔记引用({outbound.length})</div>
                  {outbound.map((t) => {
                    const target = notes.find((n) => n.title === t);
                    return <div className="mini-row" key={t}><span className="ev" style={{ cursor: "pointer" }} onClick={() => target && setSelId(target.id)}>{t}</span></div>;
                  })}
                </div>
                <div>
                  <div className="dsec" style={{ padding: 0 }}>版本历史({sel.versions.length})</div>
                  <div style={{ maxHeight: 180, overflowY: "auto" }}>
                    {sel.versions.slice().reverse().map((v) => (
                      <div className="mini-row" key={v.ts}>
                        <time>{new Date(v.ts).toLocaleString("zh-CN")}</time>
                        <Btn kind="done" sm onClick={() => { setDraft({ ...draft, content: v.content }); show("已载入该版本到编辑器,保存后生效"); }}>载入</Btn>
                      </div>
                    ))}
                    {sel.versions.length === 0 ? <p className="muted" style={{ fontSize: "var(--text-xs)" }}>保存后自动留档旧版本</p> : null}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                {sel.tags.map((t) => <Chip key={t} kind="data">#{t}</Chip>)}
              </div>
            </>
          ) : (
            <div className="ph"><div><div className="big">N</div><h2 style={{ fontSize: "var(--text-xl)", fontWeight: 650 }}>选择或新建一条笔记</h2><p>支持 [[双链]]、PARA 归档、标签与版本历史。</p></div></div>
          )}
          {node}
          <Field label=""><span /></Field>
        </div>
      </div>
    </div>
  );
}
