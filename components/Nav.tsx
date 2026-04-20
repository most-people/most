"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { setBackendUrl, getBackendUrlExport, checkBackendConnection } from "../src/utils/api";

function LogoIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.4"
      />
      <rect
        x="14"
        y="2"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.7"
      />
      <rect
        x="2"
        y="14"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.7"
      />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="var(--accent)" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <circle cx="8" cy="8" r="3.5" />
      <line x1="8" y1="1" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="15" y2="8" />
      <line x1="3" y1="3" x2="4.5" y2="4.5" />
      <line x1="11.5" y1="11.5" x2="13" y2="13" />
      <line x1="3" y1="13" x2="4.5" y2="11.5" />
      <line x1="11.5" y1="4.5" x2="13" y2="3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <path d="M6 1.5A6.5 6.5 0 1 0 14.5 10 5 5 0 0 1 6 1.5z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M13.5 8c0-.5-.1-1-.2-1.4l1.2-1-1.2-2-1.5.6c-.4-.3-.9-.6-1.4-.8L10 2H8L7.6 3.4c-.5.2-1 .5-1.4.8L4.7 3.6 3.5 5.6l1.2 1c-.1.4-.2.9-.2 1.4s.1 1 .2 1.4l-1.2 1 1.2 2 1.5-.6c.4.3.9.6 1.4.8L8 14h2l.4-1.4c.5-.2 1-.5 1.4-.8l1.5.6 1.2-2-1.2-1c.1-.4.2-.9.2-1.4z" />
    </svg>
  );
}

const navItems = [
  { href: "/docs/getting-started/", label: "文档" },
  { href: "/changelog/", label: "更新日志" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      isDarkMode ? "dark" : "light",
    );
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (showSettings) {
      setInputUrl(getBackendUrlExport());
      setStatusMsg("");
    }
  }, [showSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = inputUrl.trim();
    if (!url) {
      setBackendUrl("");
      setShowSettings(false);
      window.location.href = "/";
      return;
    }
    setConnecting(true);
    setStatusMsg("连接中...");
    setBackendUrl(url);
    const ok = await checkBackendConnection();
    setConnecting(false);
    if (ok) {
      setStatusMsg("连接成功，跳转中...");
      setTimeout(() => { window.location.href = "/"; }, 500);
    } else {
      setStatusMsg("连接失败，请检查地址是否正确");
    }
  };

  return (
    <>
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-nav-logo">
            <LogoIcon />
            MostBox
          </Link>

          <div className={`mkt-nav-links ${open ? "open" : ""}`}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <button
              className="mkt-theme-toggle mkt-mobile-only"
              onClick={() => {
                setIsDarkMode(!isDarkMode);
                setOpen(false);
              }}
              aria-label="切换主题"
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
              {isDarkMode ? " 亮色模式" : " 暗色模式"}
            </button>
          </div>

          <div className="mkt-nav-cta">
            <button
              className="mkt-theme-toggle mkt-desktop-only"
              onClick={() => setIsDarkMode(!isDarkMode)}
              aria-label="切换主题"
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              className="mkt-nav-settings-btn"
              onClick={() => setShowSettings(true)}
              aria-label="设置后端地址"
            >
              <GearIcon />
            </button>
            <Link href="/app/" className="mkt-btn-primary">
              打开文件管理
            </Link>

            <button
              className="mkt-nav-mobile-toggle"
              onClick={() => setOpen(!open)}
              aria-label="菜单"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </nav>

      {showSettings && (
        <div className="mkt-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="mkt-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>后端地址</h3>
            <p className="mkt-settings-desc">
              输入 MostBox 后端服务地址，如运行在本机可留空。
            </p>
            <form onSubmit={handleSave}>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="如 http://192.168.1.100:1976"
                className="mkt-settings-input"
                autoFocus
              />
              <div className="mkt-settings-actions">
                <button type="submit" disabled={connecting} className="mkt-settings-btn primary">
                  {connecting ? "连接中..." : "保存并连接"}
                </button>
                <button type="button" onClick={() => setShowSettings(false)} className="mkt-settings-btn secondary">
                  取消
                </button>
              </div>
              {statusMsg && (
                <p className={`mkt-settings-status ${statusMsg.includes("成功") ? "success" : statusMsg.includes("失败") ? "error" : ""}`}>
                  {statusMsg}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
