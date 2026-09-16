import test from 'node:test';
import assert from 'node:assert/strict';

import { popupModel } from '../src/lib/popup-model.js';

test('sendable channel page', () => {
  const m = popupModel({
    rawUrl: 'https://www.youtube.com/@someartist/videos',
    title: 'Some Artist - YouTube',
    now: 5000,
  });
  assert.deepEqual(m, {
    sendable: true,
    title: 'Some Artist - YouTube',
    detected: 'YouTube channel',
    buttonLabel: 'Add channel to Watch List',
    sentLine: null,
    payload: {
      kind: 'channel',
      url: 'https://www.youtube.com/@someartist',
      platform: 'youtube',
    },
  });
});

test('sendable track with an existing sent record', () => {
  const m = popupModel({
    rawUrl: 'https://soundcloud.com/ab/cd',
    title: 'cd by ab',
    sent: { kind: 'track', platform: 'soundcloud', sentAt: 0 },
    now: 2 * 24 * 60 * 60 * 1000,
  });
  assert.equal(m.buttonLabel, 'Download this track');
  assert.equal(m.sentLine, 'Sent ✓ · 2 days ago');
  assert.equal(m.payload.url, 'https://soundcloud.com/ab/cd');
});

test('malformed sent record still renders a plain "Sent ✓", never NaN', () => {
  for (const sent of [{}, { sentAt: 'x' }, 'sent', { sentAt: null }]) {
    const m = popupModel({
      rawUrl: 'https://soundcloud.com/ab/cd',
      title: 'cd by ab',
      sent,
      now: 2 * 24 * 60 * 60 * 1000,
    });
    assert.equal(m.sentLine, 'Sent ✓');
  }
});

test('unsupported page', () => {
  const m = popupModel({ rawUrl: 'https://example.com/x', title: 'X' });
  assert.equal(m.sendable, false);
  assert.equal(m.detected, 'Not a supported YouTube or SoundCloud page');
  assert.equal(m.buttonLabel, null);
  assert.equal(m.payload, null);
});

test('missing title and url degrade gracefully', () => {
  const m = popupModel({ rawUrl: undefined, title: undefined });
  assert.equal(m.sendable, false);
  assert.equal(m.title, '');
});
