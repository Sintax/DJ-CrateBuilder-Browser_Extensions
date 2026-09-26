import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MENU_ITEMS, SITE_PATTERNS, TRACK_LINK_PATTERNS, menuAction, sendPayload,
} from '../src/lib/menu-model.js';

test('the choices come first, the plain send last, for page and link alike', () => {
  assert.deepEqual(MENU_ITEMS.map((m) => m.id), [
    'djcb-page-batch', 'djcb-page-download', 'djcb-page',
    'djcb-link-batch', 'djcb-link-download', 'djcb-link',
  ]);
  const titles = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m.title]));
  assert.equal(titles['djcb-page-batch'], 'Add to batch');
  assert.equal(titles['djcb-link-download'], 'Download now');
  assert.equal(titles['djcb-link'], 'Send link to DJ-CrateBuilder');
});

test('page choices start hidden; the tab refresh shows them on a track', () => {
  const byId = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m]));
  assert.equal(byId['djcb-page-batch'].pageTrackOnly, true);
  assert.equal(byId['djcb-page-download'].pageTrackOnly, true);
  assert.equal(byId['djcb-page'].pageTrackOnly, undefined);
});

test('link choices are limited to track-shaped links; the plain link send is not', () => {
  const byId = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m]));
  assert.equal(byId['djcb-link-batch'].patterns, TRACK_LINK_PATTERNS);
  assert.equal(byId['djcb-link'].patterns, SITE_PATTERNS);
  assert.equal(byId['djcb-link'].patternKey, 'targetUrlPatterns');
  assert.equal(byId['djcb-page'].patternKey, 'documentUrlPatterns');
  for (const p of ['https://www.youtube.com/watch*', 'https://youtu.be/*',
    'https://www.youtube.com/shorts/*', 'https://soundcloud.com/*/*']) {
    assert.ok(TRACK_LINK_PATTERNS.includes(p), p);
  }
});

test('a menu id says where the URL comes from and what to do with it', () => {
  assert.deepEqual(menuAction('djcb-page'), { source: 'page', then: undefined });
  assert.deepEqual(menuAction('djcb-page-batch'), { source: 'page', then: 'batch' });
  assert.deepEqual(menuAction('djcb-link-download'), { source: 'link', then: 'download' });
  assert.deepEqual(menuAction('djcb-link'), { source: 'link', then: undefined });
});

test('the choice rides along only on a track; a channel gets a plain send', () => {
  const track = { kind: 'track', canonicalUrl: 'https://soundcloud.com/a/b' };
  const channel = { kind: 'channel', canonicalUrl: 'https://soundcloud.com/a' };
  assert.deepEqual(sendPayload(track, 'download'),
    { kind: 'track', url: 'https://soundcloud.com/a/b', then: 'download' });
  assert.deepEqual(sendPayload(track, undefined),
    { kind: 'track', url: 'https://soundcloud.com/a/b' });
  assert.deepEqual(sendPayload(channel, 'batch'),
    { kind: 'channel', url: 'https://soundcloud.com/a' });
});
