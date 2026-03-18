import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { MostBoxEngine } from '../index.js';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('MostBoxEngine', () => {
  let engine = null;
  let testDir = null;

  beforeEach(() => {
    testDir = join(tmpdir(), `most-box-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (engine) {
      await engine.stop();
      engine = null;
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should create engine with storage path', () => {
    engine = new MostBoxEngine({ storagePath: testDir });
    assert.ok(engine);
  });

  test('should throw without storage path', () => {
    assert.throws(() => {
      new MostBoxEngine({});
    }, /storagePath is required/);
  });

  test('should start and stop engine', async () => {
    engine = new MostBoxEngine({ storagePath: testDir });
    await engine.start();
    assert.ok(engine.getNodeId());
    await engine.stop();
  });

  test('should return network status', async () => {
    engine = new MostBoxEngine({ storagePath: testDir });
    await engine.start();
    const status = engine.getNetworkStatus();
    assert.ok(typeof status.peers === 'number');
    assert.ok(typeof status.status === 'string');
  });

  test('should throw when calling methods before start', async () => {
    engine = new MostBoxEngine({ storagePath: testDir });
    assert.throws(() => {
      engine.getNodeId();
    }, /Engine not initialized/);
  });

  test('should list published files (empty initially)', async () => {
    engine = new MostBoxEngine({ storagePath: testDir });
    await engine.start();
    const files = engine.listPublishedFiles();
    assert.ok(Array.isArray(files));
    assert.strictEqual(files.length, 0);
  });
});

describe('CID Utilities', () => {
  test('should validate CID string', async () => {
    const { validateCidString } = await import('../src/core/cid.js');
    
    assert.deepStrictEqual(validateCidString('bafybeigdyrzt5sfp7udm7hu76uh7y2'), { valid: true });assert.deepStrictEqual(validateCidString(''), { valid: false, error: 'CID must be a non-empty string' });
    assert.deepStrictEqual(validateCidString('invalid'), { valid: false, error: 'Invalid CID format: CID v1 must start with "b"' });
  });

  test('should parse most:// link', async () => {
    const { parseMostLink } = await import('../src/core/cid.js');
    
    const result = parseMostLink('most://bafybeigdyrzt5sfp7udm7hu76uh7y2');
    assert.strictEqual(result.cid, 'bafybeigdyrzt5sfp7udm7hu76uh7y2');
    
    const emptyResult = parseMostLink('');
    assert.strictEqual(emptyResult.error, 'Link must be a non-empty string');
  });
});

describe('Security Utilities', () => {
  test('should sanitize filename', async () => {
    const { sanitizeFilename } = await import('../src/utils/security.js');
    
    assert.strictEqual(sanitizeFilename('normal.txt'), 'normal.txt');
    assert.strictEqual(sanitizeFilename('../../../etc/passwd'), '________etc_passwd');
    assert.strictEqual(sanitizeFilename(''), 'unnamed_file');
  });

  test('should validate path for traversal', async () => {
    const { validateAndSanitizePath } = await import('../src/utils/security.js');
    
    const safePath = validateAndSanitizePath('/tmp/safe/file.txt');
    assert.strictEqual(safePath.cleanPath, '/tmp/safe/file.txt');
    
   const traversalPath = validateAndSanitizePath('../../../etc/passwd');
    assert.ok(traversalPath.error);
  });

  test('should format file size', async () => {
    const { formatFileSize } = await import('../src/utils/security.js');
    
    assert.strictEqual(formatFileSize(0), '0.00 B');
    assert.strictEqual(formatFileSize(1024), '1.00 KB');
    assert.strictEqual(formatFileSize(1048576), '1.00 MB');
    assert.strictEqual(formatFileSize(1073741824), '1.00 GB');
  });
});