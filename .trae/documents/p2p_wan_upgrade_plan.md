# 计划：将 P2P 升级为 WAN 就绪（Keet 风格连接）

本计划概述了将当前的仅 LAN P2P 实现（mDNS + TCP）升级为具备全球节点发现和 NAT 穿透能力的 WAN 就绪架构的步骤，模仿 Keet/Hyperswarm 使用 `libp2p` 协议栈的连接模型。

## 目标
通过实施以下功能，使 `most` 节点能够在互联网（WAN）上相互发现并连接：
1.  **全球发现**：Kademlia DHT（取代仅限本地的 mDNS 进行全球查找）。
2.  **NAT 穿透**：AutoNAT、DCUtR（打洞）和 Relay（中继 v2）。
3.  **地址学习**：Identify 协议。

## 当前状态
- **发现**：仅 `mDNS`（本地网络）。`Announce`/`Lookup` 命令待办（TODO）。
- **传输**：TCP + Noise + Yamux。
- **协议**：用于 hypercore 复制的自定义 `libp2p-stream`。
- **配置**：硬编码随机端口（`0.0.0.0/0`），无引导节点（bootstrap nodes）。

## 第一阶段：依赖与配置基础设施

**目标**：为项目准备必要的库和配置结构，以支持 WAN 设置（引导节点、端口）。

### 步骤
1.  **更新依赖 (`core/Cargo.toml`)**
    - 启用 `libp2p` 特性：`identify`、`kad`、`autonat`、`relay`、`dcutr`、`upnp`。
2.  **定义配置 (`core/src/p2p.rs`)**
    - 创建 `pub struct P2PConfig`:
        - `bootnodes: Vec<Multiaddr>`
        - `port: u16` (默认为 0，即随机)
        - `enable_upnp: bool`
        - `enable_relay: bool`
3.  **更新初始化 (`core/src/p2p.rs`)**
    - 添加 `P2PNode::new_with_config(..., config: P2PConfig)`。
    - 修改现有的 `P2PNode::new` 以使用默认值调用 `new_with_config`。
4.  **传播配置 (入口点)**
    - 确保 `main.rs`、`publisher.rs`、`downloader.rs` 目前继续使用默认设置工作。

## 第二阶段：全球发现 (Kademlia DHT)

**目标**：使用 Kademlia DHT 实现 `Announce`（发布）和 `Lookup`（查找），以便节点可以通过 Topic/Key 在 WAN 上找到彼此。

### 步骤
1.  **扩充行为 (`core/src/p2p.rs`)**
    - 向 `MyBehaviour` 结构体添加 `kad: Kademlia<MemoryStore>`。
2.  **初始化 Kademlia**
    - 在 `P2PNode::new_with_config` 中：
        - 使用本地 PeerId 创建 `MemoryStore`。
        - 使用 `KademliaConfig` 创建 `Kademlia` 行为。
        - 将配置的 `bootnodes` 添加到 Kademlia 路由表。
3.  **实现命令**
    - `Command::Announce(topic)`: 调用 `self.swarm.behaviour_mut().kad.start_providing(key)`。
    - `Command::Lookup(topic)`: 调用 `self.swarm.behaviour_mut().kad.get_providers(key)`。
    - *注意：将十六进制 topic 字符串转换为 `kad::record::Key`。*
4.  **处理 DHT 事件**
    - 在 `P2PNode::run` 循环中：
        - 匹配 `KademliaEvent::OutboundQueryProgressed`。
        - 在 `GetProviders` 成功时：提取找到的 peers 并调用 `self.swarm.dial(peer_id)`。
        - 在 `RoutingUpdated` 时：记录添加到路由表的新 peers。

## 第三阶段：连接性与 NAT 穿透

**目标**：确保即使在 NAT 后面，节点也能使用 Identify、AutoNAT、Relay 和 DCUtR 进行连接。

### 步骤
1.  **扩充行为 (`core/src/p2p.rs`)**
    - 向 `MyBehaviour` 添加字段：
        - `identify: Identify`
        - `autonat: AutoNAT`
        - `relay: RelayClient`
        - `dcutr: Dcutr`
        - `upnp: Upnp` (可选/条件性)
2.  **初始化协议**
    - 在 `P2PNode::new_with_config` 中：
        - 初始化 `Identify`（暴露公钥、代理版本）。
        - 初始化 `AutoNAT`（根据配置选择服务器/客户端模式）。
        - 初始化 `RelayClient` (v2)。
        - 初始化 `Dcutr`。
        - 初始化 `Upnp`（如果启用）。
3.  **处理连接性事件**
    - 在 `P2PNode::run` 循环中：
        - `IdentifyEvent::Received`：将观察到的地址添加到 Kademlia (`kad.add_address`)。
        - `AutoNATEvent::StatusChanged`：记录公网/私网状态。
        - `RelayClientEvent`：记录预留状态（如果使用中继）。

## 第四阶段：集成与验证

**目标**：验证更改。

### 步骤
1.  **日志记录**：确保所有新事件（DHT 发现节点、NAT 状态、连接建立）打印清晰的日志。
2.  **引导逻辑**：由于我们还没有公共节点群，我们将依赖手动配置引导节点进行测试。
3.  **验证测试**：
    - 运行节点 A（引导/种子）。
    - 运行节点 B（下载者），将节点 A 的地址作为引导节点。
    - 验证节点 B 通过 DHT 找到节点 A（不仅仅是 mDNS）并建立复制流。

## 假设
- 我们将继续使用目前使用的 `tokio` 运行时。
- 我们使用 `libp2p` 0.56.0（来自 Cargo.toml）。
- 现有的 Hypercore 复制逻辑（`stream` 行为）保持不变；我们只是升级“底层”网络。
