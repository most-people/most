/**
 * Application Configuration
 */

// File size limits
export const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024 // 100 GB

// Network timeouts (ms)
export const CONNECTION_TIMEOUT = 120000
export const DOWNLOAD_TIMEOUT = 900000

// P2P settings
export const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'

// DHT Bootstrap nodes for Hyperswarm/HyperDHT
// Using the same bootstrap nodes as Keet.io/HyperDHT for compatibility
// Format: [suggested-IP@]<host>:<port> to avoid DNS calls
export const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737'
]