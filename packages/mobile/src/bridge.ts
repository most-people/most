/**
 * Most Box Mobile - Node.js Bridge
 * Provides a type-safe interface for communicating with the Node.js backend
 */

import nodejs from 'nodejs-mobile-react-native';

type MessageHandler = (data: any) => void;
const listeners = new Map<string, Set<MessageHandler>>();

// Initialize listener for all messages from Node.js
nodejs.channel.addListener('message', (rawMsg: string) => {
  try {
    const msg = JSON.parse(rawMsg);
    const handlers = listeners.get(msg.type);
    if (handlers) {
      handlers.forEach(h => h(msg));
    }
    // Also emit to wildcard listeners
    const wildcardHandlers = listeners.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(h => h(msg));
    }
  } catch (err) {
    console.error('Failed to parse message from Node.js:', err);
  }
});

/**
 * Send a message to the Node.js backend
 */
export function send(type: string, payload?: any): void {
  nodejs.channel.send(JSON.stringify({ type, ...payload }));
}

/**
 * Listen for messages from the Node.js backend
 */
export function on(type: string, handler: MessageHandler): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(handler);
  
  // Return unsubscribe function
  return () => {
    listeners.get(type)?.delete(handler);
  };
}

/**
 * Start the Node.js process
 */
export function startNodeProcess(): void {
  nodejs.start('main.js');
}

// --- Type-safe API wrappers ---

export const MostBoxMobile = {
  start: startNodeProcess,

  getNodeId: (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const unsubscribe = on('node-id', (data) => {
        unsubscribe();
        if (data.id) {
          resolve(data.id);
        } else {
          reject(new Error('Failed to get node ID'));
        }
      });
      send('get-node-id');
    });
  },

  getNetworkStatus: (): Promise<{ peers: number; status: string }> => {
    return new Promise((resolve) => {
      const unsubscribe = on('network-status', (data) => {
        unsubscribe();
        resolve({ peers: data.peers, status: data.status });
      });
      send('get-network-status');
    });
  },

  publishFile: (filePath: string, fileName: string): Promise<{ cid: string; link: string; fileName: string }> => {
    return new Promise((resolve, reject) => {
      const unsubscribe = on('publish-success', (data) => {
        unsubscribe();
        resolve(data);
      });
      const errorUnsub = on('error', (data) => {
        errorUnsub();
        unsubscribe();
        reject(new Error(data.message));
      });
      send('publish-file', { filePath, fileName });
    });
  },

  downloadFile: (link: string): Promise<{ fileName: string; savedPath: string }> => {
    return new Promise((resolve, reject) => {
      const unsubscribe = on('download-success', (data) => {
        unsubscribe();
        resolve(data);
      });
      const errorUnsub = on('error', (data) => {
        errorUnsub();
        unsubscribe();
        reject(new Error(data.message));
      });
      send('download-file', { link });
    });
  },

  listPublishedFiles: (): Promise<any[]> => {
    return new Promise((resolve) => {
      const unsubscribe = on('published-files-list', (data) => {
        unsubscribe();
        resolve(data.files || []);
      });
      send('list-published-files');
    });
  },

  deletePublishedFile: (cid: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const unsubscribe = on('published-files-list', (data) => {
        unsubscribe();
        resolve(data.files || []);
      });
      send('delete-published-file', { cid });
    });
  },

  // Event listeners (for real-time updates)
  onDownloadProgress: (handler: MessageHandler) => on('download:progress', handler),
  onDownloadStatus: (handler: MessageHandler) => on('download:status', handler),
  onPublishProgress: (handler: MessageHandler) => on('publish:progress', handler),
  onNetworkStatus: (handler: MessageHandler) => on('network:status', handler),
  onReady: (handler: MessageHandler) => on('ready', handler),
};

export default MostBoxMobile;