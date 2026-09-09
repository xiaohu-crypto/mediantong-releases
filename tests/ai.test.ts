import { describe, expect, it } from "vitest";
import { desensitize, restore } from "../src/core/ai/desensitize";
import { classify, route } from "../src/core/ai/router";
import { quotaState } from "../src/core/ai/quota";

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

describe("Agent 粒度开关与月度限额", () => {
  it("Agent 关闭 → 本地,理由明确", () => {
    const d = route("客户资料-话术草稿", { cloudEnabled: true, allowSensitiveCloud: true, agentEnabled: false });
    expect(d.target).toBe("local");
    expect(d.reason).toContain("Agent 已关闭");
  });
  it("月度限额:0 不限;跨月重置;<80% ok;≥80% warn;≥100% exceeded", () => {
    expect(quotaState({ month: "2026-09", calls: 1, tokens: 0 }, 1000, "2026-09").level).toBe("ok");
    expect(quotaState({ month: "2026-09", calls: 1, tokens: 799 }, 1000, "2026-09").level).toBe("ok");
    expect(quotaState({ month: "2026-09", calls: 1, tokens: 800 }, 1000, "2026-09").level).toBe("warn");
    expect(quotaState({ month: "2026-09", calls: 1, tokens: 1000 }, 1000, "2026-09").level).toBe("exceeded");
    expect(quotaState({ month: "2026-09", calls: 1, tokens: 99999 }, 0, "2026-09").level).toBe("ok");
    expect(quotaState({ month: "2026-08", calls: 9, tokens: 99999 }, 1000, "2026-09").level).toBe("ok");
  });
});