import { type CSSProperties, type ReactNode, useCallback, useState } from "react";
import { IconClose } from "../components/icons";

export function money(n: number): string {
  return "¥" + n.toLocaleString("zh-CN");
}

export function uid(prefix: string): string {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function Btn(props: { kind?: "primary" | "ghost" | "data" | "draft" | "done" | "danger"; children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; sm?: boolean; style?: CSSProperties }) {
  const cls = "btn " + (props.kind ?? "ghost") + (props.sm ? " sm" : "");
  return <button className={cls} style={props.style} onClick={props.onClick} disabled={props.disabled} title={props.title}>{props.children}</button>;
}

export function Chip(props: { kind?: "brand" | "data" | "green" | "warn" | "danger" | "gray"; gray?: boolean; children: ReactNode; style?: CSSProperties }) {
  return <span className={"chip " + (props.gray ? "gray" : props.kind ?? "gray")} style={props.style}>{props.children}</span>;
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-mask" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <b>{props.title}</b>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={props.onClose} aria-label="关闭"><IconClose size={16} /></button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer ? <div className="modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

export function Field(props: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
      {props.error ? <span className="err">{props.error}</span> : null}
    </div>
  );
}

export function Progress(props: { label: string; v: number; warn?: boolean }) {
  return (
    <div className="progress">
      <div className="pl"><span>{props.label}</span><b className="num">{props.v}%</b></div>
      <div className="bar-track"><div className={"bar-fill" + (props.warn ? " warn" : "")} style={{ width: props.v + "%" }} /></div>
    </div>
  );
}

export function useToast(): { show: (m: string, onUndo?: () => void) => void; node: ReactNode } {
  const [toast, setToast] = useState<string | null>(null);
  const [undoFn, setUndoFn] = useState<(() => void) | null>(null);
  const show = useCallback((m: string, onUndo?: () => void) => {
    setToast(m);
    setUndoFn(() => onUndo ?? null);
    window.setTimeout(() => { setToast(null); setUndoFn(null); }, 4000);
  }, []);
  const node = toast ? (
    <div className="toast" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span>{toast}</span>
      {undoFn ? (
        <button onClick={() => { undoFn(); setToast(null); setUndoFn(null); }} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 12 }}>
          撤销
        </button>
      ) : null}
    </div>
  ) : null;
  return { show, node };
}
