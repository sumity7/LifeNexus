import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { S3StorageProvider } from '../src/services/storage/s3.js';
import { createStorage } from '../src/services/storage/index.js';
import { LocalStorageProvider } from '../src/services/storage/local.js';

/** A fake S3Client that records commands and returns scripted responses by command name. */
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      const handler = responses[name];
      if (!handler) throw new Error(`Unexpected S3 command: ${name}`);
      return typeof handler === 'function' ? handler(command.input) : handler;
    },
  };
}

describe('S3StorageProvider (unit, mocked S3 client)', () => {
  it('throws clearly when S3_BUCKET is missing', () => {
    assert.throws(() => new S3StorageProvider({ bucket: '' }), /S3_BUCKET is required/);
  });

  it('save() writes under a userId prefix with server-side encryption and returns the same key scheme as local storage', async () => {
    const client = fakeClient({ PutObjectCommand: {} });
    const provider = new S3StorageProvider({ bucket: 'my-bucket', client });
    const userId = '507f1f77bcf86cd799439011';
    const key = await provider.save({ buffer: Buffer.from('hi'), mimeType: 'application/pdf', userId });

    assert.match(key, /^[a-f\d]{24}\/[a-f\d]{48}\.bin$/);
    assert.ok(key.startsWith(`${userId}/`));
    const put = client.calls[0];
    assert.equal(put.name, 'PutObjectCommand');
    assert.equal(put.input.Bucket, 'my-bucket');
    assert.equal(put.input.ContentType, 'application/pdf');
    assert.equal(put.input.ServerSideEncryption, 'AES256');
  });

  it('read() rejects a key that does not match the expected scheme, before ever calling S3', async () => {
    const client = fakeClient({});
    const provider = new S3StorageProvider({ bucket: 'b', client });
    await assert.rejects(() => provider.read('../../etc/passwd'), /Invalid storage key/);
    assert.equal(client.calls.length, 0, 'a malformed key must never reach the network call');
  });

  it('read() returns the object stream and size', async () => {
    const key = '507f1f77bcf86cd799439011/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bin';
    const body = Readable.from([Buffer.from('data')]);
    const client = fakeClient({
      GetObjectCommand: { Body: body },
      HeadObjectCommand: { ContentLength: 4 },
    });
    const provider = new S3StorageProvider({ bucket: 'b', client });
    const result = await provider.read(key);
    assert.equal(result.stream, body);
    assert.equal(result.size, 4);
  });

  it('removeAll() paginates ListObjectsV2 and batch-deletes every page under the user prefix', async () => {
    const userId = '507f1f77bcf86cd799439011';
    let listCalls = 0;
    const client = fakeClient({
      ListObjectsV2Command: (input) => {
        listCalls++;
        assert.equal(input.Prefix, `${userId}/`);
        return listCalls === 1
          ? { Contents: [{ Key: `${userId}/a.bin` }, { Key: `${userId}/b.bin` }], IsTruncated: true, NextContinuationToken: 'page2' }
          : { Contents: [{ Key: `${userId}/c.bin` }], IsTruncated: false };
      },
      DeleteObjectsCommand: (input) => {
        assert.ok(input.Delete.Objects.length > 0);
        return {};
      },
    });
    const provider = new S3StorageProvider({ bucket: 'b', client });
    await provider.removeAll(userId);
    assert.equal(listCalls, 2, 'follows pagination via NextContinuationToken');
    const deletes = client.calls.filter((c) => c.name === 'DeleteObjectsCommand');
    assert.equal(deletes.length, 2, 'one batch delete per page');
  });

  it('removeAll() is a no-op for a non-ObjectId-shaped userId (never sends a wildcard prefix)', async () => {
    const client = fakeClient({});
    const provider = new S3StorageProvider({ bucket: 'b', client });
    await provider.removeAll('not-an-id');
    assert.equal(client.calls.length, 0);
  });
});

describe('createStorage() provider selection', () => {
  it('selects LocalStorageProvider by default', () => {
    const storage = createStorage({ STORAGE_PROVIDER: 'local', STORAGE_DIR: './uploads-test-selection' });
    assert.ok(storage instanceof LocalStorageProvider);
  });

  it('selects S3StorageProvider when configured', () => {
    const storage = createStorage({ STORAGE_PROVIDER: 's3', S3_BUCKET: 'my-bucket', S3_REGION: 'auto' });
    assert.ok(storage instanceof S3StorageProvider);
    assert.equal(storage.bucket, 'my-bucket');
  });
});
