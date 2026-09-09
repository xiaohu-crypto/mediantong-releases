import { useEffect, useState } from "react";
import { db } from "../db/db";
import type { Aar, Payment, Pitch, Task } from "../types";
import { Btn, Chip, Field, money, uid, useToast } from "../ui/common";

const SKILLS = ["媒介策划", "客户沟通", "数据分析", "创意提案"];

interface Props { tasks: Task[]; payments: Payment[]; pitches: Pitch[]; reload: () => Promise<void> }

export default function Growth(props: Props) {
  const { show, node } = useToast();
  const [aars, setAars] = useState<Aar[]>([]);
  const [lessons, setLessons] = useState("");
  const [skills, setSkills] = useState<Record<string, number>>({});

  useEffect(() => {
    void (async () => {
      setAars((await db.getAll<Aar>("aars")).filter((a) => !a.deletedAt).sort((a, b) => b.createdAt - a.createdAt));
      setSkills(await db.getSetting<Record<string, number>>("skills", { 媒介策划: 2, 客户沟通: 2, 数据分析: 1, 创意提案: 2 }));
    })();
  }, []);

  const doneTasks = props.tasks.filter((t) => !t.deletedAt && t.kanbanCol === "完成").length;
  const received = props.payments.filter((p) => !p.deletedAt && p.status === "已收").reduce((s, p) => s + p.amount, 0);
  const decided = props.pitches.filter((p) => !p.deletedAt && p.result !== "待定");
  const win = decided.length ? Math.round((decided.filter((p) => p.result === "胜").length / decided.length) * 100) : null;
  const week = `第 ${Math.ceil(((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)} 周`;

  async function saveAar() {
    if (!lessons.trim()) { show("经验总结必填"); return; }
    await db.put("aars", {
      id: uid("aar"), period: week,
      stats: `完成任务 ${doneTasks};已收回款 ${money(received)};比稿胜率 ${win ?? "—"}%`,
      lessons: lessons.trim(), createdAt: Date.now(),
    }, "保存 AAR 周复盘(自动预填数据)");
    setLessons("");
    setAars((await db.getAll<Aar>("aars")).filter((a) => !a.deletedAt).sort((a, b) => b.createdAt - a.createdAt));
    show("复盘已保存");
  }

  async function setSkill(name: string, level: number) {
    const next = { ...skills, [name]: level };
    setSkills(next);
    await db.setSetting("skills", next);
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>个人成长规划</h1><div className="date">{week} · AAR 自动预填真实数据,你只写原因与经验 · IDP/职业锚属 P2 扩展</div></div>
      </div>

      <div className="grid-c">
        <div className="card card-pad">
          <div className="h-row"><span className="h-title sm">AAR 周复盘(数据自动预填)</span><Chip kind="data" style={{ marginLeft: "auto" }}>四步法 · 第3/4步手填</Chip></div>
          <div className="alert-line"><span className="txt">回顾目标 · 评估结果(自动)</span><span className="amt num">完成任务 {doneTasks}</span></div>
          <div className="alert-line"><span className="txt">经营数据(自动)</span><span className="amt num">已收 {money(received)}</span></div>
          <div className="alert-line"><span className="txt">比稿成功率(自动)</span><span className="amt num">{win === null ? "—" : win + "%"}</span></div>
          <Field label="分析原因 + 总结经验(手填)">
            <textarea className="inp" rows={3} style={{ width: "100%" }} value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="什么做得好?什么没做成?下一步改什么?" />
          </Field>
          <Btn kind="primary" onClick={() => { void saveAar(); }}>保存本周复盘</Btn>

          <div className="h-row" style={{ marginTop: 18 }}><span className="h-title sm">历史复盘</span></div>
          {aars.map((a) => (
            <div key={a.id} style={{ borderBottom: "1px solid var(--border-soft)", padding: "8px 0" }}>
              <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{a.period} <Chip gray style={{ marginLeft: 6 }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : ""}</Chip></div>
              <div className="cell-sub">{a.stats}</div>
              <div style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>{a.lessons}</div>
            </div>
          ))}
          {aars.length === 0 ? <p className="muted">暂无复盘记录</p> : null}
        </div>

        <div className="side-stack">
          <div className="card card-pad">
            <div className="h-row"><span className="h-title sm">能力素质自评</span><Chip gray style={{ marginLeft: "auto" }}>初学者→专家 四级</Chip></div>
            {SKILLS.map((s) => (
              <div className="alert-line" key={s}>
                <span className="txt">{s}</span>
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {[1, 2, 3, 4].map((lv) => (
                    <button key={lv} className={"btn " + ((skills[s] ?? 0) >= lv ? "data" : "done")} style={{ minWidth: 30, minHeight: 30 }}
                      onClick={() => { void setSkill(s, lv); }}>{lv}</button>
                  ))}
                </span>
              </div>
            ))}
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>1 初学者 · 2 经验者 · 3 精通者 · 4 专家</p>
          </div>
          <div className="card card-pad">
            <div className="h-row"><span className="h-title sm">70-20-10 学习分布</span></div>
            <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
              实战(任务/项目)与向他人学习(复盘)已由工作数据覆盖;课程/阅读追踪接入知识库后自动统计(属 P2)。
            </p>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}
