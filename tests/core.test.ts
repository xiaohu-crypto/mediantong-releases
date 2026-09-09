import { describe, expect, it } from "vitest";
import { validateCustomer, validateDeal, validateContact, validatePayment } from "../src/core/validators";
import { healthScore, weightedValue, funnel, nextBestActions } from "../src/core/metrics";

describe("validators", () => {
  it("客户:同级重名被拦截", () => {
    const e = validateCustomer({ name: "盛达集团" }, ["盛达集团"]);
    expect(e.name).toBeTruthy();
    expect(validateCustomer({ name: "新客户" }, ["盛达集团"]).name).toBeUndefined();
  });
  it("手机号:11 位且 1 开头", () => {
    expect(validateContact({ name: "张三", phone: "13800138000" }).phone).toBeUndefined();
    expect(validateContact({ name: "张三", phone: "23800138000" }).phone).toBeTruthy();
    expect(validateContact({ name: "张三", phone: "1380013800" }).phone).toBeTruthy();
  });
  it("商机:阶段白名单与金额两位小数", () => {
    expect(validateDeal({ title: "x", customerId: "c1", stage: "报价", value: 380000 }).stage).toBeUndefined();
    expect(validateDeal({ title: "x", customerId: "c1", stage: "超级阶段" }).stage).toBeTruthy();
    expect(validateDeal({ title: "x", customerId: "c1", value: 100.555 }).value).toBeTruthy();
    expect(validateDeal({ title: "x", customerId: "c1", value: 100.55 }).value).toBeUndefined();
  });
  it("回款:金额与到期日", () => {
    expect(validatePayment({ amount: 100, dueDate: "2026-09-30" }).amount).toBeUndefined();
    expect(validatePayment({ amount: -5, dueDate: "2026-09-30" }).amount).toBeTruthy();
    expect(validatePayment({ amount: 100 }).dueDate).toBeTruthy();
  });
});

describe("metrics", () => {
  it("健康度:权重 30/30/20/20", () => {
    // 期望:80*0.3 + 90*0.3 + 70*0.2 + 60*0.2 = 24+27+14+12 = 77
    expect(healthScore({ contactFrequency: 80, paymentPunctuality: 90, responseRate: 70, satisfaction: 60 })).toBe(77);
    // 期望:100*0.3+100*0.3+100*0.2+100*0.2 = 100
    expect(healthScore({ contactFrequency: 100, paymentPunctuality: 100, responseRate: 100, satisfaction: 100 })).toBe(100);
    // 冷启动
    expect(healthScore({ contactFrequency: null, paymentPunctuality: null, responseRate: null, satisfaction: null })).toBe(70);
  });
  it("加权与漏斗", () => {
    expect(weightedValue({ value: 380000, probability: 0.6, stage: "报价", customerId: "c1" })).toBe(228000);
    const f = funnel([
      { value: 10, probability: 0.5, stage: "线索", customerId: "c1" },
      { value: 20, probability: 0.5, stage: "线索", customerId: "c2" },
      { value: 30, probability: 0.5, stage: "商机", customerId: "c1" },
    ]);
    expect(f["线索"].count).toBe(2);
    expect(f["线索"].value).toBe(30);
    expect(f["商机"].value).toBe(30);
  });
  it("NBA 排序:逾期奖励高于普通报价商机,排序稳定", () => {
    const items = [
      { deal: { id: "1", title: "A", value: 100, probability: 0.5, stage: "报价", customerId: "c1", lastTouchDays: 10 }, grade: "A", hasOverduePayment: false },
      { deal: { id: "2", title: "B", value: 100, probability: 0.5, stage: "商机", customerId: "c2", lastTouchDays: 10 }, grade: "B", hasOverduePayment: true },
    ];
    const out = nextBestActions(items, 2);
    // B:10*2+1*10+4+15=49 > A:10*2+2*10+5=45
    expect(out[0].dealId).toBe("2");
    expect(out[0].score).toBe(49);
  });
});
