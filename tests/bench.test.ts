import "fake-indexeddb/auto";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

const KEY_B64 = randomBytes(32).toString("base64");

describe("导入写入性能基准(加密开启)", () => {
  it("千行 putMany ≤5s;实测 1 万行耗时", async () => {
    const vault = await import("../src/core/vault");
    await vault.initVaultWithRawKey(KEY_B64);
    const { db } = await import("../src/db/db");
    const mk = (n: number, tag: string) =>
      Array.from({ length: n }, (_, i) => ({ id: "b-" + tag + "-" + i, name: "基准客户" + tag + "-" + i, industry: "美妆", grade: "B" as const }));
    // 千行预算断言(需求 8.1-8:千行导入 ≤5s)
    const t1 = Date.now();
    await db.putMany("customers", mk(1000, "k"));
    const dur1k = Date.now() - t1;
    expect(dur1k).toBeLessThan(5000);
    // 1 万条全量实测(9×1000 + 1×1000)
    const t2 = Date.now();
    for (let c = 0; c < 9; c++) await db.putMany("customers", mk(1000, "w" + c));
    await db.putMany("customers", mk(1000, "w9"));
    const dur10k = Date.now() - t2;
    console.log("[bench] putMany 1000 rows:", dur1k, "ms | 10000 rows:", dur10k, "ms");
    const all = await db.getAll("customers");
    expect(all.length).toBe(11000);
  }, 120000);
});