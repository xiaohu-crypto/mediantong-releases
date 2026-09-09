/** 校验引擎:纯函数,规则来自需求文档 2.4 */

export const DEAL_STAGES = ["线索", "MQL", "SQL", "商机", "报价", "谈判", "签约", "输单", "流失"] as const;
export const GRADES = ["S", "A", "B", "C"] as const;
export const REL_ROLES = ["决策人DM", "影响者", "使用者", "把关人", "审批人"] as const;

export type Errors = Record<string, string>;

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

function amountOk(v: unknown): boolean {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return false;
  // 允许 ≤2 位小数
  return Math.round(v * 100) === v * 100;
}

export interface CustomerInput {
  id?: string;
  name: string;
  industry?: string;
  grade?: string;
  parentId?: string | null;
  billingTitle?: string;
  billingTaxNo?: string;
}

export function validateCustomer(c: CustomerInput, existingNames: string[]): Errors {
  const e: Errors = {};
  if (isBlank(c.name)) e.name = "客户名称必填";
  else if (existingNames.includes(c.name.trim())) e.name = "同级客户名称已存在";
  if (c.grade && !(GRADES as readonly string[]).includes(c.grade)) e.grade = "等级必须为 S/A/B/C";
  if (c.billingTaxNo && !/^[A-Z0-9]{15,20}$/.test(c.billingTaxNo)) e.billingTaxNo = "税号应为 15-20 位字母数字";
  return e;
}

export function validateContact(c: { name?: string; phone?: string; employmentStatus?: string }): Errors {
  const e: Errors = {};
  if (isBlank(c.name)) e.name = "联系人姓名必填";
  if (!isBlank(c.phone) && !/^1\d{10}$/.test(String(c.phone))) e.phone = "手机号应为 11 位且以 1 开头";
  return e;
}

export interface DealInput {
  title?: string;
  customerId?: string;
  stage?: string;
  value?: number;
  probability?: number;
}

export function validateDeal(d: DealInput): Errors {
  const e: Errors = {};
  if (isBlank(d.title)) e.title = "商机名称必填";
  if (isBlank(d.customerId)) e.customerId = "必须关联客户";
  if (d.stage && !(DEAL_STAGES as readonly string[]).includes(d.stage)) e.stage = "阶段不在枚举白名单";
  if (d.value !== undefined && !amountOk(d.value)) e.value = "金额必须大于 0 且不超过两位小数";
  if (d.probability !== undefined && (d.probability < 0 || d.probability > 1)) e.probability = "概率应在 0-1 之间";
  return e;
}

export function validatePayment(p: { amount?: number; dueDate?: string }): Errors {
  const e: Errors = {};
  if (!amountOk(p.amount)) e.amount = "金额必须大于 0 且不超过两位小数";
  if (isBlank(p.dueDate)) e.dueDate = "到期日必填";
  return e;
}
