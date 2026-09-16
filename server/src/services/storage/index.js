import { LocalStorageProvider } from './local.js';
import { S3StorageProvider } from './s3.js';
import { env } from '../../config/env.js';

/**
 * Storage provider interface:
 *   save({ buffer, mimeType, userId }) → storageKey
 *   read(storageKey) → { stream, size }
 *   remove(storageKey) → void
 *   removeAll(userId) → void
 *
 * "local" (disk) and "s3" (AWS S3 or any S3-compatible provider — R2, MinIO,
 * Spaces, B2) ship built in, selected via STORAGE_PROVIDER. To add another
 * backend, implement the same four methods and select it here.
 */
let provider;

export function createStorage(config = env) {
  switch (config.STORAGE_PROVIDER) {
    case 's3':
      return new S3StorageProvider({
        bucket: config.S3_BUCKET,
        region: config.S3_REGION,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      });
    case 'local':
    default:
      return new LocalStorageProvider(config.STORAGE_DIR);
  }
}

export function getStorage() {
  provider ??= createStorage();
  return provider;
}
