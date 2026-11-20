import { parseVideoId } from './youtube.mjs';

// URL list format shared with batch.mjs: one URL per line, optional genre tag
// after whitespace; blank lines and `#` comments are skipped.
export function parseUrlList(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(line => {
      const [url, tag] = line.split(/\s+/);
      return { line, url, tag: tag || null, videoId: parseVideoId(url) };
    });
}

// Entries whose video_id is not in the table yet, first occurrence only.
// Lines without a parseable id are dropped: analyzer.mjs would reject them.
export function pendingEntries(entries, existingIds) {
  const seen = new Set(existingIds);
  const out = [];
  for (const e of entries) {
    if (!e.videoId || seen.has(e.videoId)) continue;
    seen.add(e.videoId);
    out.push(e);
  }
  return out;
}
