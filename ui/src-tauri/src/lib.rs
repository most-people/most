use most_box::downloader::Downloader;
use most_box::p2p::P2PNode;
use most_box::publisher::Publisher;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

struct AppState {
    publishers: Mutex<Vec<Publisher>>,
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
async fn publish(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    match Publisher::publish(&path_buf).await {
        Ok(publisher) => {
            let uri = format!("most://{}", publisher.metadata_pk);
            // 保存 Publisher 以保持 P2P 节点运行
            state.publishers.lock().unwrap().push(publisher);
            Ok(uri)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn download(app: AppHandle, uri: String) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel(100);

    // Spawn download task
    let uri_clone = uri.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        match Downloader::start_download(&uri_clone, tx).await {
            Ok(path) => {
                let _ = app_handle.emit("download-complete", path);
            }
            Err(e) => {
                eprintln!("Download error: {}", e);
                let _ = app_handle.emit("download-error", e.to_string());
            }
        };
    });

    // Listen to progress and forward to UI
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_clone.emit("download-progress", progress);
        }
    });

    Ok(())
}

use most_box::metadata::MetadataPayload;
use serde::Serialize;

#[derive(Serialize)]
struct MetadataResponse {
    #[serde(flatten)]
    metadata: MetadataPayload,
    metadata_pk: String,
}

#[tauri::command]
async fn get_metadata(uri: String) -> Result<MetadataResponse, String> {
    // 创建临时的 P2P 节点用于查询
    let (cmd_tx, cmd_rx) = mpsc::channel(10);
    let (event_tx, _) = mpsc::channel(10);

    let p2p_node = P2PNode::new(cmd_rx, event_tx).map_err(|e| e.to_string())?;
    tokio::spawn(async move {
        let _ = p2p_node.run().await;
    });

    match Downloader::resolve_metadata(&uri, cmd_tx).await {
        Ok((metadata, _core, _pk)) => {
            let metadata_pk = uri.trim_start_matches("most://").to_string();
            Ok(MetadataResponse {
                metadata,
                metadata_pk,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            publishers: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![publish, download, get_metadata])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
