"use client";

import { useState, useEffect } from "react";
import AppHomeMode from "../components/AppHomeMode";
import MarketingLanding from "../components/MarketingLanding";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";

export default function HomePage() {
  const [mode, setMode] = useState<"loading" | "app" | "marketing">("loading");
  const [nodeId, setNodeId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/node-id", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("not ok");
        return res.json();
      })
      .then((data) => {
        setMode("app");
        setNodeId(data.id || data.peerId || "");
      })
      .catch(() => {
        setMode("marketing");
      });
    return () => controller.abort();
  }, []);

  if (mode === "loading") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100dvh - 64px - 80px)",
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }}
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
          <rect
            x="14"
            y="14"
            width="8"
            height="8"
            rx="2"
            fill="var(--accent)"
          />
        </svg>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.95); } 50% { opacity: 0.7; transform: scale(1); } }`}</style>
      </div>
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
