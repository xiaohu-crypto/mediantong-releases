/** 脱敏代理:云调用前替换敏感字段,返回后还原(需求文档 6.1) */

export type SensitiveMap = Record<string, string>;

let counter = 0;

export function desensitize(text: string, names: string[] = []): { text: string; map: SensitiveMap } {
  const map: SensitiveMap = {};
  let out = text;
  const swap = (m: string, prefix: string): string => {
    const key = `[${prefix}_${counter++}]`;
    map[key] = m;
    return key;
  };
  out = out.replace(/1[3-9]\d{9}/g, (m) => swap(m, "PHONE"));
  out = out.replace(/(¥|￥)\s?[\d,]+(\.\d+)?/g, (m) => swap(m, "AMT"));
  out = out.replace(/\b\d{15,20}\b/g, (m) => swap(m, "TAXNO"));
  for (const n of names) {
    if (n && n.trim().length >= 2 && out.includes(n)) {
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      out = out.replace(re, () => swap(n, "NAME"));
    }
  }
  return { text: out, map };
}

export function restore(text: string, map: SensitiveMap): string {
  let out = text;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}
