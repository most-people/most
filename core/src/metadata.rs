use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataPayload {
    /// Protocol version (Default: 1)
    pub v: u8,
    /// Resource filename
    pub name: String,
    /// Files exact byte size (Critical security parameter)
    pub size: u64,
    /// Metadata Core Ed25519 Public Key (Hex string) - Optional, filled by resolver
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_pk: Option<String>,
    /// Data Core Ed25519 Public Key (Hex string)
    pub data_pk: String,
    /// File's complete BLAKE3 hash (Hex string)
    pub root_hash: String,
    /// Timestamp
    pub ts: u64,
    /// Extension fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ext: Option<serde_json::Value>,
}

impl MetadataPayload {
    pub fn new(name: String, size: u64, data_pk: String, root_hash: String) -> Self {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            v: 1,
            name,
            size,
            metadata_pk: None,
            data_pk,
            root_hash,
            ts,
            ext: None,
        }
    }

    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }

    pub fn from_json(json: &str) -> Result<Self> {
        Ok(serde_json::from_str(json)?)
    }
}
