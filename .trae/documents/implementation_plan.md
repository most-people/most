# Most.Box 实施计划

## 1. 架构与逻辑审查

在开始实施之前，我对“双 Core”架构进行了分析，并发现了以下潜在的逻辑漏洞和改进建议：

### 1.1. 全局去重与分块一致性 (关键)

**问题:** 协议旨在实现“全局去重”，即相同的文件生成相同的 Data Core 密钥。然而，如果两个不同的发布者发布相同的文件，但使用不同的**分块大小**（例如，一个使用 64KB，另一个使用 1MB），底层的 Merkle 树和 Hypercore 签名将不同，即使内容完全相同。这将导致 Swarm 分裂并破坏去重。
**解决方案:** 协议**必须强制执行固定的分块大小**（例如 64KB）用于 Data Core 的所有文件。这确保了相同文件内容产生确定性的 Merkle 树结构。

### 1.2. 长度锁定 (Length Locking) 实现细节

**问题:** 要求“如果索引 >= MetadataPayload.size，直接丢弃”略有歧义，因为 Hypercore 中的 `index` 通常指*块索引*，而 `size` 是*字节数*。
**解决方案:** 实现必须根据 `size / CHUNK_SIZE` 计算最大预期的块索引。下载端应丢弃任何 `index > max_block_index` 的块。此外，如果最后一个块超出了预期的字节边界，必须进行截断。

### 1.3. 恶意追加漏洞

**问题:** 由于 Data Core 密钥对是从文件内容确定性生成的，任何成功下载文件的对等节点都可以推导出私钥。恶意节点理论上可以尝试向 Data Core 追加垃圾数据并将其传播到 Swarm。
**解决方案:**

1. **严格不可变性:** 诚实的客户端必须将 Data Core 视为严格不可变的。
2. **Metadata 权威性:** `MetadataPayload.root_hash`（由原始作者签名）是最终的事实来源。下载端必须验证下载的数据是否与此哈希匹配。需求中的“终极校验”涵盖了这一点，但我们应强调任何不匹配此哈希的数据都是无效的。

***

## 2. 实施步骤

我将按照以下顺序实施项目：

### 步骤 1: 项目初始化与依赖

* 创建 `Cargo.toml`，包含 `hypercore`, `hyperswarm` (或兼容的 dht crate), `tokio`, `serde`, `blake3`, `ed25519-dalek`。

* **注意:** 我将使用 `hypercore` 和 `hyperswarm` crates。如果需要特定版本，我将默认使用与“Holepunch”技术栈兼容的最新稳定版。

### 步骤 2: Metadata 模块 (`src/metadata.rs`)

* 实现 `MetadataPayload` 结构体。

* 添加序列化/反序列化逻辑 (`serde_json`)。

* 确所有字段 (`v`, `name`, `size`, `data_pk`, `root_hash`, `ts`, `ext`) 类型正确并有详细文档。

### 步骤 3: 发布端逻辑 (`src/publisher.rs`)

* **输入:** 本地文件路径。

* **流程:**

  1. 读取文件，计算 BLAKE3 哈希。
  2. 根据哈希确定性生成 Ed25519 密钥对。
  3. 使用此密钥对初始化 **Data Core** (Hypercore)。
  4. 将文件数据导入 Data Core (强制固定分块大小)。
  5. 创建包含文件信息和 Data Core 公钥的 `MetadataPayload`。
  6. 使用随机/用户提供的密钥初始化 **Metadata Core** (Hypercore)。
  7. 将 `MetadataPayload` 追加到 Metadata Core。
  8. 启动 Swarm (做种) 两个 Core。

### 步骤 4: 下载端逻辑 (`src/downloader.rs`)

* **输入:** `most://<metadata_pubkey>` 链接。

* **流程:**

  1. **阶段一 (同步):** 连接 Metadata Core，获取最新的 `MetadataPayload`。
  2. **阶段二 (异步任务):** 启动 `tokio` 任务。
  3. **权限降级:** *仅*使用 `data_pk` 初始化 Data Core (只读模式)。
  4. **Swarm 加入:** 加入 Data Core 的 Swarm。
  5. **长度锁定:** 实现钩子/检查，如果 `index * CHUNK_SIZE >= size` 则丢弃块。
  6. **进度回传:** 使用 `mpsc::channel` 并带有节流机制 (200ms) 向 UI 报告进度。
  7. **终极校验:** 完成后，重新计算下载内容的 BLAKE3 哈希并与 `MetadataPayload.root_hash` 比较。

### 步骤 5: 集成 (`src/lib.rs` / `src/main.rs`)

* 导出模块。

* 提供简单的 CLI 或 `main.rs` 示例用法来演示流程。

## 3. 验证计划

* **单元测试:** 测试 `MetadataPayload` 的序列化/反序列化。

* **集成测试:** 模拟同一进程（或单独线程）中的发布者和下载者以验证完整流程：

  * 发布者创建文件 -> 下载者检索它 -> 验证内容匹配。

  * 验证“长度锁定”：尝试请求越界块（模拟测试）。

  * 验证“权限降级”：确保下载者没有私钥。

