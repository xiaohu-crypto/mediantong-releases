/**
 * 静态加密(OS 级方案,定案记录):
 * - 选型:保持 IndexedDB 架构不变,在 db 门面层做透明加解密;数据密钥 AES-256-GCM(WebCrypto),
 *   密钥本体由 Electron safeStorage 保护(Windows=DPAPI,OS 凭据级),密文落 userData/vault.key。
 *   (SQLCipher 需整体替换 IndexedDB,迁移成本与架构风险过高,不采用。)
 * - 记录形态:密文记录 = { id, __enc: 1, iv, ct };id 为随机主键(keyPath 要求)保持明文,业务字段全部入密文。
 * - 环境降级:浏览器/测试无 safeStorage → 明文直通(与 AI Key 同一先例),Settings 页明示加密状态。
 * - 已知边界:Electron 下已加密的库,在纯浏览器模式打开会读到密文壳(__enc 标记),不会静默解错。
 */

type EncRecord = { id: string; __enc: 1; iv: string; ct: string };

export interface VaultStatus {
  mode: "os-protected" | "external" | "plain";
  reason: string;
}

let key: CryptoKey | null = null;
let resolved = false;
let status: VaultStatus = { mode: "plain", reason: "未初始化(明文)" };

function enc(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("WebCrypto 不可用");
  return c.subtle;
}

function b64e(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function b64d(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importRaw(rawB64: string): Promise<CryptoKey> {
  return enc().importKey("raw", b64d(rawB64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** 测试/离线注入:外部提供数据密钥(无 OS 保护,仅限测试) */
export async function initVaultWithRawKey(rawB64: string): Promise<void> {
  key = await importRaw(rawB64);
  resolved = true;
  status = { mode: "external", reason: "外部注入密钥(无 OS 保护,仅测试)" };
}

/** 首次使用时解析密钥:Electron 主进程 safeStorage;不可用则明文直通 */
export async function ensureVault(): Promise<VaultStatus> {
  if (resolved) return status;
  resolved = true;
  type Mta = { vaultEnsure?: () => Promise<{ ok: boolean; raw?: string; reason?: string }> };
  const mta = (globalThis as { mta?: Mta }).mta;
  if (mta?.vaultEnsure) {
    try {
      const r = await mta.vaultEnsure();
      if (r.ok && r.raw) {
        key = await importRaw(r.raw);
        status = { mode: "os-protected", reason: "AES-256-GCM,密钥由 OS 凭据保护(safeStorage/DPAPI)" };
        return status;
      }
      status = { mode: "plain", reason: (r.reason ?? "safeStorage 不可用") + ",数据明文存储" };
      return status;
    } catch (e) {
      status = { mode: "plain", reason: "密钥解析失败,数据明文存储(" + String(e) + ")" };
      return status;
    }
  }
  status = { mode: "plain", reason: "浏览器/测试环境,数据明文存储" };
  return status;
}

export function getVaultStatus(): VaultStatus {
  return status;
}

/** 迁移判据:是否有可用数据密钥 */
export function vaultHasKey(): boolean {
  return key !== null;
}

/** 明文对象 → 密文记录(无钥时原样返回) */
export async function encryptRecord<T extends { id: string }>(value: T): Promise<unknown> {
  if (!key) return value;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = await enc().encrypt({ name: "AES-GCM", iv }, key, pt);
  return { id: value.id, __enc: 1, iv: b64e(iv), ct: b64e(ct) } satisfies EncRecord;
}

/** 密文记录 → 明文对象(明文记录原样透传) */
export async function decryptRecord<T>(rec: unknown): Promise<T> {
  const r = rec as Partial<EncRecord> | undefined;
  if (!r || !(r as EncRecord).__enc) return rec as T;
  if (!key || !r.iv || !r.ct) return rec as T; // 无钥环境读到密文壳:原样返回,由上层提示
  const pt = await enc().decrypt({ name: "AES-GCM", iv: b64d(r.iv) }, key, b64d(r.ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}