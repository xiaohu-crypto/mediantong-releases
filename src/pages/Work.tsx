import { useState } from "react";
import { db } from "../db/db";
import type { Customer, KanbanCol, Objective, Task } from "../types";
import { Btn, Chip, Modal, Field, uid, useToast } from "../ui/common";
import { IconPlus } from "../components/icons";

const COLS: KanbanCol[] = ["待办", "进行中", "待审核", "完成"];
const WIP_LIMIT = 5;

interface Props {
  tasks: Task[]; objectives: Objective[]; customers: Customer[];
  reload: () => Promise<void>;
}

export default function Work(props: Props) {
  const { show, node } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<KanbanCol | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [eform, setEform] = useState<{ title: string; priority: Task["priority"]; due: string; customerId: string; kanbanCol: KanbanCol }>({ title: "", priority: "中", due: "", customerId: "", kanbanCol: "待办" });

  function openEdit(t: Task) {
    setEditId(t.id);
    setEform({ title: t.title, priority: t.priority, due: t.due ?? "", customerId: t.customerId ?? "", kanbanCol: t.kanbanCol });
  }

  async function submitEdit() {
    if (!editId || !eform.title.trim()) { show("任务标题必填"); return; }
    const t0 = tasks.find((x) => x.id === editId);
    if (!t0) return;
    await db.put("tasks", { ...t0, title: eform.title.trim(), priority: eform.priority, due: eform.due || undefined, customerId: eform.customerId || undefined, kanbanCol: eform.kanbanCol }, "编辑任务");
    show("任务已更新");
    setEditId(null);
    await props.reload();
  }

  async function removeTask() {
    if (!editId) return;
    const t0 = tasks.find((x) => x.id === editId);
    if (!t0) return;
    await db.softDelete("tasks", editId, "删除任务「" + t0.title + "」");
    show("任务已移入回收站");
    setEditId(null);
    await props.reload();
  }
  const [form, setForm] = useState<{ title: string; priority: Task["priority"]; type: Task["type"]; due: string; customerId: string }>({ title: "", priority: "中", type: "任务", due: "", customerId: "" });

  const tasks = props.tasks.filter((t) => !t.deletedAt);
  const wip = tasks.filter((t) => t.kanbanCol === "进行中").length;
  const obj = props.objectives[0];

  async function drop(col: KanbanCol) {
    setOver(null);
    if (!dragId) return;
    const t = tasks.find((x) => x.id === dragId);
    if (!t || t.kanbanCol === col) return;
    await db.put("tasks", { ...t, kanbanCol: col }, `任务「${t.title}」移动到 ${col}`);
    setDragId(null);
    await props.reload();
  }

  async function submitAdd() {
    if (!form.title.trim()) { show("任务标题必填"); return; }
    await db.put("tasks", { id: uid("t"), title: form.title.trim(), type: form.type, priority: form.priority, due: form.due || undefined, kanbanCol: "待办", customerId: form.customerId || undefined }, "新建任务");
    show("任务已创建(待办)");
    setAddOpen(false);
    setForm({ title: "", priority: "中", type: "任务", due: "", customerId: "" });
    await props.reload();
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>工作管理系统</h1><div className="date">看板四列 · 拖拽流转 · 进行中 WIP 上限 {WIP_LIMIT}(当前 {wip})</div></div>
        <div className="actions"><Btn kind="primary" onClick={() => setAddOpen(true)}><IconPlus size={14} /> 新建任务</Btn></div>
      </div>

      {obj ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="h-row"><span className="h-title sm">{obj.quarter} · {obj.title}</span><Chip kind="data">OKR 只读</Chip></div>
          {obj.keyResults.map((kr) => (
            <div key={kr.name} className="progress">
              <div className="pl"><span>{kr.name}</span><b className="num">{kr.progress}%</b></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: kr.progress + "%" }} /></div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="kanban">
        {COLS.map((col) => {
          const colTasks = tasks.filter((t) => t.kanbanCol === col);
          const isOverLimit = col === "进行中" && colTasks.length > WIP_LIMIT;
          return (
            <div className="kcol" key={col}
              onDragOver={(e) => { e.preventDefault(); setOver(col); }}
              onDragLeave={() => setOver((c) => (c === col ? null : c))}
              onDrop={() => { void drop(col); }}
              style={over === col ? { borderColor: "var(--data)" } : undefined}>
              <div className="kcol-head">
                {col}
                <span className={"chip " + (isOverLimit ? "danger" : "gray")} style={{ marginLeft: "auto" }} title={isOverLimit ? "超过 WIP 上限,先完成再领取新任务" : undefined}>{colTasks.length}</span>
              </div>
              <div className="kcol-body">
                {colTasks.map((t) => (
                  <div className="kcard" key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)} onClick={() => openEdit(t)} title="点击编辑,拖拽流转" style={{ cursor: "pointer" }}>
                    <div className="t">{t.title}</div>
                    <div className="m">
                      <Chip kind={t.priority === "高" ? "danger" : t.priority === "中" ? "warn" : "gray"}>{t.priority}</Chip>
                      <Chip gray>{t.type}</Chip>
                      {t.due ? <span className="cell-sub num">截止 {t.due}</span> : null}
                      {t.amount ? <span className="cell-sub num">¥{t.amount}</span> : null}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 ? <p className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "center", padding: 12 }}>拖拽卡片到这里</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      {addOpen ? (
        <Modal title="新建任务" onClose={() => setAddOpen(false)} footer={
          <div className="grow">
            <Btn kind="ghost" onClick={() => setAddOpen(false)}>取消</Btn>
            <Btn kind="primary" onClick={() => { void submitAdd(); }}>创建</Btn>
          </div>
        }>
          <Field label="标题">
            <input className="inp" style={{ width: "100%" }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="优先级">
              <select className="sel" style={{ width: "100%" }} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task["priority"] })}>
                {["高", "中", "低"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="截止日(可选)">
              <input className="inp num" type="date" style={{ width: "100%" }} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </Field>
          </div>
          <Field label="关联客户(可选)">
            <select className="sel" style={{ width: "100%" }} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">不关联</option>
              {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Modal>
      ) : null}
      {editId ? (
        <Modal title="编辑任务" onClose={() => setEditId(null)} footer={
          <div className="grow" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn kind="danger" onClick={() => { void removeTask(); }}>删除</Btn>
            <Btn kind="ghost" onClick={() => setEditId(null)}>取消</Btn>
            <Btn kind="primary" onClick={() => { void submitEdit(); }}>保存</Btn>
          </div>
        }>
          <Field label="标题">
            <input className="inp" style={{ width: "100%" }} value={eform.title} onChange={(e) => setEform({ ...eform, title: e.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="优先级">
              <select className="sel" style={{ width: "100%" }} value={eform.priority} onChange={(e) => setEform({ ...eform, priority: e.target.value as Task["priority"] })}>
                {["高", "中", "低"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="所在列">
              <select className="sel" style={{ width: "100%" }} value={eform.kanbanCol} onChange={(e) => setEform({ ...eform, kanbanCol: e.target.value as KanbanCol })}>
                {COLS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="截止日(可选)">
              <input className="inp num" type="date" style={{ width: "100%" }} value={eform.due} onChange={(e) => setEform({ ...eform, due: e.target.value })} />
            </Field>
            <Field label="关联客户(可选)">
              <select className="sel" style={{ width: "100%" }} value={eform.customerId} onChange={(e) => setEform({ ...eform, customerId: e.target.value })}>
                <option value="">不关联</option>
                {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}
      {node}
    </div>
  );
}
