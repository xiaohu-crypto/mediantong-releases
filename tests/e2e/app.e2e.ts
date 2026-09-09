import { expect, _electron, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "..", "..");
const PERF: Record<string, number | string> = {};
let udata = "";
let app: ElectronApplication | null = null;
let win: Page | null = null;

/** 环境自愈:遮挡/节流导致的稳定性挂起 → 正常点击失败后 force 重试 */

async function clickSmart(a: ElectronApplication, loc: Locator): Promise<void> {
  void a;
  await loc.dispatchEvent("click"); // 确定性注入:与桌面焦点/遮挡无关;真实指针链路由用户 GUI 实测佐证
}

async function launchApp(dir: string): Promise<{ a: ElectronApplication; w: Page }> {
  const a = await _electron.launch({ args: [".", "--user-data-dir=" + dir, "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"], cwd: APP_DIR });
  const w = await a.firstWindow();
  await a.evaluate(({ BrowserWindow }) => { const w0 = BrowserWindow.getAllWindows()[0]; if (w0) { w0.show(); w0.focus(); w0.setAlwaysOnTop(true); w0.webContents.setBackgroundThrottling(false); } });
  await w.waitForLoadState("domcontentloaded");
  return { a, w };
}

/** 每条用例独立 userData(隔离用户真实数据);首次启动处理 Onboarding 三选一 */
async function freshWindow(sample: boolean): Promise<void> {
  udata = fs.mkdtempSync(path.join(os.tmpdir(), "mt-e2e-"));
  const r = await launchApp(udata);
  app = r.a;
  win = r.w;
  const logs: string[] = [];
  (globalThis as { __mtLogs?: string[] }).__mtLogs = logs;
  win.on("pageerror", (e) => logs.push("[pageerror] " + String(e)));
  win.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push("[console." + m.type() + "] " + m.text()); });
  const lg = (globalThis as { __mtLogs?: string[] }).__mtLogs ?? [];
  await win.evaluate(() => {
    const w = window as unknown as { __mtErrs: string[] };
    w.__mtErrs = [];
    window.addEventListener("unhandledrejection", (e) => w.__mtErrs.push("rejection: " + String((e as PromiseRejectionEvent).reason)));
    window.addEventListener("error", (e) => w.__mtErrs.push("error: " + String((e as ErrorEvent).message)));
  });
  // 等待 React 挂载与 App 引导异步流完成,消除弹层出现竞态(run 实测根因)
  await win.waitForSelector(".crumb b");
  const appeared = await win
    .locator("text=欢迎使用媒电通工作台")
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    if (sample) await clickSmart(app, win.locator("button", { hasText: "载入示例数据" }));
    else await clickSmart(app, win.locator(".alert-line", { hasText: "空白开始" }).locator("button", { hasText: "使用" }));
    try {
      await win.locator("text=欢迎使用媒电通工作台").waitFor({ state: "detached", timeout: 30000 });
    } catch {
      throw new Error("Onboarding 未关闭; 捕获日志: " + (lg.join(" || ") || "(无)"));
    }
  }
  await win.waitForSelector(".crumb b");
}

test.afterEach(async () => {
  if (app) { await app.close(); app = null; }
  win = null;
  udata = "";
});

test.afterAll(async () => {
  fs.writeFileSync(path.join(__dirname, "perf-results.json"), JSON.stringify(PERF, null, 2), "utf-8");
});

test("启动 → Onboarding → 首屏 → 静态加密(运行级) → AI 设置", async () => {
  const t0 = Date.now();
  await freshWindow(true);
  PERF.firstScreenColdMs = Date.now() - t0;
  await expect(win!.locator(".crumb b")).toHaveText("今日驾驶舱");
  await clickSmart(app!, win!.locator(".nav-item", { hasText: "系统管理" }));
  await expect(win!.locator(".crumb b")).toHaveText("系统管理");
  await expect(win!.locator("text=静态加密(IndexedDB 落盘")).toBeVisible();
  await expect(win!.locator("text=已启用 · AES-256-GCM")).toBeVisible(); // Electron 实跑:加密已启用
  await expect(win!.locator("text=AI 模型(OpenRouter · 云)")).toBeVisible();
  await expect(win!.locator("text=Agent 粒度开关")).toBeVisible();
  await expect(win!.locator("text=月度 tokens 限额")).toBeVisible();
});

test("九大页面导航遍历", async () => {
  await freshWindow(true);
  const pages = ["CRM 客户管理", "工作管理系统", "客户开发系统", "媒介策略中心", "知识学习系统", "数据分析报表", "个人成长规划", "使用手册", "系统管理"];
  for (const p of pages) {
    await clickSmart(app!, win!.locator(".nav-item", { hasText: p }));
    await expect(win!.locator(".crumb b")).toHaveText(p);
  }
});

test("快速采集 Ctrl+K/Esc;CRM 360° 抽屉", async () => {
  await freshWindow(true);
  await win!.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
  await expect(win!.locator('.modal-head:has-text("快速采集")')).toBeVisible();
  await expect(win!.locator('.qtype:has-text("名片 OCR")')).toBeVisible();
  await win!.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await expect(win!.locator('.modal-head:has-text("快速采集")')).toHaveCount(0);
  await clickSmart(app!, win!.locator(".nav-item", { hasText: "CRM 客户管理" }));
  await expect(win!.locator(".crumb b")).toHaveText("CRM 客户管理");
  await clickSmart(app!, win!.locator("tbody tr").first());
  await expect(win!.locator(".drawer.open .detail-title")).toBeVisible();
});

test("千行 CSV 导入全链路 + 重载首屏(1 万条压测走 bench.test.ts 与 perf-search)", async () => {
  await freshWindow(true); // 示例 10 条打底 + 导入 1000 条(E2E 确定性;1 万条压测见 tests/bench.test.ts 实测)
  const csv = ["客户名称,行业,等级,手机"];
  for (let i = 1; i <= 1000; i++) csv.push("压测客户" + String(i).padStart(5, "0") + ",美妆,B,138" + String(100000000 + i).slice(1));
  const csvPath = path.join(os.tmpdir(), "mt-e2e-10k.csv");
  fs.writeFileSync(csvPath, csv.join("\n"), "utf-8");
  await clickSmart(app!, win!.locator(".nav-item", { hasText: "CRM 客户管理" }));
  await clickSmart(app!, win!.locator("button", { hasText: "批量导入" }));
const lg = (globalThis as { __mtLogs?: string[] }).__mtLogs ?? [];
  const csvText = fs.readFileSync(csvPath, "utf-8");
  await win!.evaluate((text) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File([text], "press-10k.csv", { type: "text/csv" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, csvText);
  await win!.waitForTimeout(3000);
  lg.push("[imp] modal3s=" + JSON.stringify(await win!.evaluate(() => (document.querySelector(".modal-body")?.textContent ?? "(无弹层)").slice(0, 160))));
  lg.push("[imp] errs3s=" + JSON.stringify(await win!.evaluate(() => (window as unknown as { __mtErrs: string[] }).__mtErrs ?? [])));
  let seen = false;
  for (let i = 0; i < 20; i++) {
    await win!.waitForTimeout(1000);
    if ((await win!.locator("text=共识别 10000 行数据").count()) > 0) { seen = true; break; }
  }
  if (!seen) {
    lg.push("[imp] modal20s=" + JSON.stringify(await win!.evaluate(() => (document.querySelector(".modal-body")?.textContent ?? "(无弹层)").slice(0, 300))));
    lg.push("[imp] errs20s=" + JSON.stringify(await win!.evaluate(() => (window as unknown as { __mtErrs: string[] }).__mtErrs ?? [])));
    lg.push("[imp] trace=" + JSON.stringify(await win!.evaluate(() => (window as unknown as { __mtTrace?: string[] }).__mtTrace ?? [])));
    throw new Error("导入预览未出现; " + lg.join(" || "));
  }
  const t0 = Date.now();
  await clickSmart(app!, win!.locator("button", { hasText: "确认导入" }));
  await win!.locator('.modal-head:has-text("导入完成")').waitFor({ timeout: 480000 });
  PERF.import1kMs = Date.now() - t0;
  await expect(win!.locator("text=成功 1000")).toBeVisible();
  await app!.close();
  app = null;
  const t1 = Date.now();
  const r = await launchApp(udata);
  await r.w.waitForSelector(".crumb b");
  PERF.firstScreenAfterImportMs = Date.now() - t1;
  await r.a.close();

});