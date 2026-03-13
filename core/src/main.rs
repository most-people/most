use anyhow::Result;
use std::env;
use std::path::Path;
use tokio::sync::mpsc;

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

    match args[1].as_str() {
        "publish" => {
            if args.len() < 3 {
                println!("Error: Missing file path.");
                print_usage();
                return Ok(());
            }
            let path_str = &args[2];
            let path = Path::new(path_str);
            if !path.exists() {
                println!("Error: File not found: {}", path_str);
                return Ok(());
            }

            println!("Starting publication for: {:?}", path);
            match Publisher::publish(path).await {
                Ok(pub_info) => {
                    println!("✅ Published Successfully!");
                    println!("--------------------------------------------------");
                    println!("File Name: {:?}", path.file_name().unwrap_or_default());
                    println!("Data Core Public Key: {}", pub_info.data_pk);
                    println!("Metadata Core Link: most://{}", pub_info.metadata_pk);
                    println!("--------------------------------------------------");
                    println!("Seeding... Press Ctrl-C to exit.");
                    tokio::signal::ctrl_c().await?;
                }
                Err(e) => eprintln!("❌ Error publishing: {}", e),
            }
        }
        "download" => {
            if args.len() < 3 {
                println!("Error: Missing URI.");
                print_usage();
                return Ok(());
            }
            let uri = args[2].clone();
            println!("Starting download for: {}", uri);

            let (tx, mut rx) = mpsc::channel(100);

            // Spawn the download task
            // Note: In a real app, we'd keep the handle to await completion or errors
            tokio::spawn(async move {
                match Downloader::start_download(&uri, tx).await {
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
            println!("Unknown command: {}", args[1]);
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
}
