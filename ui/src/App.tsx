import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  speed: number;
}

function App() {
  const [tab, setTab] = useState<"publish" | "download">("publish");
  const [filePath, setFilePath] = useState("");
  const [publishResult, setPublishResult] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [uri, setUri] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let unlistenProgress: () => void;
    let unlistenComplete: () => void;
    let unlistenError: () => void;

    async function setupListeners() {
      unlistenProgress = await listen<DownloadProgress>("download-progress", (event) => {
        setDownloadProgress(event.payload);
        setDownloadStatus(`下载中...`);
      });
      
      unlistenComplete = await listen("download-complete", () => {
        setDownloadStatus("✅ 下载完成！");
        setDownloading(false);
      });

      unlistenError = await listen<string>("download-error", (event) => {
        setDownloadStatus(`❌ 错误: ${event.payload}`);
        setDownloading(false);
      });
    }

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, []);

  async function handleSelectFile() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      if (selected) {
        setFilePath(selected as string);
      }
    } catch (err) {
      console.error(err);
      setPublishResult(`文件选择错误: ${err}`);
    }
  }

  async function handlePublish() {
    if (!filePath) return;
    setPublishing(true);
    setPublishResult("");
    try {
      const result = await invoke<string>("publish", { path: filePath });
      setPublishResult(result);
    } catch (error) {
      setPublishResult(`错误: ${error}`);
    }
    setPublishing(false);
  }

  async function handleDownload() {
    if (!uri) return;
    setDownloading(true);
    setDownloadStatus("启动中...");
    setDownloadProgress(null);
    try {
      await invoke("download", { uri });
    } catch (error) {
      setDownloadStatus(`错误: ${error}`);
      setDownloading(false);
    }
  }

  return (
    <div className="container">
      <h1>Most.Box</h1>
      
      <div className="tabs">
        <button 
          onClick={() => setTab("publish")} 
          className={tab === "publish" ? "active" : ""}
        >
          发布
        </button>
        <button 
          onClick={() => setTab("download")} 
          className={tab === "download" ? "active" : ""}
        >
          下载
        </button>
      </div>

      <div className="content">
        {tab === "publish" && (
          <div className="card">
            <h2>发布资源</h2>
            <div className="input-group">
              <input
                id="publish-input"
                readOnly
                placeholder="请选择文件..."
                value={filePath}
                onClick={handleSelectFile}
                style={{ cursor: "pointer" }}
              />
              <button type="button" onClick={handleSelectFile} disabled={publishing}>
                选择
              </button>
              <button type="button" onClick={handlePublish} disabled={publishing || !filePath}>
                {publishing ? "发布中..." : "发布"}
              </button>
            </div>
            {publishResult && (
              <div className="result">
                <p>{publishResult.startsWith("most://") ? "✅ 发布成功！请分享此链接：" : "❌ 发布失败："}</p>
                <code>{publishResult}</code>
              </div>
            )}
          </div>
        )}

        {tab === "download" && (
          <div className="card">
            <h2>下载资源</h2>
            <div className="input-group">
              <input
                id="download-input"
                onChange={(e) => setUri(e.currentTarget.value)}
                placeholder="输入 most:// 链接..."
                value={uri}
              />
              <button type="button" onClick={handleDownload} disabled={downloading}>
                {downloading ? "下载中..." : "下载"}
              </button>
            </div>
            
            {downloadStatus && <p className="status">{downloadStatus}</p>}
            
            {downloadProgress && (
              <div className="progress-container">
                <progress 
                  value={downloadProgress.downloaded_bytes} 
                  max={downloadProgress.total_bytes > 0 ? downloadProgress.total_bytes : 100} 
                />
                <p>
                  {Math.round((downloadProgress.downloaded_bytes / (downloadProgress.total_bytes || 1)) * 100)}% 
                  ({(downloadProgress.downloaded_bytes / 1024).toFixed(2)} KB / {(downloadProgress.total_bytes / 1024).toFixed(2)} KB)
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
