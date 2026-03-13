# Most.Box 剩余开发任务与实施计划

基于当前的 codebase 分析，Most.Box 目前完成了核心的 **双核架构 (Dual-Core Architecture)** 设计、**本地持久化存储** 以及 **Tauri UI** 的基础功能。但作为一个 P2P 应用，它还缺少最关键的网络通信部分。

目前代码处于 **"单机模拟 (Local Simulation)"** 阶段：发布者写到本地临时目录，下载者从同一个本地临时目录读取。

## 缺少的关键模块 (Missing Components)

1.  **P2P 网络层 (Hyperswarm Integration)**
    -   **现状**: `Cargo.toml` 中 `hyperswarm` 被注释掉。代码中没有网络连接、节点发现 (DHT) 的逻辑。
    -   **缺失**: 无法跨设备发现节点，无法在互联网上建立连接。

2.  **数据复制协议 (Replication Stream)**
    -   **现状**: `Hypercore` 实例被创建，但没有建立复制流 (Replication Stream)。
    -   **缺失**: 即使建立了网络连接，目前也没有逻辑将 Hypercore 的数据块通过网络发送给对方。

3.  **真实的下载逻辑 (Real Download Implementation)**
    -   **现状**: `Downloader::download_task` 使用 `time::sleep` 模拟下载延迟，且假设数据已经在磁盘上。
    -   **缺失**: 需要调用 `data_core.get(index)` 真正触发网络请求，并处理数据块的接收。

4.  **安全校验 (Security Verification)**
    -   **现状**: `Root Hash` 校验逻辑在注释中，未启用。
    -   **缺失**: 下载完成后，需要重新计算文件哈希并与 Metadata 中的 `root_hash` 对比，确保数据未被篡改。

---

## 实施计划 (Implementation Plan)

为了将 Most.Box 从单机演示转变为真正的 P2P 应用，建议按以下步骤进行：

### 第一阶段：网络层集成 (Networking Layer)

1.  **引入 Hyperswarm**:
    -   在 `core/Cargo.toml` 中启用 `hyperswarm` (或兼容的 DHT 网络库)。
    -   如果 Rust 版 `hyperswarm` 不稳定，可能需要实现一个基础的 TCP/UDP 连接器或使用 `libp2p` 作为替代传输层（但这会偏离 Hypercore 原生生态）。

2.  **实现 Swarm 逻辑**:
    -   **Publisher**: 在发布资源后，加入 Swarm 并 **Announce** (广播) 自己的 `metadata_pk` 和 `data_pk`。
    -   **Downloader**: 在解析 URI 后，加入 Swarm 并 **Lookup** (查找) 对应的 `pk`。

### 第二阶段：复制流管道 (Replication Pipeline)

1.  **建立连接处理**:
    -   当 Swarm 建立连接后，需要将 TCP Stream 包装为 Hypercore 的 `Replication Stream`。
    -   实现 `on_connection` 回调，将本地的 `core` 注入到复制流中。

2.  **多路复用 (Optional but Recommended)**:
    -   由于我们有两个 Core (Metadata + Data)，需要在同一个连接上支持多个 Core 的同步，或者为每个 Core 建立单独的连接。

### 第三阶段：下载与校验 (Download & Verify)

1.  **重构下载循环**:
    -   移除 `time::sleep`。
    -   使用 `data_core.get(i).await`。这会自动挂起，直到从网络中获取到该块数据。

2.  **启用安全防御**:
    -   **长度锁定**: 在获取数据前，确保 `data_core` 的长度不超过 Metadata 声明的 `size`。
    -   **哈希校验**: 下载结束后，读取所有数据计算 BLAKE3 Hash，不匹配则报错。

### 第四阶段：用户体验优化 (UX Improvements)

1.  **自定义存储路径**:
    -   目前硬编码在 `temp_dir`。需要允许用户在 UI 设置下载目录。
    -   支持从外部导入已存在的文件作为 Seed。

2.  **断点续传**:
    -   利用 `Hypercore` 的位图 (Bitfield) 特性，重启应用后检查已下载的块，仅下载缺失部分。

## 建议的下一步 (Recommended Next Step)

**优先解决网络层问题**。尝试引入 `hyperswarm` 或 `libp2p`，打通两个不同终端之间的连接。只有连通了网络，后续的复制和下载才有意义。
