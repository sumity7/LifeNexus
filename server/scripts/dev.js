/**
 * Development runner: restarts the API only when a source file's *content*
 * changes. Plain `node --watch` also restarts on metadata churn (cloud-sync
 * folders, antivirus scans), which drops in-flight requests.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watchDirs = [path.join(root, 'src')];
const entry = path.join(root, 'src/index.js');
const hashes = new Map();
let child = null;
let restartTimer = null;

const hashFile = (file) => {
  try {
    return createHash('md5').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null; // deleted or mid-write
  }
};

function snapshot(dir) {
  for (const entryName of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entryName.name);
    if (entryName.isDirectory()) snapshot(full);
    else hashes.set(full, hashFile(full));
  }
}

function start() {
  child = spawn(process.execPath, [entry], { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (child?.restarting) return;
    console.error(`API exited (${signal ?? code}); waiting for changes…`);
    child = null;
  });
}

function restart(file) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`↻ ${path.relative(root, file)} changed — restarting API`);
    if (child) {
      child.restarting = true;
      child.once('exit', () => start());
      child.kill();
    } else {
      start();
    }
  }, 150);
}

for (const dir of watchDirs) {
  snapshot(dir);
  fs.watch(dir, { recursive: true }, (_event, name) => {
    if (!name) return;
    const file = path.join(dir, name);
    const next = hashFile(file);
    if (next === hashes.get(file)) return; // metadata-only event
    hashes.set(file, next);
    restart(file);
  });
}

start();
process.on('SIGINT', () => {
  child?.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  child?.kill();
  process.exit(0);
});
