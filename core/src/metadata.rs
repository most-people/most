use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// 元数据负载结构体
/// 存储在 Metadata Core 中，描述资源的基本信息和 Data Core 的位置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataPayload {
    /// 协议版本 (默认: 1)
    pub v: u8,
    /// 资源文件名
    pub name: String,
    /// 文件精确字节大小 (关键安全参数，用于校验)
    pub size: u64,
    /// Data Core 的 Ed25519 公钥 (Hex 字符串)
    /// Data Core 存储实际的文件分块数据
    pub data_pk: String,
    /// 文件的完整 BLAKE3 哈希 (Hex 字符串)
    /// 用于校验下载内容的完整性
    pub root_hash: String,
    /// 发布时间戳 (Unix 秒)
    pub ts: u64,
    /// 扩展字段 (可选)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ext: Option<serde_json::Value>,
}

impl MetadataPayload {
    /// 创建新的元数据实例
    pub fn new(name: String, size: u64, data_pk: String, root_hash: String) -> Self {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            v: 1,
            name,
            size,
            data_pk,
            root_hash,
            ts,
            ext: None,
        }
    }

    /// 序列化为 JSON 字符串
    pub fn to_json(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }

    /// 从 JSON 字符串反序列化
    pub fn from_json(json: &str) -> Result<Self> {
        Ok(serde_json::from_str(json)?)
    }
}
