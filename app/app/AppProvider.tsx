"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import SettingsDrawer from "../../components/SettingsDrawer";
import { Toast } from "../../components/ui";
import {
  api,
  getBackendUrlExport,
  detectSameOriginBackend,
  detectLocalhostBackend,
  setBackendUrl,
} from "../../src/utils/api";

interface ToastItem {
  id: number;
  message: string;
  type: string;
}

interface AppContextValue {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  addToast: (message: string, type?: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackendWarning, setShowBackendWarning] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type = "info") => {
    setToasts((prev) => [...prev, { id: Date.now(), message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const handleShutdown = useCallback(() => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm("确定要关闭服务吗？");
    if (confirmed) {
      api.post("/api/shutdown").catch(() => {});
      window.close();
    }
  }, []);

  // Theme initialization
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || (!saved && prefersDark)) {
      setIsDarkMode(true);
    }
  }, []);

  // Theme application
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDarkMode ? "dark" : "light");
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // Backend warning detection (initial)
  useEffect(() => {
    if (!getBackendUrlExport()) {
      detectSameOriginBackend().then((detected) => {
        if (!detected) {
          detectLocalhostBackend().then((localDetected) => {
            if (!localDetected) setShowBackendWarning(true);
          });
        }
      });
    }
  }, []);

  // Backend warning polling
  useEffect(() => {
    if (!showBackendWarning) return;
    const interval = setInterval(() => {
      detectSameOriginBackend().then((detected) => {
        if (detected) {
          setBackendUrl("");
          setShowBackendWarning(false);
          return;
        }
        detectLocalhostBackend().then((localDetected) => {
          if (localDetected) {
            setBackendUrl("http://localhost:1976");
            setShowBackendWarning(false);
          }
        });
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [showBackendWarning]);

  return (
    <AppContext.Provider
      value={{ isDarkMode, setIsDarkMode, openSettings, closeSettings, addToast }}
    >
      {children}

      {showBackendWarning && (
        <div className="backend-warning-bar">
          <span>未设置后端地址，请设置后端地址后使用</span>
          <button onClick={openSettings} aria-label="设置">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      )}

      {toasts.map((t, i) => (
        <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} index={i} />
      ))}

      {showSettings && (
        <SettingsDrawer
          onClose={closeSettings}
          addToast={addToast}
          isDarkMode={isDarkMode}
          handleShutdown={handleShutdown}
        />
      )}
    </AppContext.Provider>
  );
}
