import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUrlList, pendingEntries } from './urlList.mjs';

const LIST = `
# comment
https://www.youtube.com/watch?v=b4cPmesLgBo cover
https://youtu.be/jpwy7kP8Pps

not-a-url
https://www.youtube.com/watch?v=b4cPmesLgBo cover
`;

test('parseUrlList keeps url, tag and video id, skipping blanks and comments', () => {
  const entries = parseUrlList(LIST);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], {
    line: 'https://www.youtube.com/watch?v=b4cPmesLgBo cover',
    url: 'https://www.youtube.com/watch?v=b4cPmesLgBo',
    tag: 'cover',
    videoId: 'b4cPmesLgBo',
  });
  assert.equal(entries[1].tag, null);
  assert.equal(entries[1].videoId, 'jpwy7kP8Pps');
  assert.equal(entries[2].videoId, null);
});

test('pendingEntries drops ids already in the table, unparseable lines and duplicates', () => {
  const entries = parseUrlList(LIST);
  assert.deepEqual(pendingEntries(entries, ['jpwy7kP8Pps']).map(e => e.videoId), ['b4cPmesLgBo']);
  assert.deepEqual(pendingEntries(entries, ['jpwy7kP8Pps', 'b4cPmesLgBo']), []);
});
