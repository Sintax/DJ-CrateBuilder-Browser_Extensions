/**
 * Transport — the ONE seam between UI surfaces and the delivery mechanism.
 *
 * Phase 1 builds a djcrate:// URI and navigates to it; Phase 2 swaps in a
 * native-messaging implementation behind this same interface. UI code never
 * learns which transport ran and must never build a djcrate:// string itself.
 *
 * Contract: docs/SPEC.md §3.1; URI format: docs/specs/djcrate-uri-v1.md §1.
 */

// Resolved lazily (not at module load) so tests can install a fake chrome
// after this module is imported — ESM imports hoist above test setup — and
// so Firefox's browser.* (promise-native) is preferred when present.
const api = () => globalThis.browser ?? globalThis.chrome;

/**
 * Build the v1 URI for a send. Exported separately so it can be unit-tested
 * without a browser.
 *
 * @param {{kind: 'channel'|'track', url: string}} payload — url is the
 *   canonical URL from the classifier, NOT the raw page URL.
 * @returns {string} e.g. "djcrate://add?v=1&kind=channel&url=https%3A%2F%2F…"
 */
export function buildUri({ kind, url } = {}) {
  if (kind !== 'channel' && kind !== 'track') {
    throw new TypeError(`bad kind: ${kind}`);
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new TypeError(`bad url: ${url}`);
  }
  return `djcrate://add?v=1&kind=${kind}&url=${encodeURIComponent(url)}`;
}

/**
 * Dispatch a send. Resolves once the URI has been handed to the browser.
 * `dispatched` means exactly that — Phase 1 cannot know whether the app
 * received it (docs/SPEC.md §7).
 *
 * @param {{kind: 'channel'|'track', url: string}} payload
 * @param {{tabId?: number}} [options] — target tab; omit to use the active tab.
 * @returns {Promise<{dispatched: boolean}>}
 */
export async function send(payload, { tabId } = {}) {
  // Navigation to an external-protocol URI leaves the page untouched, so no
  // tab state needs saving or restoring.
  const uri = buildUri(payload);
  if (tabId !== undefined) {
    await api().tabs.update(tabId, { url: uri });
  } else {
    await api().tabs.update({ url: uri });
  }
  return { dispatched: true };
}
