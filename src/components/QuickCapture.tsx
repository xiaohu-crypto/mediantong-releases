import { useEffect, useState } from "react";
import { db } from "../db/db";
import type { Customer, Contact } from "../types";
import { uid, Btn, Chip, Field, useToast } from "../ui/common";
import { validateCustomer } from "../core/validators";
import { IconClose } from "./icons";

type QTab = "跟进" | "客户" | "想法" | "费用" | "OCR" | "微信" | "剪藏";

interface WxCandidate { name: string; phone: string; dup: boolean }

export default function QuickCapture(props: { open: boolean; onClose: () => void; reload: () => Promise<void>; customers: Customer[] }) {
  const [tab, setTab] = useState<QTab>("跟进");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wxText, setWxText] = useState("");
  const [wxPicked, setWxPicked] = useState<Record<number, boolean>>({});
  const { show, node } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && props.open) props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  if (!props.open) return null;

  const disabledTabs: QTab[] = ["OCR", "剪藏"];
  const disabledReason: Record<string, string> = {
    OCR: "内置名片 OCR 属二期(语言包内置方案已定)",
    剪藏: "网页剪藏属二期",
  };

  /* 微信粘贴解析:每行 "张三 13800138001 备注" → 联系人候选(按手机号查重) */
  const wxCandidates: WxCandidate[] = (() => {
    const phoneSet = new Set<string>();
    return wxText.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const phone = (line.match(/1[3-9]\d{9}/) ?? [""])[0];
      const name = (line.replace(/1[3-9]\d{9}/, "").trim().split(/\s+/)[0] ?? "").slice(0, 12);
      return { name, phone, dup: phone !== "" && phoneSet.has(phone) };
    }).filter((c) => c.name || c.phone);
  })();

  async function save() {
    setErrors({});
    if (tab === "跟进") {
      if (!text.trim()) { setErrors({ text: "内容必填" }); return; }
      await db.put("tasks", { id: uid("t"), title: text.trim(), type: "跟进", priority: "中", kanbanCol: "待办", customerId: customerId || undefined }, "快速采集-记跟进");
      show("已保存到任务(待办)");
    } else if (tab === "客户") {
      const errs = validateCustomer({ name }, props.customers.map((c) => c.name));
      if (Object.keys(errs).length) { setErrors(errs); return; }
      await db.put("customers", { id: uid("c"), name: name.trim(), industry: "待补充", grade: "C" }, "快速采集-记客户");
      show("客户已建档(待补充资料)");
    } else if (tab === "想法") {
      if (!text.trim()) { setErrors({ text: "内容必填" }); return; }
      await db.put("tasks", { id: uid("t"), title: text.trim(), type: "想法", priority: "低", kanbanCol: "待办" }, "快速采集-记想法");
      show("想法已收进待办");
    } else if (tab === "费用") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) { setErrors({ amount: "金额需大于 0" }); return; }
      await db.put("tasks", { id: uid("t"), title: text.trim() || "费用记录", type: "费用", priority: "低", kanbanCol: "待办", amount: n, customerId: customerId || undefined }, "快速采集-记费用");
      show("费用已记录");
    } else if (tab === "微信") {
      const picked = wxCandidates.filter((_, i) => wxPicked[i]);
      if (picked.length === 0) { show("请先粘贴并勾选要导入的联系人"); return; }
      let imported = 0;
      for (const c of picked) {
        const existing = (await db.getAll<Contact>("contacts")).find((x) => x.phone && x.phone === c.phone);
        if (existing) { show(`跳过重复:${c.name}(${c.phone})已存在`); continue; }
        await db.put("contacts", { id: uid("ct"), name: c.name || "未命名", phone: c.phone || undefined, employmentStatus: "在职" }, "微信粘贴导入-建档(查重通过)");
        imported++;
      }
      show(`微信导入完成:${imported} 人建档,重复已跳过`);
      setWxText(""); setWxPicked({});
    }
    setText(""); setName(""); setAmount(""); setCustomerId("");
    await props.reload();
    props.onClose();
  }

  return (
    <div>
      <div className="modal-mask" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
        <div className="modal" style={{ width: 600 }}>
          <div className="modal-head">
            <b>快速采集</b><span className="chip gray">Ctrl+K</span>
            <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={props.onClose} aria-label="关闭"><IconClose size={16} /></button>
          </div>
          <div className="qtypes">
            {(["跟进", "客户", "想法", "费用", "微信", "OCR", "剪藏"] as QTab[]).map((t) => {
              const dis = disabledTabs.includes(t);
              return (
                <span key={t} className={"qtype" + (tab === t ? " sel" : "") + (dis ? " dis" : "")}
                  title={dis ? disabledReason[t] : undefined}
                  onClick={() => { if (!dis) { setTab(t); setErrors({}); } }}>
                  {t === "跟进" ? "记跟进" : t === "客户" ? "记客户" : t === "想法" ? "记想法" : t === "费用" ? "记费用" : t === "微信" ? "微信导入" : t === "OCR" ? "名片 OCR" : "网页剪藏"}
                  {dis ? <span className="chip gray" style={{ fontSize: 10, padding: "0 6px" }}>二期</span> : null}
                </span>
              );
            })}
          </div>
          <div className="modal-body" style={{ paddingTop: 0 }}>
            {tab === "跟进" && (
              <>
                <Field label="跟进内容" error={errors.text}>
                  <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="随手记一条跟进…" />
                </Field>
                <Field label="关联客户(可选)">
                  <select className="sel" style={{ width: "100%" }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">不关联</option>
                    {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </>
            )}
            {tab === "客户" && (
              <Field label="客户名称" error={errors.name}>
                <input className="inp" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="客户名称" />
              </Field>
            )}
            {tab === "想法" && (
              <Field label="想法" error={errors.text}>
                <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            )}
            {tab === "费用" && (
              <>
                <Field label="金额(元)" error={errors.amount}>
                  <input className="inp num" style={{ width: "100%" }} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </Field>
                <Field label="备注(可选)"><input className="inp" style={{ width: "100%" }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
              </>
            )}
            {tab === "微信" && (
              <>
                <Field label="粘贴聊天记录(每行:姓名 手机号 备注)">
                  <textarea className="inp" rows={3} style={{ width: "100%" }} value={wxText} onChange={(e) => { setWxText(e.target.value); setWxPicked({}); }} placeholder={"张三 13800138001 市场总监\n李四 13900139002 采购"} />
                </Field>
                {wxCandidates.length > 0 ? (
                  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "6px 10px", maxHeight: 180, overflowY: "auto" }}>
                    {wxCandidates.map((c, i) => (
                      <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!wxPicked[i]} onChange={(e) => setWxPicked((s) => ({ ...s, [i]: e.target.checked }))} />
                        <b>{c.name || "(未识别姓名)"}</b>
                        <span className="cell-sub num">{c.phone || "无手机号"}</span>
                        {c.dup ? <Chip kind="warn">行内重复</Chip> : null}
                      </label>
                    ))}
                  </div>
                ) : <p className="muted" style={{ fontSize: "var(--text-xs)" }}>粘贴后自动解析;导入时按手机号查重,重复自动跳过。</p>}
              </>
            )}
            {disabledTabs.includes(tab) && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{disabledReason[tab]}</p>}
            {(tab === "跟进" || tab === "费用") ? (
              <Field label="邮件渠道">
                <span className="chip gray" title="邮件渠道默认关闭,系统设置中可开启">邮件导入:默认关闭</span>
              </Field>
            ) : null}
          </div>
          <div className="modal-foot">
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>保存后进待办/对应仓,不打断当前工作</span>
            <div className="grow">
              <Btn kind="ghost" onClick={props.onClose}>取消</Btn>
              <Btn kind="primary" onClick={() => { void save(); }}>保存</Btn>
            </div>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}
