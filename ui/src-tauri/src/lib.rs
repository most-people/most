use tauri::{AppHandle, Emitter};
use most_box::publisher::Publisher;
use most_box::downloader::Downloader;
use std::path::PathBuf;
use tokio::sync::mpsc;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
async fn publish(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    match Publisher::publish(&path_buf).await {
        Ok(info) => {
            Ok(format!("most://{}", info.metadata_pk))
        },
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
        if let Err(e) = Downloader::start_download(&uri_clone, tx).await {
            eprintln!("Download error: {}", e);
            let _ = app_handle.emit("download-error", e.to_string());
        }
    });

    // Listen to progress and forward to UI
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_clone.emit("download-progress", progress);
        }
        let _ = app_clone.emit("download-complete", ());
    });

    Ok(())
}

use most_box::metadata::MetadataPayload;

#[tauri::command]
async fn get_metadata(uri: String) -> Result<MetadataPayload, String> {
    match Downloader::resolve_metadata(&uri).await {
        Ok(metadata) => Ok(metadata),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![publish, download, get_metadata])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
