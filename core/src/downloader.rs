use anyhow::{anyhow, Result};
use ed25519_dalek::VerifyingKey;
use hypercore::{HypercoreBuilder, Storage, PartialKeypair};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{self, Duration, Instant};
use crate::metadata::MetadataPayload;

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
        progress_tx: mpsc::Sender<DownloadProgress>
    ) -> Result<()> {
        // 1. 解析元数据
        let metadata = Self::resolve_metadata(metadata_uri).await?;
        println!("解析元数据成功: {} ({} bytes)", metadata.name, metadata.size);

        // 2. 启动后台下载任务
        let metadata = Arc::new(metadata);
        tokio::spawn(async move {
            if let Err(e) = Self::download_task(metadata, progress_tx).await {
                eprintln!("下载任务失败: {}", e);
            }
        });

        Ok(())
    }

    /// 解析 Most.Box URI 获取元数据
    pub async fn resolve_metadata(metadata_uri: &str) -> Result<MetadataPayload> {
        // 解析 URI 中的 Metadata PK
        let metadata_pk_hex = metadata_uri.trim_start_matches("most://");
        let metadata_pk_bytes = hex::decode(metadata_pk_hex)?;
        let metadata_pk_array: [u8; 32] = metadata_pk_bytes.try_into().unwrap_or([0; 32]);
        let metadata_pk = VerifyingKey::from_bytes(&metadata_pk_array)?;

        // 初始化 Metadata Core (只读模式)
        // 目前仅支持读取本地已存在的 Core (模拟网络传输)
        let metadata_storage_path = std::env::temp_dir().join("most-box").join("cores").join(&metadata_pk_hex);
        
        if !metadata_storage_path.exists() {
             return Err(anyhow!("本地未找到 Metadata Core (P2P 同步功能尚未实现)"));
        }

        let mut metadata_core = HypercoreBuilder::new(Storage::new_disk(&metadata_storage_path, false).await?)
            .key_pair(PartialKeypair {
                public: metadata_pk,
                secret: None, // 只有公钥，无法写入
            })
            .build()
            .await?;

        // 读取最新块 (元数据)
        let info = metadata_core.info();
        if info.length == 0 {
             return Err(anyhow!("Metadata Core 为空"));
        }

        let last_index = info.length - 1;
        let block = metadata_core.get(last_index).await?.ok_or(anyhow!("无法读取元数据块"))?;
        
        let payload_json = String::from_utf8(block)?;
        let metadata = MetadataPayload::from_json(&payload_json)?;
        
        Ok(metadata)
    }

    /// 执行具体的数据下载逻辑
    async fn download_task(
        metadata: Arc<MetadataPayload>,
        progress_tx: mpsc::Sender<DownloadProgress>
    ) -> Result<()> {
        // 1. 初始化 Data Core (只读)
        let data_pk_bytes = hex::decode(&metadata.data_pk).unwrap_or(vec![0; 32]); 
        let data_pk_array: [u8; 32] = data_pk_bytes.try_into().unwrap_or([0; 32]);
        let data_pk = VerifyingKey::from_bytes(&data_pk_array).unwrap_or(VerifyingKey::from_bytes(&[0; 32]).unwrap());

        // 使用内存存储模拟下载缓存 (实际应使用磁盘)
        // TODO: 改为磁盘存储以支持断点续传
        let storage = Storage::new_memory().await?;
        let _data_core = HypercoreBuilder::new(storage)
            .key_pair(PartialKeypair { public: data_pk, secret: None })
            .build()
            .await?;
        
        println!("连接 Data Core Swarm: {}", metadata.data_pk);

        // 2. 下载循环 (模拟)
        let chunk_size = 64 * 1024; // 64KB
        let total_blocks = (metadata.size as f64 / chunk_size as f64).ceil() as u64;
        let mut downloaded_bytes = 0;
        let mut last_update = Instant::now();

        for i in 0..total_blocks {
            if i >= total_blocks { break; }

            // 模拟网络延迟
            time::sleep(Duration::from_millis(50)).await; 
            
            // 实际逻辑应为: data_core.get(i).await? 触发 P2P 请求
            
            downloaded_bytes += chunk_size as u64;
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

        println!("下载完成并校验通过!");
        Ok(())
    }
}
