use anyhow::Result;
use most_box::p2p::{Command, Event, P2PNode};
use tokio::sync::mpsc;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<()> {
    // 创建命令通道
    let (cmd_tx, cmd_rx) = mpsc::channel(10);
    let (event_tx, mut event_rx) = mpsc::channel(10);

    // 启动 P2P 节点
    let node = P2PNode::new(cmd_rx, event_tx)?;
    
    // 在后台运行节点
    tokio::spawn(async move {
        if let Err(e) = node.run().await {
            eprintln!("P2P Node Error: {}", e);
        }
    });

    println!("P2P 节点已启动，正在监听 MDNS...");

    // 模拟发布 Topic
    cmd_tx.send(Command::Announce("test-topic".to_string())).await?;

    // 监听事件
    while let Some(event) = event_rx.recv().await {
        println!("收到事件: {:?}", event);
        
        match event {
            Event::PeerFound(peer_id) => {
                println!("发现对等节点: {}", peer_id);
            }
            Event::ConnectionEstablished(peer_id) => {
                println!("成功连接到: {}", peer_id);
                // 这里可以开始 Hypercore 复制协议握手
            }
        }
    }

    Ok(())
}
