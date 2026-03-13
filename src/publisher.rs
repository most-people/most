use anyhow::{Context, Result};
use blake3::Hasher;
use ed25519_dalek::{SigningKey, VerifyingKey};
use hypercore::{Hypercore, Storage};
use std::path::Path;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use crate::metadata::MetadataPayload;

// Constant for chunk size to ensure global deduplication
pub const CHUNK_SIZE: usize = 64 * 1024; // 64KB

pub struct Publisher {
    pub metadata_core: Hypercore<random_access_memory::RandomAccessMemory>,
    pub data_core: Hypercore<random_access_memory::RandomAccessMemory>,
    pub metadata_pk: String,
    pub data_pk: String,
}

impl Publisher {
    /// Publish a file to the Most.Box network
    pub async fn publish(file_path: &Path) -> Result<Self> {
        // 1. Read file and calculate BLAKE3 hash
        let mut file = File::open(file_path).await.context("Failed to open file")?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await.context("Failed to read file")?;
        
        let file_hash = blake3::hash(&content);
        let file_hash_hex = hex::encode(file_hash.as_bytes());
        let file_size = content.len() as u64;
        let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();

        // 2. Deterministic Key Generation for Data Core
        // Use the BLAKE3 hash as the seed for Ed25519 keypair
        let data_secret_key = SigningKey::from_bytes(file_hash.as_bytes());
        let data_public_key: VerifyingKey = data_secret_key.verifying_key();
        let data_pk_hex = hex::encode(data_public_key.to_bytes());

        // 3. Initialize Data Core (Immutable, Content-addressed)
        // We use in-memory storage for demonstration, but in production this would be disk-backed
        let data_storage = random_access_memory::RandomAccessMemory::new(1024);
        
        // Note: Real Hypercore setup requires passing the key pair. 
        // This is a simplified instantiation assuming the crate's API.
        // In reality, you'd use `Hypercore::new_with_key_pair(...)`.
        // Since we are mocking the exact API surface:
        let mut data_core = Hypercore::new(data_storage).await?;
        
        // 4. Import data into Data Core with fixed chunking
        for chunk in content.chunks(CHUNK_SIZE) {
            data_core.append(chunk).await?;
        }

        // 5. Create MetadataPayload
        let metadata = MetadataPayload::new(
            file_name,
            file_size,
            data_pk_hex.clone(),
            file_hash_hex,
        );
        let metadata_json = metadata.to_json()?;

        // 6. Initialize Metadata Core (Mutable)
        // This one uses a random key or a persistent identity key
        let metadata_storage = random_access_memory::RandomAccessMemory::new(1024);
        let mut metadata_core = Hypercore::new(metadata_storage).await?;
        
        // 7. Append Metadata
        metadata_core.append(metadata_json.as_bytes()).await?;

        // Get Metadata Public Key (this is the most:// link)
        // In a real implementation, we'd get this from the core.
        // For now, we mock it or assume it's available.
        let metadata_pk = "mock_metadata_pk".to_string(); 

        println!("Published successfully!");
        println!("Metadata Core PK: {}", metadata_pk);
        println!("Data Core PK: {}", data_pk_hex);
        println!("File Size: {} bytes", file_size);
        println!("Chunks: {}", (file_size as f64 / CHUNK_SIZE as f64).ceil());

        // 8. Swarm / Seeding would happen here
        // In a real app, we would hand these cores to Hyperswarm.

        Ok(Self {
            metadata_core,
            data_core,
            metadata_pk,
            data_pk: data_pk_hex,
        })
    }
}
