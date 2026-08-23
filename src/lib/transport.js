/**
 * Transport — the ONE seam between UI surfaces and the delivery mechanism.
 *
 * Phase 1 builds a djcrate:// URI and navigates to it; Phase 2 swaps in a
 * native-messaging implementation behind this same interface. UI code never
 * learns which transport ran and must never build a djcrate:// string itself.
 *
 * Contract: docs/SPEC.md §3.1; URI format: docs/specs/djcrate-uri-v1.md §1.
 */

/**
 * Build the v1 URI for a send. Exported separately so it can be unit-tested
 * without a browser.
 *
 * @param {{kind: 'channel'|'track', url: string}} payload — url is the
 *   canonical URL from the classifier, NOT the raw page URL.
 * @returns {string} e.g. "djcrate://add?v=1&kind=channel&url=https%3A%2F%2F…"
 */
export function buildUri({ kind, url }) {
  // TODO(build-order 2): validate kind ∈ {channel, track} and url is https,
  // then return `djcrate://add?v=1&kind=${kind}&url=${encodeURIComponent(url)}`.
  throw new Error('not implemented — see docs/SPEC.md §3.1');
}

/**
 * Dispatch a send. Resolves once the URI has been handed to the browser.
 * `dispatched` means exactly that — Phase 1 cannot know whether the app
 * received it (docs/SPEC.md §7).
 *
 * @param {{kind: 'channel'|'track', url: string}} payload
 * @returns {Promise<{dispatched: boolean}>}
 */
export async function send(payload) {
  // TODO(build-order 2): navigate the active tab to buildUri(payload).
  // Navigation to an external-protocol URI leaves the page untouched, so no
  // tab state needs saving or restoring.
  throw new Error('not implemented — see docs/SPEC.md §3.1');
}
