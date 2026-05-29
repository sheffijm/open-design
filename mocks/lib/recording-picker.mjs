// Pick which recording to play back, driven by env vars.
//
// Priority order:
//   1. OD_MOCKS_TRACE                → fixed trace id (or prefix)
//   2. OD_MOCKS_BY_PROMPT_HASH=1     → hash(prompt) → trace
//   3. OD_MOCKS_POOL=<tag>           → random within tag pool
//   4. (default)                                → random across all
//
// OD_MOCKS_SEED gives reproducible "random" selection.
// OD_MOCKS_RECORDINGS_DIR overrides the default recordings dir
// (defaults to ../recordings/ relative to this file).

import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RECORDINGS_DIR =
  process.env.OD_MOCKS_RECORDINGS_DIR ||
  join(HERE, '..', 'recordings');

async function listRecordings(dir) {
  try {
    return (await readdir(dir))
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace(/\.jsonl$/, ''))
      .sort();
  } catch {
    return [];
  }
}

async function readMeta(dir, traceId) {
  try {
    const txt = await readFile(join(dir, `${traceId}.jsonl`), 'utf-8');
    const firstLine = txt.split('\n', 1)[0];
    return JSON.parse(firstLine);
  } catch {
    return null;
  }
}

function pickRandom(arr, seed) {
  if (arr.length === 0) return null;
  if (!seed) return arr[Math.floor(Math.random() * arr.length)];
  const h = parseInt(createHash('sha256').update(String(seed)).digest('hex').slice(0, 12), 16);
  return arr[h % arr.length];
}

export async function pickRecording({ prompt } = {}) {
  const dir = DEFAULT_RECORDINGS_DIR;
  const all = await listRecordings(dir);
  if (all.length === 0) return null;

  // 1. fixed — if the env is set, refuse to fall through to random / pool /
  //    hash selection. A typo in `OD_MOCKS_TRACE` should surface loudly,
  //    not silently produce a different trace and silently poison a test.
  const fixed = process.env.OD_MOCKS_TRACE;
  if (fixed) {
    const hit = all.find(id => id === fixed) ?? all.find(id => id.startsWith(fixed));
    if (hit) return { traceId: hit, path: join(dir, `${hit}.jsonl`), method: 'fixed' };
    throw new Error(
      `OD_MOCKS_TRACE="${fixed}" set but no matching recording in ${dir}. ` +
      `8-char id prefix is supported; check spelling and that the corpus has been fetched ` +
      `(\`bash mocks/scripts/fetch-recordings.sh\`).`
    );
  }

  // 2. prompt-hash
  if (process.env.OD_MOCKS_BY_PROMPT_HASH === '1' && prompt) {
    const picked = pickRandom(all, prompt);
    if (picked) return { traceId: picked, path: join(dir, `${picked}.jsonl`), method: 'hash' };
  }

  // 3. pool by tag
  const pool = process.env.OD_MOCKS_POOL;
  if (pool) {
    const candidates = [];
    for (const id of all) {
      const meta = await readMeta(dir, id);
      if (!meta) continue;
      const tags = meta.tags ?? [];
      if (
        tags.includes(pool) ||
        meta.agent === pool ||
        tags.some(t => typeof t === 'string' && t.includes(pool))
      ) {
        candidates.push(id);
      }
    }
    if (candidates.length > 0) {
      const picked = pickRandom(candidates, process.env.OD_MOCKS_SEED);
      if (picked) return { traceId: picked, path: join(dir, `${picked}.jsonl`), method: 'pool', pool };
    }
  }

  // 4. random
  const picked = pickRandom(all, process.env.OD_MOCKS_SEED);
  if (!picked) return null;
  return { traceId: picked, path: join(dir, `${picked}.jsonl`), method: 'random' };
}

export async function readRecording(path) {
  const text = await readFile(path, 'utf-8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
