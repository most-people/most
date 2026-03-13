use anyhow::Result;
use futures::StreamExt;
use futures::{AsyncRead, AsyncWrite};
use hypercore::{Hypercore, RequestBlock, RequestUpgrade};
// use hypercore_handshake::CipherTrait;
use hypercore_protocol::schema::*;
use hypercore_protocol::{
    discovery_key, Channel, Event as ProtocolEvent, Message, ProtocolBuilder,
};
use libp2p::{
    mdns,
    swarm::{NetworkBehaviour, SwarmEvent},
    PeerId, StreamProtocol, Swarm,
};
use libp2p_stream as stream;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::{mpsc, Mutex, Notify};

// P2P 模块负责网络连接、节点发现和建立复制流

#[derive(NetworkBehaviour)]
struct MyBehaviour {
    mdns: mdns::tokio::Behaviour,
    stream: stream::Behaviour,
}

#[derive(Clone)]
struct RegisteredCore {
    key: [u8; 32],
    core: Arc<Mutex<Hypercore>>,
    notify: Option<Arc<Notify>>,
}

pub struct P2PNode {
    swarm: Swarm<MyBehaviour>,
    command_rx: mpsc::Receiver<Command>,
    event_tx: mpsc::Sender<Event>,
    cores: HashMap<String, RegisteredCore>, // Key: Discovery Key (Hex)
}

#[derive(Debug)]
pub enum Command {
    Announce(String),                                              // 发布 Topic (Hex)
    Lookup(String),                                                // 查找 Topic (Hex)
    Replicate(String, Arc<Mutex<Hypercore>>, Option<Arc<Notify>>), // 注册需要复制的 Core (Key Hex, Core, Notify)
}

#[derive(Debug)]
pub enum Event {
    PeerFound(String),
    ConnectionEstablished(String),
}

const MOST_BOX_PROTOCOL: StreamProtocol = StreamProtocol::new("/most-box/replication/1.0.0");

impl P2PNode {
    pub fn new(command_rx: mpsc::Receiver<Command>, event_tx: mpsc::Sender<Event>) -> Result<Self> {
        // 1. 生成身份密钥
        let local_key = libp2p::identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());
        println!("(P2P) 本地 PeerID: {}", local_peer_id);

        // 2. 构建 Swarm (使用 libp2p 0.53+ Builder API)
        let swarm = libp2p::SwarmBuilder::with_existing_identity(local_key)
            .with_tokio()
            .with_tcp(
                libp2p::tcp::Config::default(),
                libp2p::noise::Config::new,
                libp2p::yamux::Config::default,
            )?
            .with_behaviour(|key| {
                // MDNS 发现
                let mdns = mdns::tokio::Behaviour::new(
                    mdns::Config::default(),
                    key.public().to_peer_id(),
                )?;
                // Stream 行为
                let stream = stream::Behaviour::new();
                Ok(MyBehaviour { mdns, stream })
            })?
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        Ok(Self {
            swarm,
            command_rx,
            event_tx,
            cores: HashMap::new(),
        })
    }

    pub async fn run(mut self) -> Result<()> {
        // 监听所有接口的随机端口
        self.swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

        let mut incoming_streams = self
            .swarm
            .behaviour()
            .stream
            .new_control()
            .accept(MOST_BOX_PROTOCOL)?;

        loop {
            tokio::select! {
                // 处理外部命令
                command = self.command_rx.recv() => {
                    match command {
                        Some(Command::Announce(topic)) => {
                            println!("(P2P) Announcing topic: {}", topic);
                            // TODO: 在 MDNS/DHT 中广播
                        }
                        Some(Command::Lookup(topic)) => {
                            println!("(P2P) Looking up topic: {}", topic);
                            // TODO: 在 MDNS/DHT 中查找
                        }
                        Some(Command::Replicate(key_hex, core, notify)) => {
                            let key_bytes = hex::decode(&key_hex)?;
                            let key: [u8; 32] = key_bytes
                                .try_into()
                                .map_err(|_| anyhow::anyhow!("Invalid core key length: {}", key_hex))?;

                            let dkey = discovery_key(&key);
                            let dkey_hex = hex::encode(dkey);

                            println!("(P2P) Registering core for replication: {}", dkey_hex);
                            self.cores.insert(dkey_hex, RegisteredCore { key, core, notify });
                        }
                        None => break, // Channel closed
                    }
                }

                incoming = incoming_streams.next() => {
                    if let Some((peer_id, stream)) = incoming {
                        let cores = self.cores.clone();
                        tokio::spawn(async move {
                            if let Err(e) = handle_protocol(stream, false, cores).await {
                                eprintln!("(P2P) Incoming stream error from {}: {}", peer_id, e);
                            }
                        });
                    } else {
                        break;
                    }
                }

                // 处理 Swarm 事件
                event = self.swarm.select_next_some() => {
                    match event {
                        SwarmEvent::NewListenAddr { address, .. } => {
                            println!("(P2P) 监听地址: {}", address);
                        }
                        SwarmEvent::Behaviour(MyBehaviourEvent::Mdns(mdns::Event::Discovered(list))) => {
                            for (peer_id, _multiaddr) in list {
                                println!("(P2P) 发现节点: {}", peer_id);
                                let _ = self.swarm.dial(peer_id); // 自动连接发现的节点
                                let _ = self.event_tx.send(Event::PeerFound(peer_id.to_string())).await;
                            }
                        }
                        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                            println!("(P2P) 已连接: {}", peer_id);
                            let _ = self.event_tx.send(Event::ConnectionEstablished(peer_id.to_string())).await;

                            // 主动打开复制流 (Client Side)
                            match self.swarm.behaviour().stream.new_control().open_stream(peer_id, MOST_BOX_PROTOCOL).await {
                                Ok(stream) => {
                                    println!("(P2P) 成功打开复制流到: {}", peer_id);
                                    let cores = self.cores.clone();
                                    // let stream = stream.compat(); // 不需要 compat，hypercore-protocol 0.6 使用 futures traits
                                    tokio::spawn(handle_protocol(stream, true, cores));
                                }
                                Err(e) => eprintln!("(P2P) 打开流失败: {}", e),
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        Ok(())
    }
}

/// 处理 Hypercore 协议握手与复制
async fn handle_protocol<S>(
    stream: S,
    is_initiator: bool,
    cores: HashMap<String, RegisteredCore>,
) -> Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    // 1. 创建协议实例
    let mut protocol = ProtocolBuilder::new(is_initiator).connect(stream);

    // 3. 事件循环
    while let Some(event) = protocol.next().await {
        match event {
            Ok(ProtocolEvent::Handshake(_)) => {
                if is_initiator {
                    for registered in cores.values() {
                        protocol.open(registered.key).await?;
                    }
                }
            }
            Ok(ProtocolEvent::DiscoveryKey(dkey)) => {
                let dkey_hex = hex::encode(dkey);
                if let Some(registered) = cores.get(&dkey_hex) {
                    protocol.open(registered.key).await?;
                }
            }
            Ok(ProtocolEvent::Channel(channel)) => {
                let dkey_hex = hex::encode(channel.discovery_key());
                if let Some(registered) = cores.get(&dkey_hex) {
                    println!("(P2P) 同步 Channel: {}", dkey_hex);
                    start_replication(channel, registered.core.clone(), registered.notify.clone());
                }
            }
            Ok(_) => {}
            Err(e) => {
                eprintln!("(P2P) Protocol error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

fn start_replication(channel: Channel, core: Arc<Mutex<Hypercore>>, notify: Option<Arc<Notify>>) {
    let mut channel = channel;
    let mut peer_state = PeerState::default();
    tokio::spawn(async move {
        let info = {
            let core = core.lock().await;
            core.info()
        };

        if info.fork != peer_state.remote_fork {
            peer_state.can_upgrade = false;
        }

        let remote_length = if info.fork == peer_state.remote_fork {
            peer_state.remote_length
        } else {
            0
        };

        let sync_msg = Synchronize {
            fork: info.fork,
            length: info.length,
            remote_length,
            can_upgrade: peer_state.can_upgrade,
            uploading: true,
            downloading: true,
        };

        if info.contiguous_length > 0 {
            let range_msg = Range {
                drop: false,
                start: 0,
                length: info.contiguous_length,
            };
            let _ = channel
                .send_batch(&[Message::Synchronize(sync_msg), Message::Range(range_msg)])
                .await;
        } else {
            let _ = channel.send(Message::Synchronize(sync_msg)).await;
        }

        while let Some(message) = channel.next().await {
            if let Err(e) = onmessage(
                &core,
                &mut peer_state,
                &mut channel,
                message,
                notify.as_ref(),
            )
            .await
            {
                eprintln!("(P2P) Replication error: {}", e);
                break;
            }
        }
    });
}

#[derive(Debug)]
struct PeerState {
    can_upgrade: bool,
    remote_fork: u64,
    remote_length: u64,
    remote_can_upgrade: bool,
    remote_uploading: bool,
    remote_downloading: bool,
    remote_synced: bool,
    length_acked: u64,
}

impl Default for PeerState {
    fn default() -> Self {
        Self {
            can_upgrade: true,
            remote_fork: 0,
            remote_length: 0,
            remote_can_upgrade: false,
            remote_uploading: true,
            remote_downloading: true,
            remote_synced: false,
            length_acked: 0,
        }
    }
}

async fn onmessage(
    core: &Arc<Mutex<Hypercore>>,
    peer_state: &mut PeerState,
    channel: &mut Channel,
    message: Message,
    notify: Option<&Arc<Notify>>,
) -> Result<()> {
    match message {
        Message::Synchronize(message) => {
            let length_changed = message.length != peer_state.remote_length;
            let first_sync = !peer_state.remote_synced;
            let info = {
                let core = core.lock().await;
                core.info()
            };
            let same_fork = message.fork == info.fork;

            peer_state.remote_fork = message.fork;
            peer_state.remote_length = message.length;
            peer_state.remote_can_upgrade = message.can_upgrade;
            peer_state.remote_uploading = message.uploading;
            peer_state.remote_downloading = message.downloading;
            peer_state.remote_synced = true;

            peer_state.length_acked = if same_fork { message.remote_length } else { 0 };

            let mut messages = vec![];

            if first_sync {
                messages.push(Message::Synchronize(Synchronize {
                    fork: info.fork,
                    length: info.length,
                    remote_length: peer_state.remote_length,
                    can_upgrade: peer_state.can_upgrade,
                    uploading: true,
                    downloading: true,
                }));
            }

            if peer_state.remote_length > info.length
                && peer_state.length_acked == info.length
                && length_changed
            {
                messages.push(Message::Request(Request {
                    id: 1,
                    fork: info.fork,
                    hash: None,
                    block: None,
                    seek: None,
                    upgrade: Some(RequestUpgrade {
                        start: info.length,
                        length: peer_state.remote_length - info.length,
                    }),
                }));
            }

            if !messages.is_empty() {
                channel.send_batch(&messages).await?;
            }
        }
        Message::Request(message) => {
            let (info, proof) = {
                let mut core = core.lock().await;
                let proof = core
                    .create_proof(message.block, message.hash, message.seek, message.upgrade)
                    .await?;
                (core.info(), proof)
            };
            if let Some(proof) = proof {
                channel
                    .send(Message::Data(Data {
                        request: message.id,
                        fork: info.fork,
                        hash: proof.hash,
                        block: proof.block,
                        seek: proof.seek,
                        upgrade: proof.upgrade,
                    }))
                    .await?;
            }
        }
        Message::Data(message) => {
            let mut followups: Vec<Message> = vec![];
            let new_info = {
                let mut core = core.lock().await;
                let old_info = core.info();
                let proof = message.clone().into_proof();
                let _applied = core.verify_and_apply_proof(&proof).await?;
                let new_info = core.info();

                let request_block: Option<RequestBlock> = if let Some(upgrade) = &message.upgrade {
                    if old_info.length < upgrade.length {
                        let request_index = old_info.length;
                        let nodes = core.missing_nodes(request_index).await?;
                        Some(RequestBlock {
                            index: request_index,
                            nodes,
                        })
                    } else {
                        None
                    }
                } else if let Some(block) = &message.block {
                    if block.index < peer_state.remote_length.saturating_sub(1) {
                        let request_index = block.index + 1;
                        let nodes = core.missing_nodes(request_index).await?;
                        Some(RequestBlock {
                            index: request_index,
                            nodes,
                        })
                    } else {
                        None
                    }
                } else {
                    None
                };

                if let Some(upgrade) = &message.upgrade {
                    let remote_length = if new_info.fork == peer_state.remote_fork {
                        peer_state.remote_length
                    } else {
                        0
                    };
                    followups.push(Message::Synchronize(Synchronize {
                        fork: new_info.fork,
                        length: upgrade.length,
                        remote_length,
                        can_upgrade: false,
                        uploading: true,
                        downloading: true,
                    }));
                }

                if let Some(request_block) = request_block {
                    followups.push(Message::Request(Request {
                        id: request_block.index + 1,
                        fork: new_info.fork,
                        hash: None,
                        block: Some(request_block),
                        seek: None,
                        upgrade: None,
                    }));
                }

                new_info
            };

            if let Some(notify) = notify {
                notify.notify_one();
            }

            if !followups.is_empty() {
                channel.send_batch(&followups).await?;
            }

            let _ = new_info;
        }
        _ => {}
    }
    Ok(())
}
