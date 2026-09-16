import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const KEY_RE = /^[a-f\d]{24}\/[a-f\d]{48}\.bin$/;

/**
 * S3-compatible object storage — works with AWS S3, Cloudflare R2, MinIO,
 * DigitalOcean Spaces, Backblaze B2, or anything else speaking the S3 API.
 * Required for platforms with ephemeral/non-persistent disks (documents
 * uploaded to local disk on those platforms are lost on every restart/deploy).
 *
 * Same interface and key scheme as LocalStorageProvider — userId is used as
 * an object-key prefix (S3's equivalent of a folder), so `removeAll` lists by
 * prefix and batch-deletes.
 */
export class S3StorageProvider {
  constructor({ bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle, client }) {
    if (!bucket) throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    this.bucket = bucket;
    this.client = client ?? new S3Client({
      region: region || 'auto',
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(forcePathStyle ? { forcePathStyle: true } : {}),
    });
  }

  validate(key) {
    if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
    return key;
  }

  async save({ buffer, mimeType, userId }) {
    const key = `${userId}/${crypto.randomBytes(24).toString('hex')}.bin`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      // Server-side encryption at rest (AWS S3 supports this natively; most S3-compatible
      // providers accept and honour the header, some ignore it harmlessly).
      ServerSideEncryption: 'AES256',
    }));
    return key;
  }

  async read(key) {
    this.validate(key);
    const [obj, head] = await Promise.all([
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })),
      this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })),
    ]);
    return { stream: obj.Body, size: head.ContentLength ?? 0 };
  }

  async remove(key) {
    this.validate(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch((err) => {
      if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) throw err;
    });
  }

  async removeAll(userId) {
    if (!/^[a-f\d]{24}$/.test(String(userId))) return;
    const prefix = `${userId}/`;
    let continuationToken;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
      const objects = (page.Contents ?? []).map((o) => ({ Key: o.Key }));
      if (objects.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }
}
