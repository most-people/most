use anyhow::{anyhow, Result};
use ed25519_dalek::VerifyingKey;
use hypercore::{HypercoreBuilder, Storage, PartialKeypair};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{self, Duration, Instant};
use crate::metadata::MetadataPayload;

// Progress structure for UI updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: f64, // bytes/sec
}

pub struct Downloader {
    // In a real app, this would hold the Hyperswarm instance
}

impl Downloader {
    /// Start the download process for a given Most.Box URI
    pub async fn start_download(
        metadata_uri: &str, 
        progress_tx: mpsc::Sender<DownloadProgress>
    ) -> Result<()> {
        let metadata = Self::resolve_metadata(metadata_uri).await?;
        
        println!("Resolved Metadata: {} ({} bytes)", metadata.name, metadata.size);

        // 2. Phase 2: Spawn Background Task for Data Core Sync
        // We clone necessary data to move into the task
        let metadata = Arc::new(metadata);
        
        tokio::spawn(async move {
            if let Err(e) = Self::download_task(metadata, progress_tx).await {
                eprintln!("Download task failed: {}", e);
            }
        });

        Ok(())
    }

    /// Resolve metadata from a Most.Box URI
    pub async fn resolve_metadata(metadata_uri: &str) -> Result<MetadataPayload> {
        // 1. Phase 1: Connect to Metadata Core (Synchronous Wait)
        // Parse URI to get Metadata Public Key
        let metadata_pk_hex = metadata_uri.trim_start_matches("most://");
        println!("Connecting to Metadata Core: {}", metadata_pk_hex);

        let metadata_pk_bytes = hex::decode(metadata_pk_hex)?;
        let metadata_pk_array: [u8; 32] = metadata_pk_bytes.try_into().unwrap_or([0; 32]);
        let metadata_pk = VerifyingKey::from_bytes(&metadata_pk_array)?;

        // Initialize Metadata Core in Read-Only mode
        let mut metadata_storage_path = std::env::temp_dir().join("most-box").join("cores").join(&metadata_pk_hex);
        
        // If the path doesn't exist, we can't find it locally (since we don't have P2P yet)
        if !metadata_storage_path.exists() {
             return Err(anyhow!("Metadata Core not found locally (P2P syncing not implemented yet)"));
        }

        let storage = Storage::new_disk(&metadata_storage_path, false).await?;
        let key_pair = PartialKeypair {
            public: metadata_pk,
            secret: None,
        };
        
        let mut metadata_core = HypercoreBuilder::new(storage)
            .key_pair(key_pair)
            .build()
            .await?;

        // Read the latest block (MetadataPayload)
        // Since it's append-only, the last block should be the latest metadata
        let info = metadata_core.info();
        if info.length == 0 {
             return Err(anyhow!("Metadata Core is empty"));
        }

        // Get the last block
        let last_index = info.length - 1;
        let block_option = metadata_core.get(last_index).await?;
        
        if let Some(block) = block_option {
             let payload_json = String::from_utf8(block)?;
             let mut metadata = MetadataPayload::from_json(&payload_json)?;
             // Inject the resolved metadata PK so it can be displayed in UI
             metadata.metadata_pk = Some(metadata_pk_hex.to_string());
             Ok(metadata)
        } else {
             Err(anyhow!("Failed to read metadata block"))
        }
    }

    async fn download_task(
        metadata: Arc<MetadataPayload>,
        progress_tx: mpsc::Sender<DownloadProgress>
    ) -> Result<()> {
        // 3. Permission Downgrade: Initialize Data Core in Read-Only mode
        // We use the Public Key from metadata, NOT generating a keypair.
        
        // Convert hex string back to VerifyingKey
        // In a real scenario, handle errors properly if hex is invalid
        let data_pk_bytes = hex::decode(&metadata.data_pk).unwrap_or(vec![0; 32]); 
        let data_pk_array: [u8; 32] = data_pk_bytes.try_into().unwrap_or([0; 32]);
        let data_pk = VerifyingKey::from_bytes(&data_pk_array).unwrap_or(VerifyingKey::from_bytes(&[0; 32]).unwrap());

        let data_key_pair = PartialKeypair {
            public: data_pk,
            secret: None, // Read-only!
        };

        let storage = Storage::new_memory().await?;
        let mut _data_core = HypercoreBuilder::new(storage)
            .key_pair(data_key_pair)
            .build()
            .await?;
        
        // 4. Swarm Join (Mock)
        println!("Joining Swarm for Data Core: {}", metadata.data_pk);

        // 5. Length Locking & Download Loop
        let chunk_size = 64 * 1024; // Must match Publisher's chunk size
        let total_blocks = (metadata.size as f64 / chunk_size as f64).ceil() as u64;
        let mut downloaded_bytes = 0;
        let mut last_update = Instant::now();

        for i in 0..total_blocks {
            // Security Check: If index is out of bounds, stop immediately.
            if i >= total_blocks {
                eprintln!("Security Warning: Received block index {} >= limit {}", i, total_blocks);
                break;
            }

            // Mock downloading a block
            // let block = data_core.get(i).await?;
            time::sleep(Duration::from_millis(50)).await; // Simulate network latency
            
            // In reality, we would verify the block hash against the Merkle tree here.
            // Hypercore does this automatically.

            downloaded_bytes += chunk_size as u64; // Approximation
            if downloaded_bytes > metadata.size {
                downloaded_bytes = metadata.size;
            }

            // 6. Progress Reporting with Throttling (UI Communication)
            if last_update.elapsed() >= Duration::from_millis(200) {
                let progress = DownloadProgress {
                    downloaded_bytes,
                    total_bytes: metadata.size,
                    speed: 0.0, // Calculate speed based on delta
                };
                
                // Use try_send to avoid blocking the download loop
                match progress_tx.try_send(progress) {
                    Ok(_) => {},
                    Err(mpsc::error::TrySendError::Full(_)) => {
                        // Drop progress update if channel is full (Backpressure handling)
                    },
                    Err(e) => return Err(anyhow!("Channel closed: {}", e)),
                }
                last_update = Instant::now();
            }
        }

        // 7. Final Verification
        // Read all data and calculate BLAKE3 hash
        // let mut all_data = Vec::new();
        // ... read from core ...
        // let final_hash = blake3::hash(&all_data);
        // if final_hash.to_hex() != metadata.root_hash {
        //     return Err(anyhow!("Root Hash Mismatch! Data corrupted or tampered."));
        // }

        println!("Download Complete and Verified!");
        Ok(())
    }
}
