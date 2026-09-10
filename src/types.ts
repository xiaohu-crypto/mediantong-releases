export type DealStage = "线索" | "MQL" | "SQL" | "商机" | "报价" | "谈判" | "签约" | "输单" | "流失";
export type Grade = "S" | "A" | "B" | "C";
export type RelRole = "决策人DM" | "影响者" | "使用者" | "把关人" | "审批人";
export type KanbanCol = "待办" | "进行中" | "待审核" | "完成";

export interface Customer {
  id: string; name: string; industry: string; grade: Grade;
  parentId?: string | null; billingTitle?: string; billingTaxNo?: string;
  custom?: Record<string, unknown>;
  deletedAt?: number;
}
export interface Contact {
  id: string; name: string; phone?: string; wechat?: string; title?: string;
  orgCustomerId?: string; employmentStatus: "在职" | "离职" | "换岗";
  deletedAt?: number;
}
export interface Rel { id: string; contactId: string; customerId: string; role: RelRole; deletedAt?: number; }
export interface Deal {
  id: string; customerId: string; title: string; stage: DealStage;
  value: number; probability: number; lastTouchAt: number;
  custom?: Record<string, unknown>;
  meddic?: string[]; bant?: string[];
  closeDate?: string;
  deletedAt?: number;
}
export interface Contract { id: string; customerId: string; name: string; amount: number; signDate: string; status: string; deletedAt?: number; }
export interface Payment {
  id: string; contractId: string; customerId: string; amount: number;
  dueDate: string; paidDate?: string; status: "未到" | "已收" | "逾期" | "部分";
  deletedAt?: number;
}
export interface Task {
  id: string; title: string; type: "跟进" | "客户" | "想法" | "费用" | "任务";
  priority: "高" | "中" | "低"; due?: string; kanbanCol: KanbanCol;
  customerId?: string; amount?: number; deletedAt?: number;
}
export interface Objective { id: string; quarter: string; title: string; keyResults: { name: string; progress: number }[]; }
export interface ContactPoint { id: string; customerId: string; channel: "微信" | "拜访" | "电话" | "邮件"; time: number; summary: string; deletedAt?: number; }
export interface Milestone { name: string; date: string; }

/* ===== P1/P2 新增实体 ===== */
export interface Pitch {
  id: string; customerId?: string; name: string; date: string;
  investment: number; competitors: string;
  result: "胜" | "败" | "待定"; lossReason?: string; reviewNote?: string;
  deletedAt?: number;
}
export interface Supplier { id: string; name: string; type: "官方" | "代理" | "达人机构"; rebatePolicy?: string; intro?: string; contact?: string; deletedAt?: number; }
export interface PricePoint { name: string; city: string; form: string; size: string; qty: number; footfall: number; price: number; status: "可售" | "占用" | "锁位"; }
export interface MediaResource { id: string; name: string; type: string; supplierId: string; intro?: string; advantage?: string; cases?: string; places?: PricePoint[]; deletedAt?: number; }
export interface RateCard { id: string; resourceId: string; version: string; effectiveFrom: string; listPrice: number; deletedAt?: number; }
export interface ScheduleItem {
  id: string; customerId: string; name: string; resourceId: string;
  start: string; end: string; cost: number; sellPrice: number;
  rebate?: number; rebateSettled?: boolean; status: "已确认" | "待确认";
  deletedAt?: number;
}
export interface PostBuy {
  id: string; resourceId: string; month: string;
  actualImpression: number; cpm: number; roi: number;
  dataSource: "手动" | "CSV回填"; deletedAt?: number;
}
export interface Note {
  id: string; title: string; content: string; tags: string[];
  para: "Projects" | "Areas" | "Resources" | "Archives";
  versions: { ts: number; content: string }[];
  deletedAt?: number;
}
export interface Baseline { id: string; dimension: string; metric: string; value: string; source?: string; deletedAt?: number; }
export interface Aar { id: string; period: string; stats: string; lessons: string; createdAt: number; deletedAt?: number; }
