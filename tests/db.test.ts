import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openDB } from "idb";

const V1_STORES = ["meta","customers","contacts","customerContactRels","deals","contracts","payments","tasks","objectives","contactPoints","operationLogs","settings"];

/** 先造一个 v1 旧库(仅 12 仓),再让 db.ts 以 v2 打开 → 触发真实迁移 */
async function makeV1Db(): Promise<void> {
  const d = await openDB("meidiantong", 1, {
    upgrade(db) { for (const s of V1_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" }); },
  });
  await d.put("customers", { id: "c-old", name: "旧库客户" });
  d.close();
}

describe("db 存储层(含 v1→v2 迁移)", () => {
  it("v1 旧库升级到 v2:新仓可用且旧数据无损", async () => {
    await makeV1Db();
    const { db } = await import("../src/db/db");
    const pitches = await db.getAll("pitches");
    expect(Array.isArray(pitches)).toBe(true);
    const old = await db.getAll<{ id: string; name: string }>("customers");
    expect(old.map((x) => x.name)).toContain("旧库客户");
  });

  it("put/get/软删除/回收站/恢复", async () => {
    const { db } = await import("../src/db/db");
    await db.put("customers", { id: "c-1", name: "盛达集团", industry: "美妆", grade: "A" });
    const got = await db.get<{ id: string }>("customers", "c-1");
    expect(got?.id).toBe("c-1");
    await db.softDelete("customers", "c-1", "删除测试客户");
    const trashed = await db.listTrashed();
    expect(trashed.some((t) => t.id === "c-1")).toBe(true);
    await db.restore("customers", "c-1");
    expect((await db.listTrashed()).some((t) => t.id === "c-1")).toBe(false);
  });

  it("操作日志含 before 快照,undo 可回滚", async () => {
    const { db } = await import("../src/db/db");
    await db.put("customers", { id: "c-u", name: "撤销前" });
    await db.put("customers", { id: "c-u", name: "撤销后" }, "改名测试");
    const logs = await db.getAll<{ id: string; ts: number; before: unknown; entityType: string; entityId: string }>("operationLogs");
    const target = logs.filter((l) => l.entityType === "customers" && l.entityId === "c-u" && l.before).sort((a, b) => b.ts - a.ts)[0];
    expect(target).toBeTruthy();
    await db.undoLog(target.id);
    const after = await db.get<{ name: string }>("customers", "c-u");
    expect(after?.name).toBe("撤销前");
  });

  it("备份导出→恢复 往返一致", async () => {
    const { db } = await import("../src/db/db");
    await db.put("customers", { id: "c-r", name: "往返客户", industry: "测试", grade: "B" });
    const dump = await db.dumpAll();
    const copy = JSON.parse(JSON.stringify(dump));
    await db.clearAll();
    await db.restoreAll(copy);
    const back = await db.get<{ name: string }>("customers", "c-r");
    expect(back?.name).toBe("往返客户");
    const dump2 = await db.dumpAll();
    const row2 = (dump2.customers as { id: string }[]).find((x) => x.id === "c-r");
    const row1 = (copy.customers as { id: string }[]).find((x) => x.id === "c-r");
    expect(JSON.stringify(row2)).toBe(JSON.stringify(row1));
  });
});
