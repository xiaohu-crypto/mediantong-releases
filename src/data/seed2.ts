import { db } from "../db/db";
import type { Baseline, MediaResource, Note, Pitch, PostBuy, RateCard, ScheduleItem, Supplier, Aar } from "../types";

/** P1/P2 新仓示例数据:各自独立判空,老库升级后也能补齐 */
export async function seedExtraIfEmpty(): Promise<void> {
  if ((await db.getAll<Pitch>("pitches")).length === 0) {
    const pitches: Pitch[] = [
      { id: "pi-1", customerId: "c-2", name: "云裳 双11 比稿", date: "2026-08-05", investment: 20000, competitors: "同业 A/同业 B", result: "胜", reviewNote: "胜在媒介组合与数据复盘能力展示。" },
      { id: "pi-2", customerId: "c-4", name: "悦己 新车联合campaign", date: "2026-07-20", investment: 12000, competitors: "同业 C", result: "败", lossReason: "报价高出 15%", reviewNote: "成本结构需优化,报价格式改分档。" },
      { id: "pi-3", customerId: "c-5", name: "蓝湾 冬季推广邀约", date: "2026-09-01", investment: 3000, competitors: "待定", result: "待定" },
    ];
    for (const x of pitches) await db.put("pitches", x);
  }

  if ((await db.getAll<Supplier>("suppliers")).length === 0) {
    const suppliers: Supplier[] = [
      { id: "su-1", name: "巨量引擎官方", type: "官方", rebatePolicy: "季返 3%,年返 5%" },
      { id: "su-2", name: "XX 代理", type: "代理", rebatePolicy: "后返 2%,月结 60 天" },
      { id: "su-3", name: "MCN 机构 Y", type: "达人机构", rebatePolicy: "刊例 9 折" },
    ];
    for (const x of suppliers) await db.put("suppliers", x);
  }

  if ((await db.getAll<MediaResource>("resources")).length === 0) {
    const resources: MediaResource[] = [
      { id: "re-1", name: "信息流投放 A", type: "效果广告", supplierId: "su-1" },
      { id: "re-2", name: "种草投放 B", type: "内容种草", supplierId: "su-3" },
      { id: "re-3", name: "效果投放 C", type: "效果广告", supplierId: "su-2" },
      { id: "re-4", name: "线下媒体框架", type: "线下", supplierId: "su-2" },
    ];
    for (const x of resources) await db.put("resources", x);

    const ratecards: RateCard[] = [
      { id: "rc-1", resourceId: "re-1", version: "2026-Q2", effectiveFrom: "2026-04-01", listPrice: 55 },
      { id: "rc-2", resourceId: "re-1", version: "2026-Q3", effectiveFrom: "2026-07-01", listPrice: 58 },
      { id: "rc-3", resourceId: "re-2", version: "2026-Q3", effectiveFrom: "2026-07-01", listPrice: 12 },
      { id: "rc-4", resourceId: "re-3", version: "2026-Q3", effectiveFrom: "2026-07-01", listPrice: 66 },
      { id: "rc-5", resourceId: "re-4", version: "2026 年框", effectiveFrom: "2026-01-01", listPrice: 52 },
    ];
    for (const x of ratecards) await db.put("ratecards", x);
  }

  if ((await db.getAll<ScheduleItem>("scheduleItems")).length === 0) {
    const items: ScheduleItem[] = [
      { id: "sc-1", customerId: "c-2", name: "品牌广告+达人引流", resourceId: "re-1", start: "2026-09-01", end: "2026-11-30", cost: 420000, sellPrice: 470000, status: "已确认" },
      { id: "sc-2", customerId: "c-2", name: "达人矩阵 30 篇", resourceId: "re-2", start: "2026-09-01", end: "2026-10-31", cost: 220000, sellPrice: 260000, rebate: 86000, rebateSettled: false, status: "待确认" },
      { id: "sc-3", customerId: "c-2", name: "信息流放大", resourceId: "re-2", start: "2026-11-01", end: "2026-11-30", cost: 130000, sellPrice: 150000, status: "待确认" },
      { id: "sc-4", customerId: "c-2", name: "大促爆发期", resourceId: "re-3", start: "2026-10-20", end: "2026-11-15", cost: 160000, sellPrice: 180000, status: "已确认" },
      { id: "sc-5", customerId: "c-2", name: "城市 8 城·年框", resourceId: "re-4", start: "2026-10-01", end: "2026-12-31", cost: 165000, sellPrice: 190000, status: "已确认" },
    ];
    for (const x of items) await db.put("scheduleItems", x);
  }

  if ((await db.getAll<PostBuy>("postbuys")).length === 0) {
    const postbuys: PostBuy[] = [
      { id: "pb-1", resourceId: "re-1", month: "2026-08", actualImpression: 5200000, cpm: 56, roi: 3.8, dataSource: "CSV回填" },
      { id: "pb-2", resourceId: "re-2", month: "2026-08", actualImpression: 900000, cpm: 12, roi: 3.1, dataSource: "手动" },
    ];
    for (const x of postbuys) await db.put("postbuys", x);
  }

  if ((await db.getAll<Note>("notes")).length === 0) {
    const notes: Note[] = [
      { id: "n-1", title: "双11 媒介组合方法论", content: "大促期配比:内容种草 45% / 效果投放 35% / 品牌曝光 20%。详见 [[信息流归因笔记]]。", tags: ["方法论", "双11"], para: "Resources", versions: [] },
      { id: "n-2", title: "信息流归因笔记", content: "归因窗口 7 天点击 + 1 天展示;达人内容用优惠码兜底归因。关联 [[双11 媒介组合方法论]]。", tags: ["归因"], para: "Areas", versions: [] },
      { id: "n-3", title: "盛达集团 沟通要点", content: "张总关注电梯媒体覆盖与成本分档;报价必须用 2026-Q3 刊例版本。", tags: ["客户"], para: "Projects", versions: [] },
    ];
    for (const x of notes) await db.put("notes", x);
  }

  if ((await db.getAll<Baseline>("baselines")).length === 0) {
    const baselines: Baseline[] = [
      { id: "bl-1", dimension: "美妆日化", metric: "CPM", value: "¥45-70", source: "行业报告 2026H1" },
      { id: "bl-2", dimension: "美妆日化", metric: "ROI 健康线", value: "≥ 1:2.5", source: "自有历史校准" },
      { id: "bl-3", dimension: "服饰鞋包", metric: "CPE", value: "¥8-15", source: "行业报告 2026H1" },
      { id: "bl-4", dimension: "互联网", metric: "CPM", value: "¥30-60", source: "行业报告 2026H1" },
    ];
    for (const x of baselines) await db.put("baselines", x);
  }

  if ((await db.getAll<Aar>("aars")).length === 0) {
    const aars: Aar[] = [
      { id: "aar-1", period: "2026-W36", stats: "3 个商机未推进;1 个比稿失败", lessons: "报价格式需分档;盛达需在沉默 14 天内触达。", createdAt: Date.now() - 7 * 86400000 },
    ];
    for (const x of aars) await db.put("aars", x);
  }
}
