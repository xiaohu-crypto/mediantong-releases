import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, safeStorage, dialog } from "electron";
import { mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import path2 from "node:path";
import path from "node:path";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    backgroundColor: "#0E0F13",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  win.on("closed", () => { win = null; });
}

/** 16x16 品牌红方块托盘图标(占位,非美术资源) */
function trayIcon() {
  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKUlEQVQ4y2Nk+M/wn4EIwESMolGFGJgwUa0QI1u0WRgnmmhSCMY6U2pqAABbFQYEmf3FkAAAAABJRU5ErkJggg=="
  );
}

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip("媒电通工作台");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => win?.show() },
    { label: "快速采集 (Ctrl+K)", click: () => win?.webContents.send("open-quick-capture") },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]));

  globalShortcut.register("CommandOrControl+K", () => {
    if (win) { win.show(); win.webContents.send("open-quick-capture"); }
  });

  ipcMain.handle("login-item:set", (_e, open: boolean) => {
    app.setLoginItemSettings({ openAtLogin: open });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("login-item:get", () => app.getLoginItemSettings().openAtLogin);

  // ===== AI:密钥加密存储(safeStorage)+ 云调用代理(主进程无 CORS) =====
  ipcMain.handle("ai:saveKey", (_e, plain: string) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return { enc: safeStorage.encryptString(plain).toString("base64") };
      }
      return { plain };
    } catch { return { plain }; }
  });
  ipcMain.handle("ai:loadKey", (_e, rec: { enc?: string; plain?: string }) => {
    try {
      if (rec.enc) return safeStorage.decryptString(Buffer.from(rec.enc, "base64"));
      return rec.plain ?? "";
    } catch { return ""; }
  });
  ipcMain.handle("ai:chat", async (_e, args: { baseUrl: string; apiKey: string; model: string; messages: { role: string; content: string }[] }) => {
    const url = args.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + args.apiKey },
        body: JSON.stringify({ model: args.model, messages: args.messages, temperature: 0.7 }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 300) };
      const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
      return { ok: true, content: data.choices?.[0]?.message?.content ?? "", usage: data.usage };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
});


// Backup: write payload to dir and rotate, keep newest N
ipcMain.handle("backup:pickDir", async () => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("backup:write", async (_e, args: { dir: string; content: string; keep: number }) => {
  try {
    await mkdir(args.dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const file = path2.join(args.dir, "backup-" + ts + ".json");
    await writeFile(file, args.content, "utf-8");
    const files = (await readdir(args.dir)).filter((f) => f.startsWith("backup-") && f.endsWith(".json")).sort().reverse();
    let removed = 0;
    for (const f of files.slice(Math.max(1, args.keep))) { await unlink(path2.join(args.dir, f)); removed++; }
    return { ok: true, file, removed };
  } catch (e) { return { ok: false, error: String(e) }; }
});
app.on("window-all-closed", () => {
  // 托盘常驻:不退出,仅隐藏窗口语义;真正退出走托盘菜单
});
app.on("will-quit", () => globalShortcut.unregisterAll());
