import { openDB, type IDBPDatabase } from "idb";

/** 仓库名清单(schema v1) */
export const STORES = [
  "meta", "customers", "contacts", "customerContactRels", "deals",
  "contracts", "payments", "tasks", "objectives", "contactPoints",
  "operationLogs", "settings",
  "pitches", "suppliers", "resources", "ratecards", "scheduleItems", "postbuys", "notes", "baselines", "aars",
] as const;

export type StoreName = (typeof STORES)[number];

export interface OpLog {
  id: string;
  ts: number;
  who: string;
  what: string;
  entityType: string;
  entityId: string;
  before: unknown | null;
}

const DB_NAME = "meidiantong";
const NEW_V2_STORES = ["pitches", "suppliers", "resources", "ratecards", "scheduleItems", "postbuys", "notes", "baselines", "aars"];
const SCHEMA_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

/** 幂等迁移表:up 仅在从 prevVersion 升级时执行 */
export const migrations: { version: number; up: (db: IDBPDatabase) => Promise<void> }[] = [
  {
    version: 1,
    up: async (db) => {
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    },
  },
  {
    version: 2,
    up: async (db) => {
      for (const s of NEW_V2_STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    },
  },
];

async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, SCHEMA_VERSION, {
      upgrade: async (db, oldVersion, _newVersion, tx) => {
        for (const m of migrations) {
          if (m.version > oldVersion) await m.up(db);
        }
        void tx;
      },
    });
  }
  return dbPromise;
}

function nowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const db = {
  async put<T extends { id: string }>(store: StoreName, value: T, logWhat?: string): Promise<T> {
    const d = await getDB();
    const before = await d.get(store, value.id);
    const rec = { ...value, updatedAt: Date.now() } as T & { updatedAt: number };
    await d.put(store, rec);
    if (logWhat) await log(d, store, value.id, logWhat, before ?? null);
    return rec;
  },

  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    const d = await getDB();
    return d.get(store, id) as Promise<T | undefined>;
  },

  async getAll<T>(store: StoreName): Promise<T[]> {
    const d = await getDB();
    return d.getAll(store) as Promise<T[]>;
  },

  /** 软删除:打 deletedAt 标记,主列表应过滤 */
  async softDelete(store: StoreName, id: string, what: string): Promise<void> {
    const d = await getDB();
    const rec = (await d.get(store, id)) as { id: string; deletedAt?: number } | undefined;
    if (!rec) return;
    const before = { ...rec };
    rec.deletedAt = Date.now();
    await d.put(store, rec);
    await log(d, store, id, what, before);
  },

  async restore(store: StoreName, id: string): Promise<void> {
    const d = await getDB();
    const rec = (await d.get(store, id)) as { deletedAt?: number } | undefined;
    if (!rec) return;
    delete rec.deletedAt;
    await d.put(store, rec);
  },

  async purge(store: StoreName, id: string): Promise<void> {
    const d = await getDB();
    await d.delete(store, id);
  },

  /** 回收站:全部仓中带 deletedAt 的记录 */
  async listTrashed(): Promise<{ store: StoreName; id: string; title: string; deletedAt: number }[]> {
    const d = await getDB();
    const out: { store: StoreName; id: string; title: string; deletedAt: number }[] = [];
    const titleFields = ["name", "title", "what"] as const;
    for (const s of STORES) {
      if (s === "meta" || s === "settings") continue;
      const rows = (await d.getAll(s)) as { id: string; deletedAt?: number }[];
      for (const r of rows) {
        if (r.deletedAt) {
          const any = r as unknown as Record<string, unknown>;
          const title = titleFields.map((f) => any[f]).find((v) => typeof v === "string") as string | undefined;
          out.push({ store: s, id: r.id, title: title ?? r.id, deletedAt: r.deletedAt });
        }
      }
    }
    return out;
  },

  async logOp(entry: Omit<OpLog, "id" | "ts" | "who"> & { who?: string }): Promise<void> {
    const d = await getDB();
    await d.put("operationLogs", { id: nowId(), ts: Date.now(), who: entry.who ?? "本地用户", ...entry });
  },

  /** 撤销:按日志 before 快照恢复实体 */
  async undoLog(logId: string): Promise<void> {
    const d = await getDB();
    const entry = (await d.get("operationLogs", logId)) as OpLog | undefined;
    if (!entry) throw new Error("日志不存在");
    if (!entry.before) throw new Error("该操作无回滚快照(新建操作请用删除)");
    await d.put(entry.entityType as StoreName, entry.before);
  },

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const d = await getDB();
    const rec = (await d.get("settings", key)) as { id: string; value: T } | undefined;
    return rec ? rec.value : fallback;
  },

  async setSetting<T>(key: string, value: T): Promise<void> {
    const d = await getDB();
    await d.put("settings", { id: key, value });
  },

  /** 备份导出:全部仓 JSON */
  async dumpAll(): Promise<Record<string, unknown[]>> {
    const d = await getDB();
    const out: Record<string, unknown[]> = {};
    for (const s of STORES) out[s] = await d.getAll(s);
    return out;
  },

  /** 恢复:逐仓覆盖 */
  async restoreAll(dump: Record<string, unknown[]>): Promise<void> {
    const d = await getDB();
    for (const s of STORES) {
      if (!dump[s]) continue;
      await d.clear(s);
      for (const row of dump[s]) await d.put(s, row);
    }
  },

  async clearAll(): Promise<void> {
    const d = await getDB();
    for (const s of STORES) await d.clear(s);
  },
};

async function log(d: IDBPDatabase, store: string, entityId: string, what: string, before: unknown): Promise<void> {
  await d.put("operationLogs", {
    id: nowId(), ts: Date.now(), who: "本地用户",
    what, entityType: store, entityId, before,
  });
}
