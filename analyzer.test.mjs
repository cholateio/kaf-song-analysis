import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// An invalid id keeps every case offline: without the flag guard the run
// stops at video-id parsing, before yt-dlp, storage or the database.
function run(...args) {
  return spawnSync(process.execPath, ['analyzer.mjs', '--url', 'not-an-id', ...args], { encoding: 'utf8' });
}

for (const flag of ['--list-captions', '--skip-lyrics', '--dryrun']) {
  test(`rejects unknown flag ${flag} before doing any work`, () => {
    const r = run(flag);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, new RegExp(`unknown flag.*${flag}`));
  });
}

test('known flags still reach video-id parsing', () => {
  const r = run('--dry-run', '--force', '--genre', 'cover');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout + r.stderr, /unknown flag/);
  assert.match(r.stdout + r.stderr, /could not extract a YouTube video ID/);
});
