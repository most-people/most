/**
 * 应用配置
 */

// 文件大小限制
export const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024 // 100 GB

// 网络超时（毫秒）
export const CONNECTION_TIMEOUT = 120000
export const DOWNLOAD_TIMEOUT = 900000

// P2P 设置
export const GLOBAL_SHARED_SEED_STRING = 'most-box-global-shared-seed-v1'
export const MAX_PEERS = 64
export const SWARM_KEEP_ALIVE_INTERVAL = 5000
export const SWARM_RANDOM_PUNCH_INTERVAL = 20000

// 驱动器超时（毫秒）
export const DRIVE_ENTRY_TIMEOUT = 10000
export const DRIVE_SYNC_TIMEOUT = 10000
export const STREAM_READ_TIMEOUT = 10000

// 下载轮询间隔（毫秒）
export const DOWNLOAD_POLL_INTERVAL = 1000

// 进度更新节流间隔（毫秒）
export const PROGRESS_THROTTLE = 500

// 默认读取限制
export const DEFAULT_READ_LIMIT = 10000

// DHT 引导节点，用于 Hyperswarm/HyperDHT
// 使用与 Keet.io/HyperDHT 相同的引导节点以保证兼容性
// 格式：[suggested-IP@]<host>:<port> 以避免 DNS 调用
export const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737'
]

export const FRIEND_CODE_LENGTH = 16
export const FRIEND_CODE_PREFIX = 'MOST'

export const CHANNEL_NAME_MIN_LENGTH = 3
export const CHANNEL_NAME_MAX_LENGTH = 20
export const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/
export const CHANNEL_NAME_PREFIX = 'most-box-room-'
export const CHANNEL_TOPIC_STRING = 'most-box-channels-v1'
export const CHANNEL_MESSAGE_LIMIT = 100
export const MAX_MESSAGE_LENGTH = 10000