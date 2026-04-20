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
      <div className="page-loading">
        <div className="page-loading-logo" />
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
