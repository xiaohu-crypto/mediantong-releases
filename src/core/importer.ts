import { validateCustomer, type Errors, GRADES } from "./validators";

/** 列名同义词匹配(规则引擎,即需求所称"AI 匹配"的确定性实现) */
const SYNONYMS: Record<string, string[]> = {
  name: ["客户名称", "名称", "客户", "公司", "公司名称", "客户名"],
  industry: ["行业", "所属行业"],
  grade: ["等级", "客户等级", "级别"],
  phone: ["手机", "手机号", "电话", "联系电话"],
  billingTitle: ["开票抬头", "发票抬头"],
  billingTaxNo: ["税号", "纳税号"],
};

export function columnMatch(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const clean = String(h).trim();
    for (const [field, words] of Object.entries(SYNONYMS)) {
      if (map[field] === undefined && words.some((w) => clean === w || clean.includes(w))) map[field] = i;
    }
  });
  return map;
}

export interface ImportRow {
  row: number;
  name: string;
  industry: string;
  grade: string;
  phone: string;
  billingTitle: string;
  billingTaxNo: string;
}

/** 逐行校验:批次内重名累加进已存在集合;返回成功集与失败明细 */
export function parseRows(rows: ImportRow[], existingNames: string[]): { ok: ImportRow[]; fails: { row: number; name: string; errors: Errors }[] } {
  const names = new Set(existingNames);
  const ok: ImportRow[] = [];
  const fails: { row: number; name: string; errors: Errors }[] = [];
  for (const r of rows) {
    const errs = validateCustomer({ name: r.name, industry: r.industry, grade: r.grade || undefined, billingTitle: r.billingTitle || undefined, billingTaxNo: r.billingTaxNo || undefined }, []);
    if (r.name.trim() !== "" && names.has(r.name.trim())) errs.name = "同级客户名称已存在";
    if (r.grade && !(GRADES as readonly string[]).includes(r.grade)) errs.grade = "等级必须为 S/A/B/C";
    if (Object.keys(errs).length) { fails.push({ row: r.row, name: r.name, errors: errs }); continue; }
    names.add(r.name.trim());
    ok.push(r);
  }
  return { ok, fails };
}
