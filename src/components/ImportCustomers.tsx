import { useState } from "react";
import { db } from "../db/db";
import { columnMatch, parseCsv, parseRows, type ImportRow } from "../core/importer";
import { uid, Btn, useToast } from "../ui/common";

interface Props { open: boolean; onClose: () => void; existingNames: string[]; reload: () => Promise<void> }

type Phase = "pick" | "preview" | "done";

export default function ImportCustomers(props: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<{ ok: number; fail: number; ids: string[]; fails: { row: number; name: string; errors: Record<string, string> }[] } | null>(null);
  const { show, node } = useToast();

  if (!props.open) return null;

  async function onFile(f: File) {
    // CSV 走原生文本解析(XLSX.read 在 Electron 渲染进程对大 CSV 会挂起,实测 2026-09-10);xlsx 才用 XLSX 解析
    const lower = f.name.toLowerCase();
    let aoa: unknown[][];
    if (lower.endsWith(".csv")) {
      const text = await f.text();
      aoa = parseCsv(text);
    } else {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    }
    if (aoa.length < 2) { show("表格为空或只有表头"); return; }
    const hs = (aoa[0] as unknown[]).map((x) => String(x));
    const m = columnMatch(hs);
    if (m.name === undefined) { show("未识别到「客户名称/名称/公司」列,请检查表头"); return; }
    const body = aoa.slice(1) as unknown[][];
    const parsed: ImportRow[] = body.map((r, i) => ({
      row: i + 2,
      name: m.name !== undefined ? String(r[m.name] ?? "").trim() : "",
      industry: m.industry !== undefined ? String(r[m.industry] ?? "").trim() : "",
      grade: m.grade !== undefined ? String(r[m.grade] ?? "").trim().toUpperCase() : "",
      phone: m.phone !== undefined ? String(r[m.phone] ?? "").trim() : "",
      billingTitle: m.billingTitle !== undefined ? String(r[m.billingTitle] ?? "").trim() : "",
      billingTaxNo: m.billingTaxNo !== undefined ? String(r[m.billingTaxNo] ?? "").trim() : "",
    })).filter((r) => r.name !== "");
    setHeaders(hs); setMapping(m); setRows(parsed); setPhase("preview");
  }

  function exportFails() {
    if (!result) return;
    const lines = ["行号,客户名称,错误"].concat(
      result.fails.map((f) => `${f.row},"${f.name}","${Object.entries(f.errors).map(([k, v]) => k + ":" + v).join("; ")}"`)
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "导入失败明细.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }

  async function undoImport() {
    if (!result) return;
    for (const id of result.ids) await db.purge("customers", id);
    await props.reload();
    show("已撤销本次导入(" + result.ids.length + " 条)");
    props.onClose();
  }

  async function confirmImport() {
    const pre = parseRows(rows, props.existingNames);
    const ids: string[] = [];
    for (let i = 0; i < pre.ok.length; i += 1000) {
      const chunk = pre.ok.slice(i, i + 1000).map((r) => ({ id: uid("c"), name: r.name, industry: r.industry || "待补充", grade: (r.grade || "C") as "S" | "A" | "B" | "C", phone: r.phone || undefined, billingTitle: r.billingTitle || undefined, billingTaxNo: r.billingTaxNo || undefined }));
      await db.putMany("customers", chunk);
      for (const c of chunk) ids.push(c.id);
    }
    if (ids.length > 0) await db.logOp({ what: "Excel 批量导入 " + ids.length + " 条客户", entityType: "customers", entityId: ids[0], before: null });
    setResult({ ok: pre.ok.length, fail: pre.fails.length, ids, fails: pre.fails });
    setPhase("done");
    await props.reload();
  }

  return (
    <div className="modal-mask" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal" style={{ width: 640 }}>
        <div className="modal-head"><b>批量导入客户</b><span className="chip gray">xlsx / csv</span>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={props.onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body">
          {phase === "pick" && (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <p className="muted" style={{ marginBottom: 12 }}>支持 .xlsx / .csv;表头需包含「客户名称」列(行业/等级/手机/开票抬头/税号可选,自动匹配)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            </div>
          )}
          {phase === "preview" && (
            <>
              <div className="h-row"><span className="h-title sm">列匹配预览</span><span className="muted" style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>共识别 {rows.length} 行数据</span></div>
              <table className="tgrid">
                <thead><tr><th>工程字段</th><th>匹配到的表头</th></tr></thead>
                <tbody>
                  {Object.entries(mapping).map(([field, idx]) => (
                    <tr key={field} style={{ cursor: "default" }}><td><b>{field}</b></td><td>{headers[idx] ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Btn kind="primary" onClick={() => { void confirmImport(); }}>确认导入 {rows.length} 条</Btn>
                <Btn kind="ghost" onClick={() => setPhase("pick")}>重选文件</Btn>
              </div>
            </>
          )}
          {phase === "done" && result && (
            <>
              <div className="h-row"><span className="h-title sm">导入完成</span>
                <span className="chip green" style={{ marginLeft: 8 }}>成功 {result.ok}</span>
                {result.fail > 0 ? <span className="chip danger">失败 {result.fail}</span> : null}
              </div>
              {result.fails.length > 0 ? (
                <table className="tgrid" style={{ marginTop: 8 }}>
                  <thead><tr><th>行号</th><th>名称</th><th>错误</th></tr></thead>
                  <tbody>{result.fails.slice(0, 20).map((f) => (
                    <tr key={f.row} style={{ cursor: "default" }}>
                      <td className="num">{f.row}</td><td>{f.name}</td>
                      <td className="cell-sub">{Object.entries(f.errors).map(([k, v]) => k + ": " + v).join("; ")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {result.fail > 0 ? <Btn kind="ghost" onClick={exportFails}>导出失败明细 CSV</Btn> : null}
                <Btn kind="danger" onClick={() => { void undoImport(); }}>撤销本次导入</Btn>
                <Btn kind="primary" onClick={props.onClose}>完成</Btn>
              </div>
            </>
          )}
        </div>
        {node}
      </div>
    </div>
  );
}
