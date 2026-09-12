import { describe, expect, it } from "vitest";
import { parseStructuredAdvice } from "../src/core/ai/script";
import { askCustomer, type AskContext } from "../src/core/ai/ask";
import type { ContactPoint, Contract, Customer, Deal, Payment, Rel, Task } from "../src/types";

describe("parseStructuredAdvice 结构化建议解析", () => {
  it("解析【】标记标准格式", () => {
    const text = [
      "【总结】客户处于报价阶段,需推动尽快确认排期。",
      "【关键决策】1. 确认 Q4 排期 2. 锁定预算盘子 3. 决策人面谈",
      "【待办】1. 发正式报价单 2. 预约下周拜访",
      "【风险】1. 竞品低价切入",
    ].join("\n");
    const r = parseStructuredAdvice(text);
    expect(r).not.toBeNull();
    expect(r!.summary).toContain("报价阶段");
    expect(r!.decisions.length).toBe(3);
    expect(r!.todos.length).toBe(2);
    expect(r!.risks.length).toBe(1);
  });

  it("解析 ## markdown 标题与 1、 顿号序号", () => {
    const text = "## 总结\n测试总结\n## 待办\n1. 动作A\n2、动作B";
    const r = parseStructuredAdvice(text);
    expect(r).not.toBeNull();
    expect(r!.summary).toBe("测试总结");
    expect(r!.todos).toEqual(["动作A", "动作B"]);
  });

  it("无区块标记的纯文本返回 null", () => {
    expect(parseStructuredAdvice("这是一段普通的跟进建议,没有任何标记。")).toBeNull();
    expect(parseStructuredAdvice("")).toBeNull();
    expect(parseStructuredAdvice("   ")).toBeNull();
  });

  it("列表截断:决策/待办最多3条、风险最多2条", () => {
    const text = [
      "【总结】x",
      "【关键决策】1.a 2.b 3.c 4.d 5.e",
      "【待办】1.a 2.b",
      "【风险】1.a 2.b 3.c",
    ].join("\n");
    const r = parseStructuredAdvice(text)!;
    expect(r.decisions.length).toBe(3);
    expect(r.todos.length).toBe(2);
    expect(r.risks.length).toBe(2);
  });
});

describe("askCustomer 本地问数", () => {
  const cust: Customer = { id: "c1", name: "测试客户", industry: "快消", grade: "A" };
  const deals: Deal[] = [
    { id: "d1", customerId: "c1", title: "电梯广告", stage: "报价", value: 300000, probability: 60, lastTouchAt: Date.now() },
    { id: "d2", customerId: "c1", title: "朋友圈", stage: "签约", value: 100000, probability: 100, lastTouchAt: Date.now() },
  ];
  const contracts: Contract[] = [{ id: "ct1", customerId: "c1", name: "年度框架", amount: 500000, signDate: "2026-08-01", status: "执行中" }];
  const payments: Payment[] = [
    { id: "p1", contractId: "ct1", customerId: "c1", amount: 300000, dueDate: "2026-08-01", paidDate: "2026-08-05", status: "已收" },
    { id: "p2", contractId: "ct1", customerId: "c1", amount: 200000, dueDate: "2026-07-01", status: "逾期" },
  ];
  const cps: ContactPoint[] = [
    { id: "cp1", customerId: "c1", channel: "微信", time: Date.now() - 5 * 86400000, summary: "讨论报价细节" },
  ];
  const tasks: Task[] = [
    { id: "t1", title: "发报价单", type: "跟进", priority: "高", kanbanCol: "进行中", customerId: "c1" },
    { id: "t2", title: "回访", type: "跟进", priority: "中", kanbanCol: "待办", customerId: "c1" },
  ];
  const rels: Rel[] = [
    { id: "r1", contactId: "k1", customerId: "c1", role: "决策人DM" },
    { id: "r2", contactId: "k2", customerId: "c1", role: "影响者" },
  ];
  const ctx: AskContext = { customer: cust, deals, contracts, payments, cps, tasks, rels };

  it("商机:在途数量与金额", () => {
    const a = askCustomer("有多少在途商机?", ctx);
    expect(a).toContain("在途 1 个");
    expect(a).toContain("¥");
  });
  it("回款:已收与逾期分开统计", () => {
    const a = askCustomer("回款情况怎么样", ctx);
    expect(a).toContain("已收");
    expect(a).toContain("逾期 1 笔");
  });
  it("跟进:返回最近接触摘要与渠道", () => {
    const a = askCustomer("最近跟进是什么时候", ctx);
    expect(a).toContain("讨论报价细节");
    expect(a).toContain("微信");
  });
  it("联系人:统计决策人数量", () => {
    const a = askCustomer("决策人有几个", ctx);
    expect(a).toContain("决策人(DM)1 人");
  });
  it("健康度:返回分数", () => {
    const a = askCustomer("客户健康度如何", ctx);
    expect(a).toContain("/100");
  });
  it("概况:综合摘要包含客户名", () => {
    const a = askCustomer("客户概况", ctx);
    expect(a).toContain("测试客户");
  });
  it("无法识别:提示可问方向", () => {
    const a = askCustomer("今天天气怎么样", ctx);
    expect(a).toContain("未理解");
  });
  it("空问题提示", () => {
    expect(askCustomer("   ", ctx)).toContain("请输入问题");
  });
});