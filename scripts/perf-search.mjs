/** 1 万条中文文档搜索压测:索引构建 + 查询延迟 */
import MiniSearch from "minisearch";
function tokenize(text) {
  const out = [];
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) out.push(w);
  for (const run of text.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}
const docs = Array.from({ length: 10000 }, (_, i) => ({
  id: "d" + i, type: "客户", title: "测试客户集团第" + i + "号", sub: "行业" + (i % 12) + " 备注" + i,
}));
const t0 = performance.now();
const mini = new MiniSearch({ fields: ["title", "sub"], storeFields: ["type", "title", "sub"], tokenize, searchOptions: { tokenize } });
mini.addAll(docs);
const t1 = performance.now();
const qs = ["测试客户集团第50", "行业3 备注", "集团第9", "备注123"];
let maxMs = 0;
for (const q of qs) {
  const s = performance.now();
  const res = mini.search(q);
  const ms = performance.now() - s;
  maxMs = Math.max(maxMs, ms);
  console.log(`查询 "${q}" -> ${res.length} 条, ${ms.toFixed(1)}ms`);
}
console.log(`索引构建: ${(t1 - t0).toFixed(0)}ms | 最大查询延迟: ${maxMs.toFixed(1)}ms | 预算 200ms: ${maxMs < 200 ? "达标" : "超标"}`);
