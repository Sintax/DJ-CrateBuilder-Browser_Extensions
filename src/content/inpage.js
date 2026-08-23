/**
 * In-page "+ CrateBuilder" button (SPEC §5.3). Runs only on youtube.com and
 * soundcloud.com (see content_scripts.matches in the manifests).
 *
 * Placement comes from a per-site adapter: near subscribe/follow on channel
 * pages, near like/share on track pages. REQUIREMENT, not a nicety: if a site
 * redesign breaks the anchor selector, the button docks to a fixed page
 * corner rather than vanishing silently — a silently-missing button reads as
 * "the extension is broken".
 *
 * Both sites are SPAs, so URL changes must be observed (yt-navigate-finish on
 * YouTube; history patching or polling on SoundCloud) and the button
 * re-evaluated on every navigation, not just on load.
 */

// TODO(build-order 7): adapters + mount/unmount lifecycle; sends go through
//   the background worker (content scripts can't import lib/transport.js
//   directly — message it instead).
