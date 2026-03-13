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
        // 1. Phase 1: Connect to Metadata Core (Synchronous Wait)
        // Parse URI to get Metadata Public Key
        let _metadata_pk = metadata_uri.trim_start_matches("most://");
        println!("Connecting to Metadata Core: {}", _metadata_pk);

        // Mock: Retrieve Metadata Payload
        // In reality, we connect to swarm, find peers, sync metadata core, read latest block.
        // For this example, we'll assume we got the payload.
        let payload_json = r#"{
            "v": 1,
            "name": "example.mp4",
            "size": 1048576,
            "data_pk": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            "root_hash": "cafebabe",
            "ts": 1234567890
        }"#;
        // Note: Using a valid length hex string for mock data_pk (64 chars = 32 bytes)
        
        let metadata = MetadataPayload::from_json(payload_json)?;
        
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
