use anyhow::{Context, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use hypercore::{Hypercore, HypercoreBuilder, Storage, PartialKeypair};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use crate::metadata::MetadataPayload;

// Constant for chunk size to ensure global deduplication
pub const CHUNK_SIZE: usize = 64 * 1024; // 64KB

pub struct Publisher {
    pub metadata_core: Hypercore,
    pub data_core: Hypercore,
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
        let data_storage = Storage::new_memory().await?;
        
        let data_key_pair = PartialKeypair {
            public: data_public_key,
            secret: Some(data_secret_key),
        };

        let mut data_core = HypercoreBuilder::new(data_storage)
            .key_pair(data_key_pair)
            .build()
            .await?;
        
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
        let metadata_storage = Storage::new_memory().await?;
        
        // Generate random keypair for metadata core
        let mut csprng = rand::rngs::OsRng;
        let metadata_secret_key = SigningKey::generate(&mut csprng);
        let metadata_public_key = metadata_secret_key.verifying_key();
        let metadata_pk = hex::encode(metadata_public_key.to_bytes());

        let metadata_key_pair = PartialKeypair {
            public: metadata_public_key,
            secret: Some(metadata_secret_key),
        };

        let mut metadata_core = HypercoreBuilder::new(metadata_storage)
            .key_pair(metadata_key_pair)
            .build()
            .await?;
        
        // 7. Append Metadata
        metadata_core.append(metadata_json.as_bytes()).await?; 

        println!("Published successfully!");
        println!("Metadata Core PK: {}", metadata_pk);
        println!("Data Core PK: {}", data_pk_hex);
        println!("File Size: {} bytes", file_size);
        println!("Chunks: {}", (file_size as f64 / CHUNK_SIZE as f64).ceil());

        Ok(Self {
            metadata_core,
            data_core,
            metadata_pk,
            data_pk: data_pk_hex,
        })
    }
}
