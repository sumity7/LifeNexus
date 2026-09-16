import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Stores files under <root>/<userId>/<random>.bin. Keys are generated server
 * side and validated on every read, so no user-supplied path segment ever
 * reaches the filesystem.
 */
export class LocalStorageProvider {
  constructor(root) {
    this.root = path.resolve(root);
  }

  resolve(key) {
    if (!/^[a-f\d]{24}\/[a-f\d]{48}\.bin$/.test(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async save({ buffer, userId }) {
    const key = `${userId}/${crypto.randomBytes(24).toString('hex')}.bin`;
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer, { flag: 'wx', mode: 0o600 });
    return key;
  }

  async read(key) {
    const full = this.resolve(key);
    const stat = await fsp.stat(full);
    return { stream: fs.createReadStream(full), size: stat.size };
  }

  async remove(key) {
    try {
      await fsp.unlink(this.resolve(key));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async removeAll(userId) {
    if (!/^[a-f\d]{24}$/.test(String(userId))) return;
    await fsp.rm(path.join(this.root, String(userId)), { recursive: true, force: true });
  }
}
