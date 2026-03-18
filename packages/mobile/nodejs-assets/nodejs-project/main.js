// Most Box Mobile - Node.js Backend Entry
// This runs inside nodejs-mobile-react-native's embedded Node.js runtime

const bridge = require('rn-bridge');
const { MostBoxEngine } = require('@most-box/core');

let engine = null;

async function initializeEngine() {
  const storagePath = bridge.app.datadir() + '/most-box-storage';
  const downloadPath = bridge.app.datadir() + '/downloads';

  engine = new MostBoxEngine({
    storagePath,
    downloadPath
  });

  // Forward events to React Native
  engine.on('download:progress', (data) => {
    bridge.channel.send(JSON.stringify({ type: 'download:progress', ...data }));
  });

  engine.on('download:status', (data) => {
    bridge.channel.send(JSON.stringify({ type: 'download:status', ...data }));
  });

  engine.on('download:success', (data) => {
    bridge.channel.send(JSON.stringify({ type: 'download:success', ...data }));
  });

  engine.on('publish:progress', (data) => {
    bridge.channel.send(JSON.stringify({ type: 'publish:progress', ...data }));
  });

  engine.on('publish:success', (data) => {
    bridge.channel.send(JSON.stringify({ type: 'publish:success', ...data }));
  });

  engine.on('connection', () => {
    if (engine) {
      const status = engine.getNetworkStatus();
      bridge.channel.send(JSON.stringify({ type: 'network:status', ...status }));
    }
  });

  await engine.start();
  bridge.channel.send(JSON.stringify({ type: 'ready' }));
}

// Handle messages from React Native
bridge.channel.on('message', async (rawMsg) => {
  let msg;
  try {
    msg = JSON.parse(rawMsg);
  } catch (err) {
    bridge.channel.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
    return;
  }

  if (!engine) {
    bridge.channel.send(JSON.stringify({ type: 'error', message: 'Engine not initialized' }));
    return;
  }

  try {
    let result;

    switch (msg.type) {
      case 'get-node-id':
        result = { type: 'node-id', id: engine.getNodeId() };
        break;

      case 'get-network-status':
        result = { type: 'network-status', ...engine.getNetworkStatus() };
        break;

      case 'publish-file':
        const publishResult = await engine.publishFile(msg.filePath, msg.fileName);
        result = { type: 'publish-success', ...publishResult };
        break;

      case 'download-file':
        const downloadResult = await engine.downloadFile(msg.link);
        result = { type: 'download-success', ...downloadResult };
        break;

      case 'list-published-files':
        const files = engine.listPublishedFiles();
        result = { type: 'published-files-list', files };
        break;

      case 'delete-published-file':
        const updatedFiles = engine.deletePublishedFile(msg.cid);
        result = { type: 'published-files-list', files: updatedFiles };
        break;

      default:
        result = { type: 'error', message: `Unknown message type: ${msg.type}` };
    }

    bridge.channel.send(JSON.stringify(result));
  } catch (err) {
    bridge.channel.send(JSON.stringify({ 
      type: 'error', 
      message: err.message, 
      code: err.code || 'UNKNOWN' 
    }));
  }
});

// Initialize
initializeEngine().catch(err => {
  console.error('Failed to initialize engine:', err);
  bridge.channel.send(JSON.stringify({ type: 'error', message: err.message }));
});