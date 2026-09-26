/**
 * The context-menu table and the pure decisions around it, kept out of
 * background.js so they can be tested without a browser.
 *
 * Creation order is menu order: the two choices first, the plain send last.
 * Chrome and Firefox fold an extension's items into a submenu named after it
 * once more than one is visible, so there is no parent item.
 */
import { ACTION_TITLES } from './ui-text.js';

export const SITE_PATTERNS = [
  'https://www.youtube.com/*', 'https://youtube.com/*',
  'https://m.youtube.com/*', 'https://music.youtube.com/*',
  'https://youtu.be/*',
  'https://soundcloud.com/*', 'https://www.soundcloud.com/*',
  'https://m.soundcloud.com/*',
];

// A link's kind can't be classified before the menu opens, so the choices
// are shown on links SHAPED like a track. SoundCloud's two-segment pattern
// also catches /artist/sets/… and /artist/likes; a click on one of those is
// classified at click time and falls back to a plain send (sendPayload).
export const TRACK_LINK_PATTERNS = [
  'https://www.youtube.com/watch*', 'https://youtube.com/watch*',
  'https://m.youtube.com/watch*', 'https://music.youtube.com/watch*',
  'https://www.youtube.com/shorts/*', 'https://youtube.com/shorts/*',
  'https://m.youtube.com/shorts/*',
  'https://www.youtube.com/live/*', 'https://youtube.com/live/*',
  'https://youtu.be/*',
  'https://soundcloud.com/*/*', 'https://www.soundcloud.com/*/*',
  'https://m.soundcloud.com/*/*',
];

const page = (id, title, extra = {}) => ({
  id, contexts: ['page'], title, patterns: SITE_PATTERNS,
  patternKey: 'documentUrlPatterns', ...extra,
});
const link = (id, title, patterns, extra = {}) => ({
  id, contexts: ['link'], title, patterns,
  patternKey: 'targetUrlPatterns', ...extra,
});

export const MENU_ITEMS = [
  page('djcb-page-batch', ACTION_TITLES.batch, { then: 'batch', pageTrackOnly: true }),
  page('djcb-page-download', ACTION_TITLES.download, { then: 'download', pageTrackOnly: true }),
  page('djcb-page', 'Send to DJ-CrateBuilder'),
  link('djcb-link-batch', ACTION_TITLES.batch, TRACK_LINK_PATTERNS, { then: 'batch' }),
  link('djcb-link-download', ACTION_TITLES.download, TRACK_LINK_PATTERNS, { then: 'download' }),
  link('djcb-link', 'Send link to DJ-CrateBuilder', SITE_PATTERNS),
];

const BY_ID = new Map(MENU_ITEMS.map((m) => [m.id, m]));

export function menuAction(menuItemId) {
  const item = BY_ID.get(menuItemId);
  return {
    source: item?.contexts[0] === 'link' ? 'link' : 'page',
    then: item?.then,
  };
}

/** What goes to transport.send: the choice only rides along on a track. */
export function sendPayload(c, then) {
  const payload = { kind: c.kind, url: c.canonicalUrl };
  if (c.kind === 'track' && then) payload.then = then;
  return payload;
}
