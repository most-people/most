/**
 * Application Configuration
 */

// File size limits
export const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024 // 100 GB

// Network timeouts (ms)
export const CONNECTION_TIMEOUT = 30000
export const DOWNLOAD_TIMEOUT = 300000

// Storage paths
export const STORAGE_DIR = './most-box-storage'
export const METADATA_FILE = 'published-files.json'

// P2P settings
export const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'