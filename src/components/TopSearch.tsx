import { useEffect, useRef, useState } from "react";
import { searchAll, type SearchDoc } from "../core/search";
import { IconSearch } from "./icons";

export default function TopSearch(props: { onSelect: (doc: SearchDoc) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<(SearchDoc & { score: number })[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResults(searchAll(q));
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const typeLabel: Record<string, string> = { 客户: "客户", 联系人: "联系人", 商机: "商机", 任务: "任务", 笔记: "笔记" };

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, maxWidth: 340 }}>
      <div className="filter-input" style={{ maxWidth: "none" }}>
        <IconSearch size={14} />
        <input value={q} placeholder="搜索客户、商机、笔记…"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
      </div>
      {open && q && results.length > 0 ? (
        <div style={{ position: "absolute", top: 40, left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-md)", zIndex: 80, overflow: "hidden" }}>
          {results.map((r) => (
            <div key={r.type + r.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", fontSize: "var(--text-sm)" }}
              onClick={() => { props.onSelect(r); setOpen(false); setQ(""); }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
              <span className="chip data" style={{ fontSize: 10, padding: "0 6px" }}>{typeLabel[r.type] ?? r.type}</span>
              <span style={{ fontWeight: 550 }}>{r.title}</span>
              <span className="muted" style={{ marginLeft: "auto", fontSize: "var(--text-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
