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

/** @returns {Promise<SentRecord|null>} */
export async function getSent(canonicalUrl) {
  // TODO(build-order 5)
  throw new Error('not implemented — see docs/SPEC.md §6');
}

/** @returns {Promise<void>} */
export async function recordSent(canonicalUrl, { kind, platform }) {
  // TODO(build-order 5)
  throw new Error('not implemented — see docs/SPEC.md §6');
}

/** Last ~50 sends, newest first. @returns {Promise<Array<SentRecord & {url: string}>>} */
export async function history() {
  // TODO(build-order 5)
  throw new Error('not implemented — see docs/SPEC.md §6');
}

/** @returns {Promise<void>} */
export async function clearAll() {
  // TODO(build-order 5)
  throw new Error('not implemented — see docs/SPEC.md §6');
}
