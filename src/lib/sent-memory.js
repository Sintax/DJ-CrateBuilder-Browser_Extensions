/**
 * Sent-memory — remembers what has been sent, keyed by canonical URL.
 *
 * Backed by chrome.storage.local. Because Phase 1 is one-way, entries mean
 * "Sent ✓", never "Added" — the extension knows it dispatched the URI, not
 * that the app acted on it. Phase 2 native-messaging replies overwrite these
 * records with real app state, which is why the key is the canonical URL
 * rather than a send-event id.
 *
 * Contract: docs/SPEC.md §6.
 */

/**
 * @typedef {{kind: 'channel'|'track',
 *            platform: 'youtube'|'soundcloud',
 *            sentAt: number}} SentRecord   — sentAt is epoch ms.
 */

const PREFIX = 'sent:';

/** @returns {Promise<SentRecord|null>} */
export async function getSent(canonicalUrl) {
  const key = PREFIX + canonicalUrl;
  const got = await chrome.storage.local.get(key);
  return got[key] ?? null;
}

/** @returns {Promise<void>} */
export async function recordSent(canonicalUrl, { kind, platform }, now = Date.now()) {
  await chrome.storage.local.set({
    [PREFIX + canonicalUrl]: { kind, platform, sentAt: now },
  });
}

/** Last ~50 sends, newest first. @returns {Promise<Array<SentRecord & {url: string}>>} */
export async function history(limit = 50) {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, rec]) => ({ url: k.slice(PREFIX.length), ...rec }))
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, limit);
}

/** @returns {Promise<void>} */
export async function clearAll() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
}
