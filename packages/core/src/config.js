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

// DHT Bootstrap nodes for Hyperswarm
// Using multiple bootstrap nodes improves connection reliability
export const SWARM_BOOTSTRAP = [
  // Default Hyperswarm bootstrap nodes
  { host: 'bootstrap1.hyperswarm.org', port: 49737 },
  { host: 'bootstrap2.hyperswarm.org', port: 49737 },
  { host: 'bootstrap3.hyperswarm.org', port: 49737 },
  // Additional public DHT nodes for better global coverage
  { host: 'router.bittorrent.com', port: 6881 },
  { host: 'router.utorrent.com', port: 6881 },
  { host: 'dht.transmissionbt.com', port: 6881 },
  // Fallback nodes
  { host: 'dht.libtorrent.org', port: 25401 },
  { host: 'dht.aelitis.com', port: 6881 },
  // Additional nodes for better global coverage (including China)
  { host: 'dht.acgnx.com', port: 6881 },
  { host: 'dht.acgnx.se', port: 6881 },
  // IPv6 nodes
  { host: '2400:8902::f03c:93ff:fe74:1683', port: 6881 },
  { host: '2a01:4f8:212:1b24::3', port: 6881 },
  // Additional nodes from qBittorrent list
  { host: 'router.silotis.us', port: 6881 },
  { host: 'dht.anacrolix.link', port: 42069 }
]