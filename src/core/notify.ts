import { db } from "../db/db";

export interface Dnd { enabled: boolean; start: string; end: string } // "22:00" / "08:00"

export async function getDnd(): Promise<Dnd> {
  return db.getSetting<Dnd>("dnd", { enabled: false, start: "22:00", end: "08:00" });
}

function inDnd(dnd: Dnd, now = new Date()): boolean {
  if (!dnd.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = dnd.start.split(":").map(Number);
  const [eh, em] = dnd.end.split(":").map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  if (s === e) return true;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export async function maybeNotify(title: string, body: string): Promise<"sent" | "dnd" | "unsupported"> {
  const dnd = await getDnd();
  if (inDnd(dnd)) return "dnd";
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") {
    new Notification(title, { body, silent: true });
    return "sent";
  }
  if (Notification.permission !== "denied") {
    const p = await Notification.requestPermission();
    if (p === "granted") { new Notification(title, { body, silent: true }); return "sent"; }
  }
  return "unsupported";
}

/** 启动错过补发:距上次检查超 8 小时且有逾期回款 → 补一条汇总通知 */
export async function startupCatchUp(overdueCount: number): Promise<void> {
  const last = await db.getSetting<number>("lastNotifyCheck", 0);
  const now = Date.now();
  if (now - last < 8 * 3600000) return;
  await db.setSetting("lastNotifyCheck", now);
  if (overdueCount > 0) await maybeNotify("媒电通工作台 · 待办提醒", `有 ${overdueCount} 笔逾期回款未处理,点击进入今日驾驶舱查看。`);
}
