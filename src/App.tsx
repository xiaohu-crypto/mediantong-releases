import { useCallback, useEffect, useState } from "react";
import { db } from "./db/db";
import { seedIfEmpty } from "./data/seed";
import { seedExtraIfEmpty } from "./data/seed2";
import { rebuildIndex, type SearchDoc } from "./core/search";
import type { Aar, Baseline, Contact, ContactPoint, Contract, Customer, Deal, Milestone, MediaResource, Note, Objective, Payment, Pitch, PostBuy, RateCard, Rel, ScheduleItem, Supplier, Task } from "./types";
import Today from "./pages/Today";
import CRM from "./pages/CRM";
import Work from "./pages/Work";
import Dev from "./pages/Dev";
import Media from "./pages/Media";
import Kb from "./pages/Kb";
import Data from "./pages/Data";
import Growth from "./pages/Growth";
import SettingsPage from "./pages/Settings";
import QuickCapture from "./components/QuickCapture";
import TopSearch from "./components/TopSearch";
import Onboarding from "./components/Onboarding";
import {
  IconHome, IconPlus, IconUsers, IconTask, IconKb, IconFunnel,
  IconMedia, IconChart, IconGrowth, IconSettings, IconMoon, IconSun,
} from "./components/icons";

declare global {
  interface Window {
    mta?: {
      onQuickCapture: (cb: () => void) => void;
      setLoginItem: (open: boolean) => Promise<boolean>;
      getLoginItem: () => Promise<boolean>;
      aiSaveKey: (plain: string) => Promise<{ enc?: string; plain?: string }>;
      aiLoadKey: (rec: { enc?: string; plain?: string }) => Promise<string>;
      aiChat: (args: { baseUrl: string; apiKey: string; model: string; messages: { role: string; content: string }[] }) =>
        Promise<{ ok: boolean; content?: string; error?: string; status?: number; usage?: { total_tokens?: number } }>;
    };
  }
}

interface DataSet {
  customers: Customer[]; contacts: Contact[]; rels: Rel[]; deals: Deal[];
  contracts: Contract[]; payments: Payment[]; tasks: Task[];
  objectives: Objective[]; cps: ContactPoint[]; milestones: Milestone[];
  pitches: Pitch[]; suppliers: Supplier[]; resources: MediaResource[];
  ratecards: RateCard[]; items: ScheduleItem[]; postbuys: PostBuy[];
  notes: Note[]; baselines: Baseline[]; aars: Aar[];
}

type View = "today" | "crm" | "work" | "dev" | "media" | "kb" | "data" | "growth" | "settings";

const NAV: { key: View; label: string; icon: (p: { size?: number }) => JSX.Element; group: string }[] = [
  { key: "today", label: "今日驾驶舱", icon: IconHome, group: "工作区" },
  { key: "crm", label: "CRM 客户管理", icon: IconUsers, group: "八大模块" },
  { key: "work", label: "工作管理系统", icon: IconTask, group: "八大模块" },
  { key: "dev", label: "客户开发系统", icon: IconFunnel, group: "八大模块" },
  { key: "media", label: "媒介策略中心", icon: IconMedia, group: "八大模块" },
  { key: "kb", label: "知识学习系统", icon: IconKb, group: "八大模块" },
  { key: "data", label: "数据分析报表", icon: IconChart, group: "八大模块" },
  { key: "growth", label: "个人成长规划", icon: IconGrowth, group: "八大模块" },
  { key: "settings", label: "系统管理", icon: IconSettings, group: "系统" },
];

async function loadAll(): Promise<DataSet> {
  const alive = async <T extends { deletedAt?: number }>(store: Parameters<typeof db.getAll>[0]) =>
    ((await db.getAll(store)) as T[]).filter((r) => !r.deletedAt);
  return {
    customers: await alive<Customer>("customers"),
    contacts: await alive<Contact>("contacts"),
    rels: await alive<Rel>("customerContactRels"),
    deals: await alive<Deal>("deals"),
    contracts: await alive<Contract>("contracts"),
    payments: await alive<Payment>("payments"),
    tasks: await alive<Task>("tasks"),
    objectives: await db.getAll<Objective>("objectives"),
    cps: await alive<ContactPoint>("contactPoints"),
    milestones: await db.getSetting<Milestone[]>("milestones", []),
    pitches: await alive<Pitch>("pitches"),
    suppliers: await alive<Supplier>("suppliers"),
    resources: await alive<MediaResource>("resources"),
    ratecards: await alive<RateCard>("ratecards"),
    items: await alive<ScheduleItem>("scheduleItems"),
    postbuys: await alive<PostBuy>("postbuys"),
    notes: await alive<Note>("notes"),
    baselines: await alive<Baseline>("baselines"),
    aars: await alive<Aar>("aars"),
  };
}

export default function App() {
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<DataSet | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [focusCid, setFocusCid] = useState<string | null>(null);
  const [kbFocus, setKbFocus] = useState<string | null>(null);

  const reload = useCallback(async () => { setData(await loadAll()); }, []);

  useEffect(() => {
    void (async () => {
      const onboarded = await db.getSetting<boolean>("onboarded", false);
      const cs = await db.getAll<Customer>("customers");
      if (!onboarded && cs.length === 0) { setShowOnboard(true); }
      else { await seedIfEmpty(); await seedExtraIfEmpty(); }
      await reload();
      const t = await db.getSetting<"dark" | "light">("theme", "dark");
      setTheme(t);
      document.documentElement.setAttribute("data-theme", t);
    })();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowQuick(true); }
    };
    window.addEventListener("keydown", onKey);
    if (window.mta) window.mta.onQuickCapture(() => setShowQuick(true));
    return () => window.removeEventListener("keydown", onKey);
  }, [reload]);

  /* 数据变化 → 重建搜索索引 */
  useEffect(() => {
    if (!data) return;
    const docs: SearchDoc[] = [
      ...data.customers.map((c) => ({ id: c.id, type: "客户", title: c.name, sub: c.industry, refId: c.id })),
      ...data.contacts.map((c) => ({ id: c.id, type: "联系人", title: c.name, sub: c.title ?? "", refId: c.orgCustomerId ?? c.id })),
      ...data.deals.map((d) => ({ id: d.id, type: "商机", title: d.title, sub: d.stage, refId: d.customerId })),
      ...data.tasks.map((t) => ({ id: t.id, type: "任务", title: t.title, sub: t.kanbanCol })),
      ...data.notes.map((n) => ({ id: n.id, type: "笔记", title: n.title, sub: n.tags.map((x) => "#" + x).join(" ") })),
    ];
    rebuildIndex(docs);
  }, [data]);

  function switchTheme(t: "dark" | "light") {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    void db.setSetting("theme", t);
  }

  function goCrm(customerId: string) { setFocusCid(customerId); setView("crm"); }

  function onSearchSelect(doc: SearchDoc) {
    if (doc.type === "客户") goCrm(doc.id);
    else if (doc.type === "商机" || doc.type === "联系人") goCrm(doc.refId ?? doc.id);
    else if (doc.type === "任务") setView("work");
    else if (doc.type === "笔记") { setKbFocus(doc.id); setView("kb"); }
  }

  const crumb = NAV.find((n) => n.key === view)?.label ?? "媒电通工作台";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><IconHome size={17} /></div>
          <div>
            <div className="brand-name">媒电通工作台</div>
            <div className="brand-sub">MediaDesk · P0-P2</div>
          </div>
        </div>
        <nav className="nav">
          {["工作区", "八大模块", "系统"].map((group) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {NAV.filter((n) => n.group === group).map((n) => (
                <div key={n.key} className={"nav-item" + (view === n.key ? " active" : "")}
                  onClick={() => { setView(n.key); if (n.key === "crm") setFocusCid(null); if (n.key === "kb") setKbFocus(null); }}>
                  <n.icon size={16} />
                  <span className="ni-label">{n.label}</span>
                </div>
              ))}
              {group === "工作区" ? <div className="nav-sep" /> : null}
            </div>
          ))}
          <div className="nav-item" onClick={() => setShowQuick(true)}>
            <IconPlus size={16} /><span className="ni-label">快速采集 (Ctrl+K)</span>
          </div>
        </nav>
        <div className="nav-foot"><span className="dot" /><span>本地存储 · AI 本地/云融合(P2)</span></div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">媒电通工作台 › <b>{crumb}</b></div>
          <TopSearch onSelect={onSearchSelect} />
          <div className="tb-right">
            <button className="btn primary" onClick={() => setShowQuick(true)}><IconPlus size={14} /> 快速采集</button>
            <button className="icon-btn" title="切换主题" onClick={() => switchTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
            </button>
          </div>
        </header>

        <main className="content">
          {view === "today" && data ? (
            <Today customers={data.customers} deals={data.deals} payments={data.payments} cps={data.cps}
              objectives={data.objectives} tasks={data.tasks} milestones={data.milestones}
              reload={reload} openQuick={() => setShowQuick(true)} goCrm={goCrm} />
          ) : null}
          {view === "crm" && data ? (
            <CRM customers={data.customers} contacts={data.contacts} rels={data.rels} deals={data.deals}
              contracts={data.contracts} payments={data.payments} cps={data.cps} tasks={data.tasks}
              reload={reload} focusCustomerId={focusCid} />
          ) : null}
          {view === "work" && data ? (
            <Work tasks={data.tasks} objectives={data.objectives} customers={data.customers} reload={reload} />
          ) : null}
          {view === "dev" && data ? (
            <Dev deals={data.deals} customers={data.customers} pitches={data.pitches} reload={reload} />
          ) : null}
          {view === "media" && data ? (
            <Media suppliers={data.suppliers} resources={data.resources} ratecards={data.ratecards}
              items={data.items} postbuys={data.postbuys} customers={data.customers} reload={reload} />
          ) : null}
          {view === "kb" && data ? (
            <Kb notes={data.notes} reload={reload} focusId={kbFocus} />
          ) : null}
          {view === "data" && data ? (
            <Data contracts={data.contracts} payments={data.payments} deals={data.deals} items={data.items} baselines={data.baselines} reload={reload} />
          ) : null}
          {view === "growth" && data ? (
            <Growth tasks={data.tasks} payments={data.payments} pitches={data.pitches} reload={reload} />
          ) : null}
          {view === "settings" ? (
            <SettingsPage theme={theme} setTheme={switchTheme} reload={reload}
              customers={data?.customers ?? []} notes={data?.notes ?? []} />
          ) : null}
          {!data ? <p className="muted" style={{ padding: 24 }}>正在加载数据…</p> : null}
        </main>
      </div>

      <QuickCapture open={showQuick} onClose={() => setShowQuick(false)} reload={reload} customers={data?.customers ?? []} />
      {showOnboard ? (
        <Onboarding onDone={async () => { setShowOnboard(false); await seedIfEmpty(); await seedExtraIfEmpty(); await reload(); }} />
      ) : null}
    </div>
  );
}
