# Most.Box 核心 P2P 引擎架构设计与开发指南

**Context (背景说明):**
我们正在使用 Rust 开发一个名为 **Most.Box** 的 Web3 去中心化内容分发网络（CDN）和热门资源共享协议。该协议基于 Holepunch 技术栈（底层核心为 `hypercore` 和 `hyperswarm`）。
请仔细阅读以下架构设计原则和约束，并根据这些指导方针为我生成后续的 Rust 代码。

## 1. 核心架构：双 Core 设计 (Dual-Core Architecture)

为了实现“全局资源去重秒传”、“防篡改”以及“支持资源版本更新”，我们摒弃了传统的单 Core 或 Hyperdrive 目录树，采用专属的双 Core 架构。

- **Metadata Core (元数据核心):**
- **特性：** 动态（Mutable），由资源发布者持有私钥，仅追加日志（Append-only）。
- **用途：** 存储资源的配置信息（如文件名、大小、真实数据公钥、全局哈希）。
- **URI 寻址：** 用户之间传递的链接格式为 `most://<metadata_pubkey>`。

- **Data Core (数据核心):**
- **特性：** 静态（Immutable），全局去重。
- **密钥生成：** **确定性生成 (Deterministic Generation)**。将目标文件的完整内容进行 BLAKE3 哈希（32 bytes），将此哈希值作为种子（Seed）传入 Ed25519 算法生成 Keypair。
- **用途：** 仅存储纯粹的文件切块数据。全网拥有相同文件的节点，会因为计算出相同的公钥而自动汇聚到同一个 Swarm 中进行做种。

## 2. 核心数据结构 (Data Structures)

在 Metadata Core 中写入和读取的 Payload 格式如下。请使用 `serde` 和 `serde_json` 进行序列化/反序列化。

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataPayload {
    pub v: u8,            // 协议版本 (默认 1)
    pub name: String,     // 资源文件名
    pub size: u64,        // 文件的精确字节数 (关键安全参数)
    pub data_pk: String,  // Data Core 的 Ed25519 公钥 (Hex 字符串)
    pub root_hash: String,// 文件的完整 BLAKE3 哈希 (Hex 字符串)
    pub ts: u64,          // 时间戳
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ext: Option<serde_json::Value>, // 扩展字段
}

```

## 3. 关键安全防御机制 (Security Constraints - 极其重要)

由于 Data Core 的私钥是公开可推导的（任何人有文件就能算出私钥），必须在**下载端（Leecher）**严格落实以下防御逻辑：

1. **权限降级：** 下载端在初始化 Data Core 时，**绝对禁止**推导和使用私钥。只能使用从 Metadata 中解析出的 `data_pk`（公钥）以**只读模式**进行初始化。
2. **长度锁定 (Length Locking)：** 在监听 Hyperswarm 数据同步流（Replication Stream）的事件循环中，必须拦截恶意节点的数据注入。如果收到的区块索引 `index >= MetadataPayload.size`，**必须直接 drop 丢弃**，拒绝写入本地。
3. **终极校验 (Root Hash Validation)：** 文件下载达到 `size` 预期后，在本地计算一次完整文件的 BLAKE3 哈希，与 `MetadataPayload.root_hash` 对比。

## 4. 异步控制流 (Async Control Flow)

请使用 `tokio` 运行时构建客户端下载逻辑。流程必须是串行与并发结合：

1. **阶段一（同步等待）：** 解析 `most://` 链接，连接 Metadata Core，等待并读取最新的一条 JSON 记录。
2. **阶段二（剥离后台任务）：** 成功解析 `size` 和 `data_pk` 后，立刻使用 `tokio::spawn` 启动独立的后台任务来挂载 Data Core 并执行 P2P 同步，不阻塞主线程。

## 5. UI 解耦与进度回传 (UI Communication)

底层引擎严禁直接调用 UI 更新。

- 请在 `tokio` 任务中使用 `tokio::sync::mpsc::channel` 将进度回传。
- **节流机制：** 在循环内部使用 `tokio::time::Instant`，限制进度事件发送频率（例如每 200ms 发送一次）。
- **防阻塞：** 必须使用 `try_send()`，如果通道满则丢弃该帧进度，绝对不能让 UI 卡顿拖慢底层的 P2P 极速下载。

---

**请确认你已理解上述 Most.Box 的架构逻辑。如果理解，请帮我生成项目的 `Cargo.toml` 依赖清单，以及 `src/metadata.rs` 中 `MetadataPayload` 序列化和解析的基础代码。**

**发布端（读取本地文件，计算 Hash，生成双 Core 并做种）**

**下载端（解析链接，挂载安全拦截锁并拉取数据）**
