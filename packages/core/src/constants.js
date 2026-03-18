/**
 * IPC Message Type Constants
 * Used for communication between main process and renderer process
 */

// From Renderer to Main (requests)
export const IPC_GET_NODE_ID = 'get-node-id'
export const IPC_PUBLISH_FILE = 'publish-file'
export const IPC_DOWNLOAD_FILE = 'download-file'
export const IPC_LIST_PUBLISHED_FILES = 'list-published-files'
export const IPC_DELETE_PUBLISHED_FILE = 'delete-published-file'
export const IPC_GET_NETWORK_STATUS = 'get-network-status'

// From Main to Renderer (responses/events)
export const IPC_NODE_ID = 'node-id'
export const IPC_PUBLISH_SUCCESS = 'publish-success'
export const IPC_DOWNLOAD_STATUS = 'download-status'
export const IPC_DOWNLOAD_PROGRESS = 'download-progress'
export const IPC_DOWNLOAD_FILE_RECEIVED = 'download-file-received'
export const IPC_DOWNLOAD_SUCCESS = 'download-success'
export const IPC_PUBLISHED_FILES_LIST = 'published-files-list'
export const IPC_NETWORK_STATUS = 'network-status'
export const IPC_ERROR = 'error'