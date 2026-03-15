use crate::metadata::MetadataPayload;
use crate::p2p::{Command as P2PCommand, P2PConfig, P2PNode};
use anyhow::{anyhow, Result};
use ed25519_dalek::VerifyingKey;
use hypercore::{Hypercore, HypercoreBuilder, PartialKeypair, Storage};
use libp2p::Multiaddr;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex, Notify};
use tokio::time::{self, Duration, Instant};

/// 下载进度结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: f64, // 字节/秒
}

pub struct Downloader;

impl Downloader {
    /// 开始下载任务
    pub async fn start_download(
        metadata_uri: &str,
        progress_tx: mpsc::Sender<DownloadProgress>,
    ) -> Result<String> {
        Self::start_download_with_config(metadata_uri, progress_tx, P2PConfig::default()).await
    }

    pub async fn start_download_with_config(
        metadata_uri: &str,
        progress_tx: mpsc::Sender<DownloadProgress>,
        mut config: P2PConfig,
    ) -> Result<String> {
        // 解析 URI 中的 bootnodes
        // 格式: most://<pk>?bootnodes=/ip4/1.2.3.4/tcp/12345/p2p/Qm...,/ip4/...
        let parts: Vec<&str> = metadata_uri.split('?').collect();

        if parts.len() > 1 {
            let query = parts[1];
            for param in query.split('&') {
                if let Some(nodes_str) = param.strip_prefix("bootnodes=") {
                    for node_str in nodes_str.split(',') {
                        // URL decode might be needed if complex chars used, but multiaddr usually safe
                        // Simple replace for common encoding if any (e.g. %2F -> /) - keeping it simple for now
                        if let Ok(addr) = Multiaddr::from_str(node_str) {
                            println!("(Downloader) 添加 Bootnode: {}", addr);
                            config.bootnodes.push(addr);
                        }
                    }
                }
            }
        }

        // 0. 启动 P2P 节点
        let (cmd_tx, cmd_rx) = mpsc::channel(10);
        let (event_tx, mut event_rx) = mpsc::channel(10);

        let p2p_node = P2PNode::new_with_config(cmd_rx, event_tx, config)?;
        tokio::spawn(async move {
            if let Err(e) = p2p_node.run().await {
                eprintln!("P2P Node Error: {}", e);
            }
        });

        // 监听 P2P 事件 (可选)
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                println!("(Downloader) P2P Event: {:?}", event);
            }
        });

        // 1. 解析元数据 (集成 P2P 注册)
        let (metadata, _metadata_core, _metadata_pk_hex) =
            Self::resolve_metadata(metadata_uri, cmd_tx.clone()).await?;
        println!(
            "解析元数据成功: {} ({} bytes)",
            metadata.name, metadata.size
        );

        let metadata = Arc::new(metadata);
        let path = Self::download_task(metadata, progress_tx, cmd_tx).await?;
        Ok(path)
    }

    /// 解析 Most.Box URI 获取元数据
    pub async fn resolve_metadata(
        metadata_uri: &str,
        p2p_tx: mpsc::Sender<P2PCommand>,
    ) -> Result<(MetadataPayload, Arc<Mutex<Hypercore>>, String)> {
        // 解析 URI 中的 Metadata PK (忽略 ? 后面的参数)
        let parts: Vec<&str> = metadata_uri.split('?').collect();
        let metadata_pk_hex = parts[0].trim_start_matches("most://").to_string();

        let metadata_pk_bytes = hex::decode(&metadata_pk_hex)?;
        let metadata_pk_array: [u8; 32] = metadata_pk_bytes.try_into().unwrap_or([0; 32]);
        let metadata_pk = VerifyingKey::from_bytes(&metadata_pk_array)?;

        // 初始化 Metadata Core (只读模式)
        let metadata_storage_path = std::env::temp_dir()
            .join("most-box")
            .join("cores")
            .join(&metadata_pk_hex);
        tokio::fs::create_dir_all(&metadata_storage_path).await?;

        let metadata_core =
            HypercoreBuilder::new(Storage::new_disk(&metadata_storage_path, false).await?)
                .key_pair(PartialKeypair {
                    public: metadata_pk,
                    secret: None, // 只有公钥，无法写入
                })
                .build()
                .await?;

        // 注册到 P2P 网络进行同步
        let metadata_core_shared = Arc::new(Mutex::new(metadata_core));
        let metadata_notify = Arc::new(Notify::new());
        p2p_tx
            .send(P2PCommand::Replicate(
                metadata_pk_hex.clone(),
                metadata_core_shared.clone(),
                Some(metadata_notify.clone()),
            ))
            .await?;
        p2p_tx
            .send(P2PCommand::Lookup(metadata_pk_hex.clone()))
            .await?;

        let shared_for_wait = metadata_core_shared.clone();
        let notify_for_wait = metadata_notify.clone();
        let (last_index, block) = time::timeout(Duration::from_secs(10), async move {
            loop {
                let mut core = shared_for_wait.lock().await;
                let info = core.info();
                if info.length == 0 {
                    drop(core);
                    notify_for_wait.notified().await;
                    continue;
                }

                let last_index = info.length - 1;
                if core.has(last_index) {
                    if let Some(block) = core.get(last_index).await? {
                        return Ok::<(u64, Vec<u8>), anyhow::Error>((last_index, block));
                    }
                }

                drop(core);
                notify_for_wait.notified().await;
            }
        })
        .await
        .map_err(|_| anyhow!("Metadata Core 同步超时 (10s)"))??;

        let payload_json = String::from_utf8(block)
            .map_err(|_| anyhow!("无法解析元数据块 (index={})", last_index))?;
        let metadata = MetadataPayload::from_json(&payload_json)?;

        Ok((metadata, metadata_core_shared, metadata_pk_hex))
    }

    /// 执行具体的数据下载逻辑
    async fn download_task(
        metadata: Arc<MetadataPayload>,
        progress_tx: mpsc::Sender<DownloadProgress>,
        p2p_tx: mpsc::Sender<P2PCommand>,
    ) -> Result<String> {
        // 1. 初始化 Data Core (只读)
        let data_pk_bytes = hex::decode(&metadata.data_pk).unwrap_or(vec![0; 32]);
        let data_pk_array: [u8; 32] = data_pk_bytes.try_into().unwrap_or([0; 32]);
        let data_pk = VerifyingKey::from_bytes(&data_pk_array)
            .unwrap_or(VerifyingKey::from_bytes(&[0; 32]).unwrap());

        // 使用磁盘存储
        let data_storage_path = std::env::temp_dir()
            .join("most-box")
            .join("cores")
            .join(&metadata.data_pk);
        tokio::fs::create_dir_all(&data_storage_path).await?;

        let data_core = HypercoreBuilder::new(Storage::new_disk(&data_storage_path, false).await?)
            .key_pair(PartialKeypair {
                public: data_pk,
                secret: None,
            })
            .build()
            .await?;

        let data_core_shared = Arc::new(Mutex::new(data_core));
        let data_notify = Arc::new(Notify::new());

        // 注册到 P2P 网络
        p2p_tx
            .send(P2PCommand::Replicate(
                metadata.data_pk.clone(),
                data_core_shared.clone(),
                Some(data_notify.clone()),
            ))
            .await?;
        p2p_tx
            .send(P2PCommand::Lookup(metadata.data_pk.clone()))
            .await?;

        println!("连接 Data Core Swarm: {}", metadata.data_pk);

        let downloads_dir = std::env::temp_dir().join("most-box").join("downloads");
        tokio::fs::create_dir_all(&downloads_dir).await?;
        let file_name = sanitize_filename(&metadata.name);
        let suffix = metadata.data_pk.chars().take(8).collect::<String>();
        let output_path = downloads_dir.join(format!("{}-{}", file_name, suffix));
        let mut out = tokio::fs::File::create(&output_path).await?;

        // 2. 下载循环 (模拟 + 真实)
        let chunk_size = 64 * 1024; // 64KB
        let total_blocks = (metadata.size as f64 / chunk_size as f64).ceil() as u64;
        let mut downloaded_bytes = 0;
        let mut last_update = Instant::now();

        // 检查本地已有的块
        // TODO: 使用 bitfield

        for i in 0..total_blocks {
            let start = Instant::now();
            let block = loop {
                let mut core = data_core_shared.lock().await;
                if let Ok(Some(b)) = core.get(i).await {
                    break b;
                }
                drop(core);

                let remaining = Duration::from_secs(60)
                    .checked_sub(start.elapsed())
                    .unwrap_or(Duration::from_secs(0));
                if remaining == Duration::from_secs(0) {
                    return Err(anyhow!("下载块 {} 超时", i));
                }
                time::timeout(remaining, data_notify.notified())
                    .await
                    .map_err(|_| anyhow!("下载块 {} 超时", i))?;
            };

            out.write_all(&block).await?;

            downloaded_bytes += block.len() as u64;
            if downloaded_bytes > metadata.size {
                downloaded_bytes = metadata.size;
            }

            // 3. 汇报进度 (限流: 每 200ms 一次)
            if last_update.elapsed() >= Duration::from_millis(200) {
                let _ = progress_tx.try_send(DownloadProgress {
                    downloaded_bytes,
                    total_bytes: metadata.size,
                    speed: 0.0,
                });
                last_update = Instant::now();
            }
        }

        let _ = progress_tx.try_send(DownloadProgress {
            downloaded_bytes: metadata.size,
            total_bytes: metadata.size,
            speed: 0.0,
        });
        out.flush().await?;

        println!("下载完成! 保存到: {}", output_path.display());
        Ok(output_path.to_string_lossy().to_string())
    }
}

fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        let invalid =
            matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control();
        if invalid {
            out.push('_');
        } else {
            out.push(ch);
        }
    }
    let out = out.trim().trim_matches('.').to_string();
    if out.is_empty() {
        "download".to_string()
    } else {
        out
    }
}
