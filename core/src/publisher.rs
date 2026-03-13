use anyhow::{Context, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use hypercore::{Hypercore, HypercoreBuilder, Storage, PartialKeypair};
use std::path::Path;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::sync::{mpsc, Mutex};
use crate::metadata::MetadataPayload;
use crate::p2p::{P2PNode, Command as P2PCommand};

// 定义分块大小为 64KB，确保全局去重的一致性
pub const CHUNK_SIZE: usize = 64 * 1024;

pub struct Publisher {
    pub metadata_core: Arc<Mutex<Hypercore>>,
    pub data_core: Arc<Mutex<Hypercore>>,
    pub metadata_pk: String,
    pub data_pk: String,
    pub p2p_tx: mpsc::Sender<P2PCommand>, // 用于控制 P2P 节点
}

impl Publisher {
    /// 发布文件到 Most.Box 网络
    /// 
    /// 采用双核心架构 (Dual-Core Architecture):
    /// 1. Data Core: 存储文件内容分块，使用文件内容的 Hash 作为密钥 (Deterministic)，实现去重。
    /// 2. Metadata Core: 存储文件元数据 (文件名、大小、Data Core PK)，使用随机密钥 (Identity)，每次发布都不同。
    pub async fn publish(file_path: &Path) -> Result<Self> {
        // 1. 读取文件并计算 BLAKE3 哈希
        let mut file = File::open(file_path).await.context("无法打开文件")?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await.context("无法读取文件")?;
        
        let file_hash = blake3::hash(&content);
        let file_hash_hex = hex::encode(file_hash.as_bytes());
        let file_size = content.len() as u64;
        let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();

        // 2. Data Core 初始化 (基于内容哈希的确定性密钥)
        // 使用文件哈希作为 Seed 生成 Ed25519 密钥对
        let data_secret_key = SigningKey::from_bytes(file_hash.as_bytes());
        let data_public_key: VerifyingKey = data_secret_key.verifying_key();
        let data_pk_hex = hex::encode(data_public_key.to_bytes());

        // 存储路径: temp/most-box/cores/<data_pk>
        let data_storage_path = std::env::temp_dir().join("most-box").join("cores").join(&data_pk_hex);
        tokio::fs::create_dir_all(&data_storage_path).await?;
        
        // 创建 Data Core (不可变，仅追加)
        let mut data_core = HypercoreBuilder::new(Storage::new_disk(&data_storage_path, false).await?)
            .key_pair(PartialKeypair {
                public: data_public_key,
                secret: Some(data_secret_key),
            })
            .build()
            .await?;
        
        // 3. 写入数据块到 Data Core
        // 注意: Hypercore 是 append-only 的，如果之前已经写入过相同数据，这里可能会追加重复块。
        // 在实际生产中，应该检查 data_core.info().length 是否为 0，或者比较 root hash。
        // 这里为了简化逻辑，每次都创建一个新的 builder 实例 (实际上如果不清空目录，会加载旧数据)。
        // 简单起见，我们假设 data_core 是复用的，如果已经有数据就不需要重写 (TODO: 优化去重逻辑)
        if data_core.info().length == 0 {
            for chunk in content.chunks(CHUNK_SIZE) {
                data_core.append(chunk).await?;
            }
        }

        // 4. Metadata Core 初始化 (随机身份密钥)
        // 每次发布生成新的随机密钥，保护用户隐私，避免关联性
        let mut csprng = rand::rngs::OsRng;
        let metadata_secret_key = SigningKey::generate(&mut csprng);
        let metadata_public_key = metadata_secret_key.verifying_key();
        let metadata_pk = hex::encode(metadata_public_key.to_bytes());

        let metadata_storage_path = std::env::temp_dir().join("most-box").join("cores").join(&metadata_pk);
        tokio::fs::create_dir_all(&metadata_storage_path).await?;

        let mut metadata_core = HypercoreBuilder::new(Storage::new_disk(&metadata_storage_path, false).await?)
            .key_pair(PartialKeypair {
                public: metadata_public_key,
                secret: Some(metadata_secret_key),
            })
            .build()
            .await?;
        
        // 5. 写入元数据
        let metadata = MetadataPayload::new(
            file_name,
            file_size,
            data_pk_hex.clone(),
            file_hash_hex,
        );
        metadata_core.append(metadata.to_json()?.as_bytes()).await?; 

        // 6. 输出结果
        println!("发布成功!");
        println!("Metadata Core PK: {}", metadata_pk);
        println!("Data Core PK: {}", data_pk_hex);

        // 7. 启动 P2P 节点并注册 Cores
        let (cmd_tx, cmd_rx) = mpsc::channel(10);
        let (event_tx, mut event_rx) = mpsc::channel(10);
        
        let p2p_node = P2PNode::new(cmd_rx, event_tx)?;
        tokio::spawn(async move {
            if let Err(e) = p2p_node.run().await {
                eprintln!("P2P Node Error: {}", e);
            }
        });

        // 包装 Cores 以便共享
        let metadata_core = Arc::new(Mutex::new(metadata_core));
        let data_core = Arc::new(Mutex::new(data_core));

        // 注册到 P2P 网络
        cmd_tx
            .send(P2PCommand::Replicate(metadata_pk.clone(), metadata_core.clone(), None))
            .await?;
        cmd_tx
            .send(P2PCommand::Replicate(data_pk_hex.clone(), data_core.clone(), None))
            .await?;
        
        // 广播 Metadata PK (让其他人可以发现)
        cmd_tx.send(P2PCommand::Announce(metadata_pk.clone())).await?;

        // 监听 P2P 事件 (可选，仅用于调试)
        let _event_rx_loop = tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                println!("(Publisher) P2P Event: {:?}", event);
            }
        });

        Ok(Self {
            metadata_core,
            data_core,
            metadata_pk,
            data_pk: data_pk_hex,
            p2p_tx: cmd_tx,
        })
    }
}
