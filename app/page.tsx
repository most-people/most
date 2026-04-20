"use client";

import { useState, useEffect, useCallback } from "react";
import AppHomeMode from "../components/AppHomeMode";
import MarketingLanding from "../components/MarketingLanding";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { api, setBackendUrl, getBackendUrlExport, checkBackendConnection } from "../src/utils/api";

export default function HomePage() {
  const [mode, setMode] = useState<"loading" | "app" | "marketing" | "error">("loading");
  const [nodeId, setNodeId] = useState("");
  const [backendUrl, setBackendUrlState] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [connecting, setConnecting] = useState(false);

  const tryConnect = useCallback(async (url?: string) => {
    if (url !== undefined) {
      setBackendUrl(url);
      setBackendUrlState(url);
    }
    const currentUrl = url ?? getBackendUrlExport();
    if (!currentUrl) {
      setMode("marketing");
      return;
    }
    setConnecting(true);
    const ok = await checkBackendConnection();
    setConnecting(false);
    if (ok) {
      try {
        const res = await api.get("/api/node-id").json<{ id?: string; peerId?: string }>();
        setMode("app");
        setNodeId(res.id || res.peerId || "");
      } catch {
        setMode("error");
      }
    } else {
      setMode("error");
    }
  }, []);

  useEffect(() => {
    const savedUrl = getBackendUrlExport();
    setBackendUrlState(savedUrl);
    setInputUrl(savedUrl);
    if (savedUrl) {
      tryConnect(savedUrl);
    } else {
      setMode("marketing");
    }
  }, [tryConnect]);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      tryConnect(inputUrl.trim());
    }
  };

  if (mode === "loading") {
    return (
      <div className="page-loading">
        <div className="page-loading-logo" />
      </div>
    );
  }

  if (mode === "error") {
    return (
      <>
        <Nav />
        <div className="backend-error-page">
          <div className="backend-error-card">
            <div className="backend-error-icon">⚠️</div>
            <h2>无法连接到后端</h2>
            <p className="backend-error-url">
              当前地址：<code>{backendUrl || "未设置"}</code>
            </p>
            <p className="backend-error-desc">
              请检查后端服务是否运行，或输入新的后端地址。
            </p>
            <form onSubmit={handleSaveUrl} className="backend-error-form">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="如 http://192.168.1.100:1976"
                className="backend-error-input"
              />
              <button type="submit" disabled={connecting || !inputUrl.trim()} className="backend-error-btn primary">
                {connecting ? "连接中..." : "连接"}
              </button>
            </form>
            <button onClick={() => { setBackendUrl(""); setBackendUrlState(""); setMode("marketing"); }} className="backend-error-btn secondary">
              返回首页
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      {mode === "app" ? <AppHomeMode nodeId={nodeId} /> : <MarketingLanding />}
      <Footer />
    </>
  );
}
