import { useRef } from "react";
import { db } from "../db/db";
import { seedIfEmpty } from "../data/seed";
import { Btn, Modal, useToast } from "../ui/common";

export default function Onboarding(props: { onDone: () => Promise<void> }) {
  const { show, node } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickSample() { await seedIfEmpty(); await db.setSetting("onboarded", true); await props.onDone(); }
  async function pickBlank() { await db.setSetting("onboarded", true); await props.onDone(); }

  return (
    <Modal title="欢迎使用媒电通工作台" onClose={() => { void pickBlank(); }} footer={
      <div className="grow"><Btn kind="primary" onClick={() => { void pickSample(); }}>载入示例数据</Btn></div>
    }>
      <p style={{ color: "var(--ink-3)", fontSize: "var(--text-sm)", marginBottom: 12 }}>
        三种起步方式(可随时在系统管理重置):数据全部存储在本机,不会上传。
      </p>
      <div className="alert-line"><span className="txt"><b>1. 载入示例数据</b> — 预置 10 客户/8 商机/排期/比稿/笔记,快速了解功能</span>
        <Btn kind="primary" sm onClick={() => { void pickSample(); }}>使用</Btn></div>
      <div className="alert-line"><span className="txt"><b>2. 从备份导入</b> — 选择此前导出的 JSON 备份文件</span>
        <Btn kind="ghost" sm onClick={() => fileRef.current?.click()}>选择文件</Btn></div>
      <div className="alert-line"><span className="txt"><b>3. 空白开始</b> — 不预置任何数据,从快速采集开始</span>
        <Btn kind="ghost" sm onClick={() => { void pickBlank(); }}>使用</Btn></div>
      <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          void (async () => {
            try {
              const parsed = JSON.parse(await f.text()) as { stores?: Record<string, unknown[]> };
              if (!parsed.stores) { show("文件格式不正确"); return; }
              await db.restoreAll(parsed.stores);
              await db.setSetting("onboarded", true);
              await props.onDone();
            } catch { show("导入失败:无法解析该文件"); }
          })();
        }} />
      {node}
    </Modal>
  );
}
