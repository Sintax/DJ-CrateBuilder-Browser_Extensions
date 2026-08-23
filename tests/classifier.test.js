import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, describe as label, isSendable } from '../src/lib/classifier.js';

const VIDEO = 'dQw4w9WgXcQ';
const CHANNEL_ID = 'UCuAXFkgsw1L7xaCfnd5JJOw';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;

/** Table-driven: [input, expected kind, expected platform, expected canonicalUrl]. */
function table(name, rows) {
  test(name, () => {
    for (const [input, kind, platform, canonicalUrl] of rows) {
      assert.deepEqual(
        classify(input),
        { kind, platform, canonicalUrl },
        `classify(${JSON.stringify(input)})`,
      );
    }
  });
}

// ── YouTube channels ────────────────────────────────────────────────────────

table('youtube: channel forms', [
  ['https://www.youtube.com/@someartist', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
  [`https://www.youtube.com/channel/${CHANNEL_ID}`, 'channel', 'youtube', `https://www.youtube.com/channel/${CHANNEL_ID}`],
  ['https://www.youtube.com/c/SomeName', 'channel', 'youtube', 'https://www.youtube.com/c/SomeName'],
  ['https://www.youtube.com/user/SomeName', 'channel', 'youtube', 'https://www.youtube.com/user/SomeName'],
]);

table('youtube: channel tab suffixes are stripped', [
  ['https://www.youtube.com/@someartist/videos', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
  ['https://www.youtube.com/@someartist/streams', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
  ['https://www.youtube.com/@someartist/playlists', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
  ['https://www.youtube.com/@someartist/about', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
  [`https://www.youtube.com/channel/${CHANNEL_ID}/videos`, 'channel', 'youtube', `https://www.youtube.com/channel/${CHANNEL_ID}`],
]);

test('youtube: /@handle/shorts is a channel tab, not a track', () => {
  // The ordering trap: /shorts/<id> at the root is a track, but /shorts as a
  // second segment is the channel's shorts tab.
  assert.deepEqual(classify('https://www.youtube.com/@someartist/shorts'), {
    kind: 'channel',
    platform: 'youtube',
    canonicalUrl: 'https://www.youtube.com/@someartist',
  });
});

table('youtube: malformed channel identifiers are unsupported', [
  ['https://www.youtube.com/@ab', 'unsupported', 'youtube', null],          // handle too short
  ['https://www.youtube.com/channel/NotAChannelId', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/channel', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/c', 'unsupported', 'youtube', null],
]);

// ── YouTube tracks ──────────────────────────────────────────────────────────

table('youtube: track forms canonicalise to watch?v=', [
  [WATCH, 'track', 'youtube', WATCH],
  [`https://www.youtube.com/shorts/${VIDEO}`, 'track', 'youtube', WATCH],
  [`https://www.youtube.com/live/${VIDEO}`, 'track', 'youtube', WATCH],
  [`https://youtu.be/${VIDEO}`, 'track', 'youtube', WATCH],
]);

table('youtube: tracking and playlist parameters are dropped', [
  [`https://www.youtube.com/watch?v=${VIDEO}&list=PLabc&index=3`, 'track', 'youtube', WATCH],
  [`https://youtu.be/${VIDEO}?si=abcdef&t=42`, 'track', 'youtube', WATCH],
  [`https://www.youtube.com/watch?v=${VIDEO}#t=30`, 'track', 'youtube', WATCH],
]);

table('youtube: host variants normalise to www.youtube.com', [
  [`https://youtube.com/watch?v=${VIDEO}`, 'track', 'youtube', WATCH],
  [`https://m.youtube.com/watch?v=${VIDEO}`, 'track', 'youtube', WATCH],
  [`https://music.youtube.com/watch?v=${VIDEO}`, 'track', 'youtube', WATCH],
  [`http://www.youtube.com/watch?v=${VIDEO}`, 'track', 'youtube', WATCH],
  [`https://WWW.YouTube.COM/watch?v=${VIDEO}`, 'track', 'youtube', WATCH],
  ['https://m.youtube.com/@someartist', 'channel', 'youtube', 'https://www.youtube.com/@someartist'],
]);

test('youtube: video ID case is preserved', () => {
  // Video IDs are case-sensitive — lowercasing the path would break the URL.
  const mixed = 'aB_cD-eF0g1';
  assert.equal(
    classify(`https://www.youtube.com/watch?v=${mixed}`).canonicalUrl,
    `https://www.youtube.com/watch?v=${mixed}`,
  );
});

table('youtube: non-channel non-track pages are unsupported', [
  ['https://www.youtube.com/', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/playlist?list=PLabc', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/results?search_query=dnb', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/feed/subscriptions', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/watch', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/watch?v=tooshort', 'unsupported', 'youtube', null],
  ['https://www.youtube.com/shorts', 'unsupported', 'youtube', null],
  ['https://youtu.be/', 'unsupported', 'youtube', null],
]);

// ── SoundCloud ──────────────────────────────────────────────────────────────

table('soundcloud: channel and track forms', [
  ['https://soundcloud.com/someartist', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/some-track', 'track', 'soundcloud', 'https://soundcloud.com/someartist/some-track'],
  ['https://www.soundcloud.com/someartist', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://m.soundcloud.com/someartist/some-track', 'track', 'soundcloud', 'https://soundcloud.com/someartist/some-track'],
  ['https://soundcloud.com/someartist/', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/some-track?in=other%2Fsets%2Fmix', 'track', 'soundcloud', 'https://soundcloud.com/someartist/some-track'],
]);

table('soundcloud: artist sub-pages strip to the channel', [
  ['https://soundcloud.com/someartist/tracks', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/likes', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/reposts', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/albums', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
  ['https://soundcloud.com/someartist/following', 'channel', 'soundcloud', 'https://soundcloud.com/someartist'],
]);

table('soundcloud: playlists are out of scope', [
  ['https://soundcloud.com/someartist/sets', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/someartist/sets/some-playlist', 'unsupported', 'soundcloud', null],
]);

table('soundcloud: reserved roots are not artists', [
  ['https://soundcloud.com/discover', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/search?q=dnb', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/stream', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/you/likes', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/charts/top', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/DISCOVER', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/', 'unsupported', 'soundcloud', null],
]);

table('soundcloud: deeper paths are unsupported', [
  ['https://soundcloud.com/someartist/some-track/comments', 'unsupported', 'soundcloud', null],
  ['https://soundcloud.com/a/b/c/d', 'unsupported', 'soundcloud', null],
]);

// ── Total function guarantees ───────────────────────────────────────────────

table('rejects anything that is not an http(s) URL on a supported host', [
  ['https://example.com/@someartist', 'unsupported', null, null],
  ['https://notyoutube.com/watch?v=' + VIDEO, 'unsupported', null, null],
  ['https://soundcloud.com.evil.example/someartist', 'unsupported', null, null],
  ['javascript:alert(1)', 'unsupported', null, null],
  ['djcrate://add?v=1', 'unsupported', null, null],
  ['file:///C:/music', 'unsupported', null, null],
  ['youtube.com/@someartist', 'unsupported', null, null],   // no scheme
  ['not a url at all', 'unsupported', null, null],
  ['', 'unsupported', null, null],
  ['   ', 'unsupported', null, null],
]);

test('never throws, whatever it is handed', () => {
  const junk = [null, undefined, 42, {}, [], NaN, true, Symbol('x'), () => {}];
  for (const value of junk) {
    assert.deepEqual(
      classify(value),
      { kind: 'unsupported', platform: null, canonicalUrl: null },
      `classify(${String(value)})`,
    );
  }
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(classify(`  ${WATCH}\n`).canonicalUrl, WATCH);
});

test('results are frozen so callers cannot mutate shared state', () => {
  const r = classify(WATCH);
  assert.ok(Object.isFrozen(r));
});

// ── Label helpers ───────────────────────────────────────────────────────────

test('describe() produces the UI label', () => {
  assert.equal(label(classify('https://www.youtube.com/@someartist')), 'YouTube channel');
  assert.equal(label(classify(WATCH)), 'YouTube track');
  assert.equal(label(classify('https://soundcloud.com/someartist')), 'SoundCloud channel');
  assert.equal(label(classify('https://soundcloud.com/someartist/some-track')), 'SoundCloud track');
  assert.equal(label(classify('https://example.com')), null);
});

test('isSendable() gates the surfaces', () => {
  assert.equal(isSendable(classify(WATCH)), true);
  assert.equal(isSendable(classify('https://soundcloud.com/someartist')), true);
  assert.equal(isSendable(classify('https://soundcloud.com/someartist/sets/x')), false);
  assert.equal(isSendable(classify('https://example.com')), false);
});
