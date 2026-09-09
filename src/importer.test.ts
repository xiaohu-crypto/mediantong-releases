import { describe, expect, it } from "vitest";
import { columnMatch, parseRows, type ImportRow } from "../src/core/importer";

describe("导入管线", () => {
  it("列名同义词匹配", () => {
    const m = columnMatch(["序号", "客户名称", "所属行业", "等级", "联系电话"]);
    expect(m.name).toBe(1);
    expect(m.industry).toBe(2);
    expect(m.grade).toBe(3);
    expect(m.phone).toBe(4);
  });
  it("批次内重名校验累加", () => {
    const rows: ImportRow[] = [
      { row: 1, name: "客户A", industry: "互联网", grade: "A", phone: "", billingTitle: "", billingTaxNo: "" },
      { row: 2, name: "客户A", industry: "互联网", grade: "A", phone: "", billingTitle: "", billingTaxNo: "" },
    ];
    const r = parseRows(rows, []);
    expect(r.ok.length).toBe(1);
    expect(r.fails[0].errors.name).toBeTruthy();
  });
  it("1000 行解析+校验 ≤ 5s(性能预算)", () => {
    const rows: ImportRow[] = Array.from({ length: 1000 }, (_, i) => ({
      row: i + 1, name: "批量客户" + i, industry: "测试", grade: ["S", "A", "B", "C"][i % 4],
      phone: "", billingTitle: "", billingTaxNo: "",
    }));
    const t0 = Date.now();
    const r = parseRows(rows, []);
    const cost = Date.now() - t0;
    expect(r.ok.length).toBe(1000);
    expect(cost).toBeLessThan(5000);
  });
});
