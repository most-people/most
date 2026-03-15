use anyhow::Result;
use std::env;
use std::path::Path;
use tokio::sync::mpsc;
use libp2p::Multiaddr;
use most_box::p2p::P2PConfig;

// Use modules from the library crate
use most_box::downloader::Downloader;
use most_box::publisher::Publisher;

#[tokio::main]
async fn main() -> Result<()> {
    // Basic CLI implementation
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    // Parse global flags like --bootnode and --port
    let mut bootnodes = vec![];
    let mut port = 0;
    
    // Simple argument parser to extract flags before command
    let command = args[1].clone();
    let command_args = if args.len() > 2 { &args[2..] } else { &[] };

    // Note: A real CLI should use `clap` or `structopt`. 
    // Here we just look for environment variables or simple parsing if we had time to refactor.
    // For now, let's use environment variables for P2P config to avoid breaking existing CLI structure,
    // or parse from the end of args if provided.
    
    // Better approach: Let's check for specific env vars
    if let Ok(bn) = env::var("MOST_BOOTNODE") {
        if let Ok(addr) = bn.parse::<Multiaddr>() {
            bootnodes.push(addr);
        }
    }
    if let Ok(p) = env::var("MOST_PORT") {
        port = p.parse().unwrap_or(0);
    }
    
    let config = P2PConfig {
        bootnodes,
        port,
        enable_upnp: true,
        enable_relay: true,
    };

    match command.as_str() {
        "publish" => {
            if command_args.is_empty() {
                println!("Error: Missing file path.");
                print_usage();
                return Ok(());
            }
            let path_str = &command_args[0];
            let path = Path::new(path_str);
            if !path.exists() {
                println!("Error: File not found: {}", path_str);
                return Ok(());
            }

            println!("Starting publication for: {:?}", path);
            match Publisher::publish_with_config(path, config).await {
                Ok(pub_info) => {
                    println!("✅ Published Successfully!");
                    println!("--------------------------------------------------");
                    println!("File Name: {:?}", path.file_name().unwrap_or_default());
                    
                    // 构建增强型链接 (包含 bootnodes)
                    let mut link = format!("most://{}", pub_info.metadata_pk);
                    if !pub_info.listen_addrs.is_empty() {
                        let mut nodes_str = String::new();
                        for (i, addr) in pub_info.listen_addrs.iter().enumerate() {
                            if i > 0 { nodes_str.push(','); }
                            nodes_str.push_str(&addr.to_string());
                        }
                        link.push_str("?bootnodes=");
                        link.push_str(&nodes_str);
                    }

                    println!("Share Link: {}", link);
                    println!("--------------------------------------------------");
                    println!("(Debug) Data Core PK: {}", pub_info.data_pk);
                    println!("(Debug) Local Addresses: {:?}", pub_info.listen_addrs);
                    println!("--------------------------------------------------");
                    println!("Seeding... Press Ctrl-C to exit.");
                    tokio::signal::ctrl_c().await?;
                }
                Err(e) => eprintln!("❌ Error publishing: {}", e),
            }
        }
        "download" => {
            if command_args.is_empty() {
                println!("Error: Missing URI.");
                print_usage();
                return Ok(());
            }
            let uri = command_args[0].clone();
            println!("Starting download for: {}", uri);

            let (tx, mut rx) = mpsc::channel(100);

            // Spawn the download task
            tokio::spawn(async move {
                match Downloader::start_download_with_config(&uri, tx, config).await {
                    Ok(path) => println!("\n✅ Saved to: {}", path),
                    Err(e) => eprintln!("❌ Download error: {}", e),
                };
            });

            // UI Loop: Receive progress updates
            println!("Waiting for metadata...");
            while let Some(progress) = rx.recv().await {
                let percent = if progress.total_bytes > 0 {
                    (progress.downloaded_bytes as f64 / progress.total_bytes as f64) * 100.0
                } else {
                    0.0
                };

                // Clear line and print progress (simple animation)
                print!(
                    "\rDownloading: [{:<50}] {:.2}% ({}/{} bytes)",
                    "=".repeat((percent / 2.0) as usize),
                    percent,
                    progress.downloaded_bytes,
                    progress.total_bytes
                );

                if progress.downloaded_bytes >= progress.total_bytes {
                    println!("\n✅ Download complete!");
                    break;
                }
            }
        }
        _ => {
            println!("Unknown command: {}", command);
            print_usage();
        }
    }

    Ok(())
}

fn print_usage() {
    println!("Most.Box - Decentralized CDN & Resource Sharing");
    println!("Usage:");
    println!("  most-box publish <file_path>   # Publish a file to the network");
    println!("  most-box download <uri>        # Download a file from a most:// URI");
    println!("");
    println!("Environment Variables:");
    println!("  MOST_BOOTNODE=<multiaddr>      # Set a custom P2P bootnode");
    println!("  MOST_PORT=<port>               # Set a specific listening port (default: random)");
}
