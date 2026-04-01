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

// DHT 引导节点，用于 Hyperswarm/HyperDHT
// 使用与 Keet.io/HyperDHT 相同的引导节点以保证兼容性
// 格式：[suggested-IP@]<host>:<port> 以避免 DNS 调用
export const SWARM_BOOTSTRAP = [
  '88.99.3.86@node1.hyperdht.org:49737',
  '142.93.90.113@node2.hyperdht.org:49737',
  '138.68.147.8@node3.hyperdht.org:49737'
]