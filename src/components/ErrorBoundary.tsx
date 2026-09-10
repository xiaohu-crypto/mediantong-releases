import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: "center", fontFamily: "system-ui" }}>
          <h2>抱歉，应用出了点问题</h2>
          <p style={{ color: "#888", fontSize: 13 }}>你的数据都在本地加密存储，不会丢失。</p>
          <pre style={{ textAlign: "left", background: "#f5f5f5", padding: 12, borderRadius: 8, fontSize: 12, maxWidth: 600, margin: "16px auto", overflow: "auto" }}>
            {this.state.error?.message}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 24px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" }}>
            重启应用
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
