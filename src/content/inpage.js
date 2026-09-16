/**
 * In-page "+ CrateBuilder" button (SPEC §5.3), youtube.com + soundcloud.com
 * only. Anchor selectors WILL rot when the sites redesign — the documented
 * fallback is a fixed corner dock, never a silently missing button.
 * Both sites are SPAs: yt-navigate-finish covers YouTube, a 1s URL poll
 * covers SoundCloud (and doubles as a safety net on YouTube).
 */
(() => {
  // Resolved lazily so Firefox's browser.* is preferred when present,
  // falling back to chrome.* (Chrome, and Firefox's polyfill).
  const api = () => globalThis.browser ?? globalThis.chrome;

  const BTN_ID = 'djcb-inpage-btn';

  // Ordered candidate anchors per site+kind; first match wins.
  const ANCHORS = {
    youtube: {
      channel: ['#subscribe-button', 'ytd-subscribe-button-renderer'],
      track: ['#top-level-buttons-computed', '#actions-inner', '#actions'],
    },
    soundcloud: {
      channel: ['.profileHeaderInfo__content', '.sc-button-follow'],
      track: ['.soundActions', '.sound__soundActions'],
    },
  };

  function findAnchor(platform, kind) {
    for (const sel of ANCHORS[platform]?.[kind] ?? []) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function makeButton(sentKnown) {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = sentKnown ? 'Sent ✓' : '+ CrateBuilder';
    btn.style.cssText = [
      'all: initial', 'cursor: pointer', 'margin: 0 8px',
      'padding: 6px 12px', 'border-radius: 16px',
      'font: 600 12px/1 system-ui, sans-serif',
      sentKnown ? 'background: #2e7d32' : 'background: #e6772e',
      'color: #fff', 'display: inline-block', 'vertical-align: middle',
    ].join(';');
    return btn;
  }

  function dockToCorner(btn) {
    // Fallback per SPEC §5.3: anchor selector broke — dock, don't vanish.
    btn.style.position = 'fixed';
    btn.style.right = '16px';
    btn.style.bottom = '16px';
    btn.style.zIndex = '2147483647';
    document.body.append(btn);
  }

  // Remove every copy, not just the first: two evaluate() calls can overlap
  // across a navigation and each leave a button behind.
  function removeButtons() {
    document.querySelectorAll('#' + BTN_ID).forEach((el) => el.remove());
  }

  // True once this script is orphaned — an extension reload/update leaves the
  // old copy running with a dead runtime, and every call then throws.
  function isOrphaned(err) {
    if (!api()?.runtime?.id) return true;
    return String(err?.message ?? err).toLowerCase().includes('context invalidated');
  }

  function teardown() {
    if (pollId !== null) { clearInterval(pollId); pollId = null; }
    document.removeEventListener('yt-navigate-finish', onMaybeNavigated);
    removeButtons();
  }

  async function evaluate() {
    const forHref = location.href;
    try {
      removeButtons();
      const state = await api().runtime.sendMessage(
        { type: 'djcb:page-state', url: forHref });
      // The page moved on while we were waiting — a later evaluate() owns it.
      if (location.href !== forHref) return;
      const c = state?.classification;
      if (!c || (c.kind !== 'channel' && c.kind !== 'track')) return;

      const btn = makeButton(state.sent !== null);
      btn.addEventListener('click', async () => {
        try {
          // Send the URL this button was built for, not whatever the SPA has
          // navigated to since.
          const out = await api().runtime.sendMessage(
            { type: 'djcb:send', url: forHref });
          if (out?.dispatched) {
            btn.textContent = 'Sent ✓';
            btn.style.background = '#2e7d32';
          }
        } catch {
          // Background unreachable — leave the button as-is, no unhandled
          // rejection in the page console.
        }
      });

      removeButtons();   // a concurrent evaluate() may have inserted one
      const anchor = findAnchor(c.platform, c.kind);
      if (anchor) anchor.insertAdjacentElement('afterend', btn);
      else dockToCorner(btn);
    } catch (err) {
      // Orphaned: stop for good rather than throwing on every poll tick into
      // the user's page console. Anything else is swallowed and the button
      // stays away until the next navigation — the poll only re-enters
      // evaluate() when location.href changes, so it does not retry in place.
      if (isOrphaned(err)) teardown();
    }
  }

  let lastHref = null;
  function onMaybeNavigated() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    // Give the SPA a beat to paint the header the anchor lives in.
    setTimeout(evaluate, 800);
  }

  document.addEventListener('yt-navigate-finish', onMaybeNavigated);
  let pollId = setInterval(onMaybeNavigated, 1000);
  onMaybeNavigated();
})();
