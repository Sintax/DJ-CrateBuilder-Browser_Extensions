import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeChrome } from './helpers/fake-chrome.js';
import { getSent, recordSent, history, clearAll } from '../src/lib/sent-memory.js';

test('sent-memory round trip, history order, and clear', async () => {
  const fake = installFakeChrome();
  try {
    assert.equal(await getSent('https://soundcloud.com/a'), null);

    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 1000);
    await recordSent('https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { kind: 'track', platform: 'youtube' }, 2000);

    assert.deepEqual(await getSent('https://soundcloud.com/a'),
      { kind: 'channel', platform: 'soundcloud', sentAt: 1000 });

    const h = await history();
    assert.deepEqual(h.map((e) => e.url), [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',   // newest first
      'https://soundcloud.com/a',
    ]);
    assert.equal(h[0].kind, 'track');

    await clearAll();
    assert.equal((await history()).length, 0);
    assert.equal(await getSent('https://soundcloud.com/a'), null);
  } finally {
    fake.uninstall();
  }
});

test('history caps at the limit', async () => {
  const fake = installFakeChrome();
  try {
    for (let i = 0; i < 60; i++) {
      await recordSent(`https://soundcloud.com/artist${i}`,
        { kind: 'channel', platform: 'soundcloud' }, i);
    }
    const h = await history();
    assert.equal(h.length, 50);
    assert.equal(h[0].url, 'https://soundcloud.com/artist59'); // newest kept
  } finally {
    fake.uninstall();
  }
});

test('re-sending overwrites the record (keyed by canonical URL)', async () => {
  const fake = installFakeChrome();
  try {
    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 1000);
    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 5000);
    assert.equal((await getSent('https://soundcloud.com/a')).sentAt, 5000);
    assert.equal((await history()).length, 1);
  } finally {
    fake.uninstall();
  }
});
