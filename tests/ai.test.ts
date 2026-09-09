import { describe, expect, it } from "vitest";
import { desensitize, restore } from "../src/core/ai/desensitize";
import { classify, route } from "../src/core/ai/router";

describe("脱敏代理", () => {
  it("手机号/金额/客户名 全部替换且可还原", () => {
    const src = "联系张伟 13800138001,报价 ¥380,000,客户盛达集团确认。";
    const { text, map } = desensitize(src, ["盛达集团", "张伟"]);
    expect(text).not.toContain("13800138001");
    expect(text).not.toContain("380,000");
    expect(text).not.toContain("盛达集团");
    expect(text).not.toContain("张伟");
    const restored = restore(text, map);
    expect(restored).toBe(src);
  });
  it("无敏感内容时 map 为空", () => {
    const { text, map } = desensitize("普通文本 no secrets", []);
    expect(Object.keys(map).length).toBe(0);
    expect(text).toBe("普通文本 no secrets");
  });
});

describe("分级路由", () => {
  it("敏感任务:云关闭→本地;允许脱敏上云→云", () => {
    expect(route("客户档案摘要", { cloudEnabled: false, allowSensitiveCloud: true }).target).toBe("local");
    expect(route("客户档案摘要", { cloudEnabled: true, allowSensitiveCloud: true }).target).toBe("cloud");
    expect(route("客户档案摘要", { cloudEnabled: true, allowSensitiveCloud: false }).target).toBe("local");
  });
  it("非敏感任务:云开启即走云", () => {
    expect(classify("公开行业趋势总结")).toBe("normal");
    expect(route("公开行业趋势总结", { cloudEnabled: true, allowSensitiveCloud: false }).target).toBe("cloud");
  });
});
