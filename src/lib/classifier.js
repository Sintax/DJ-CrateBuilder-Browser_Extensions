/**
 * URL classifier — decides what a YouTube or SoundCloud URL *is*.
 *
 * Pure: no browser APIs, no imports, no I/O. Total: every input, including
 * garbage and non-strings, returns a result object. It never throws.
 *
 * Contract: docs/SPEC.md §4, canonical forms in docs/specs/djcrate-uri-v1.md §3.
 */

const YT_ORIGIN = 'https://www.youtube.com';
const SC_ORIGIN = 'https://soundcloud.com';

const YT_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YT_SHORT_HOSTS = new Set(['youtu.be']);
const SC_HOSTS = new Set(['soundcloud.com', 'm.soundcloud.com']);

// YouTube's ID formats are fixed and well documented, so validating them is
// cheap protection against classifying junk as a track.
const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YT_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
const YT_LEGACY_NAME = /^[A-Za-z0-9._-]{1,100}$/;

// SoundCloud permalinks have no published grammar, so this stays lenient — a
// false positive only costs the app a "not supported" message, while a false
// negative silently greys out the button on a page that should have worked.
const SC_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;

// First path segments on soundcloud.com that are site features, not artists.
const SC_RESERVED_ROOTS = new Set([
  'discover', 'search', 'stream', 'upload', 'you', 'settings', 'notifications',
  'messages', 'charts', 'feed', 'library', 'tags', 'people', 'groups', 'pages',
  'jobs', 'imprint', 'popular', 'terms', 'privacy', 'legal', 'mobile', 'pro',
  'premium', 'creators', 'help', 'login', 'signin', 'logout', 'dashboard',
  'embed', 'oembed', 'stations', 'station',
]);

// Artist sub-pages. These strip back to the artist, the same way YouTube's
// /videos tab strips back to the channel. See docs/SPEC.md §4.3.
const SC_ARTIST_TABS = new Set([
  'tracks', 'albums', 'playlists', 'reposts', 'likes', 'comments',
  'following', 'followers', 'popular-tracks', 'spotlight', 'toptracks',
  'insights', 'stats',
]);

function result(kind, platform, canonicalUrl) {
  return Object.freeze({ kind, platform, canonicalUrl });
}

function unsupported(platform = null) {
  return result('unsupported', platform, null);
}

function watchUrl(videoId) {
  return `${YT_ORIGIN}/watch?v=${videoId}`;
}

function parseUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url;
}

function segmentsOf(url) {
  return url.pathname.split('/').filter(Boolean);
}

function classifyYouTube(url, segments) {
  if (segments.length === 0) return unsupported('youtube');
  const [first, second] = segments;

  // Channel forms are tested first so that /@handle/shorts reads as a channel
  // tab rather than colliding with the root-level /shorts/<id> track form.
  // Anything after the channel segment is a tab suffix and is dropped.
  if (first.startsWith('@')) {
    return YT_HANDLE.test(first)
      ? result('channel', 'youtube', `${YT_ORIGIN}/${first}`)
      : unsupported('youtube');
  }
  if (first === 'channel') {
    return second && YT_CHANNEL_ID.test(second)
      ? result('channel', 'youtube', `${YT_ORIGIN}/channel/${second}`)
      : unsupported('youtube');
  }
  if (first === 'c' || first === 'user') {
    return second && YT_LEGACY_NAME.test(second)
      ? result('channel', 'youtube', `${YT_ORIGIN}/${first}/${second}`)
      : unsupported('youtube');
  }

  if (first === 'watch') {
    const videoId = url.searchParams.get('v');
    return videoId && YT_VIDEO_ID.test(videoId)
      ? result('track', 'youtube', watchUrl(videoId))
      : unsupported('youtube');
  }
  if (first === 'shorts' || first === 'live') {
    return second && YT_VIDEO_ID.test(second)
      ? result('track', 'youtube', watchUrl(second))
      : unsupported('youtube');
  }

  return unsupported('youtube');
}

function classifyYoutuBe(segments) {
  const videoId = segments[0];
  return videoId && YT_VIDEO_ID.test(videoId)
    ? result('track', 'youtube', watchUrl(videoId))
    : unsupported('youtube');
}

function classifySoundCloud(segments) {
  if (segments.length === 0) return unsupported('soundcloud');
  const [artist, second] = segments;

  if (SC_RESERVED_ROOTS.has(artist.toLowerCase())) return unsupported('soundcloud');
  if (!SC_SLUG.test(artist)) return unsupported('soundcloud');

  const artistUrl = `${SC_ORIGIN}/${artist}`;
  if (segments.length === 1) return result('channel', 'soundcloud', artistUrl);

  // Playlists are out of scope for Phase 1 — both the artist's sets listing
  // and an individual set. See docs/SPEC.md §8.
  if (second.toLowerCase() === 'sets') return unsupported('soundcloud');

  if (SC_ARTIST_TABS.has(second.toLowerCase())) {
    return result('channel', 'soundcloud', artistUrl);
  }

  return segments.length === 2 && SC_SLUG.test(second)
    ? result('track', 'soundcloud', `${artistUrl}/${second}`)
    : unsupported('soundcloud');
}

/**
 * Classify a URL.
 *
 * @param {string} rawUrl
 * @returns {{kind: 'channel'|'track'|'unsupported',
 *            platform: 'youtube'|'soundcloud'|null,
 *            canonicalUrl: string|null}}
 */
export function classify(rawUrl) {
  const url = parseUrl(rawUrl);
  if (!url) return unsupported();

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = segmentsOf(url);

  if (YT_HOSTS.has(host)) return classifyYouTube(url, segments);
  if (YT_SHORT_HOSTS.has(host)) return classifyYoutuBe(segments);
  if (SC_HOSTS.has(host)) return classifySoundCloud(segments);
  return unsupported();
}

/**
 * Human label for a classification — "YouTube channel", "SoundCloud track".
 * Lives here so the popup, context menu, and in-page button can't drift apart.
 *
 * @returns {string|null} null when the result is unsupported.
 */
export function describe({ kind, platform }) {
  if (kind !== 'channel' && kind !== 'track') return null;
  const site = platform === 'youtube' ? 'YouTube' : 'SoundCloud';
  return `${site} ${kind}`;
}

/** Whether a classification can be sent. */
export function isSendable({ kind }) {
  return kind === 'channel' || kind === 'track';
}
