#!/usr/bin/env node
// Unattended release run, the scripted form of generate-urls → lint-titles →
// batch: scan the channel, keep only video ids not yet in kaf_songs, check
// each new title with parseTitle, and batch the ones that match a rule.
// Unmatched titles are skipped and listed for a human: an unknown naming
// pattern would be stored as-is and mis-sort the front end's A-Z index.
//
// Feeding batch.mjs only the new ids matters: it sleeps ~15 s between lines
// even for ids it then skips, so the full list would idle for about an hour.
//
// Usage:  node scripts/update.mjs   (run from anywhere; works in the repo root)
// Scheduled through scripts/scheduled-update.sh, see docs/DEVELOPMENT.md.

import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClient } from '../src/db.mjs';
import { fetchMetadata } from '../src/youtube.mjs';
import { parseTitle } from '../src/title.mjs';
import { parseUrlList, pendingEntries } from '../src/urlList.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_LIST = join(ROOT, 'urls-virtual_kaf.txt');

// Not dotenv/config: that reads the cwd's .env, and this may run from elsewhere.
dotenv.config({ path: join(ROOT, '.env'), quiet: true });

async function tableVideoIds() {
  const db = getClient();
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('kaf_songs').select('video_id').range(from, from + 999);
    if (error) throw new Error(`supabase select failed: ${error.message}`);
    ids.push(...data.map(r => r.video_id));
    if (data.length < 1000) return ids;
  }
}

function runNode(args) {
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  runNode(['generate-urls.mjs']);

  const pending = pendingEntries(parseUrlList(readFileSync(URL_LIST, 'utf8')), await tableVideoIds());
  if (pending.length === 0) {
    console.log('update: no new songs');
    return;
  }

  const ready = [];
  for (const e of pending) {
    try {
      const { title } = await fetchMetadata(e.videoId);
      const parsed = parseTitle(title);
      if (parsed.matched) {
        console.log(`update: new ${e.videoId}  ${title}  →  ${parsed.title}`);
        ready.push(e);
      } else {
        console.log(`update: SKIPPED ${e.videoId}  ${title}  (no title rule matched; add one in src/title.mjs, then run analyzer.mjs on it)`);
      }
    } catch (err) {
      console.log(`update: SKIPPED ${e.videoId}  metadata fetch failed: ${err.message}`);
    }
  }
  if (ready.length === 0) return;

  const dir = mkdtempSync(join(tmpdir(), 'kaf-song-update-'));
  try {
    const list = join(dir, 'new-urls.txt');
    writeFileSync(list, ready.map(e => e.line).join('\n') + '\n');
    runNode(['batch.mjs', list]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(`update: fatal: ${err.message}`);
  process.exit(1);
});
