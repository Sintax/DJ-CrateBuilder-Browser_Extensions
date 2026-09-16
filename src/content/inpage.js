/**
 * In-page "+ CrateBuilder" button (SPEC §5.3), youtube.com + soundcloud.com
 * only. Anchor selectors WILL rot when the sites redesign — the documented
 * fallback is a fixed corner dock, never a silently missing button.
 * Both sites are SPAs: yt-navigate-finish covers YouTube, a 1s URL poll
 * covers SoundCloud (and doubles as a safety net on YouTube).
 */
(() => {
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

  async function evaluate() {
    document.getElementById(BTN_ID)?.remove();
    const state = await chrome.runtime.sendMessage(
      { type: 'djcb:page-state', url: location.href });
    const c = state?.classification;
    if (!c || (c.kind !== 'channel' && c.kind !== 'track')) return;

    const btn = makeButton(state.sent !== null);
    btn.addEventListener('click', async () => {
      const out = await chrome.runtime.sendMessage(
        { type: 'djcb:send', url: location.href });
      if (out?.dispatched) {
        btn.textContent = 'Sent ✓';
        btn.style.background = '#2e7d32';
      }
    });

    const anchor = findAnchor(c.platform, c.kind);
    if (anchor) anchor.insertAdjacentElement('afterend', btn);
    else dockToCorner(btn);
  }

  let lastHref = null;
  function onMaybeNavigated() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    // Give the SPA a beat to paint the header the anchor lives in.
    setTimeout(evaluate, 800);
  }

  document.addEventListener('yt-navigate-finish', onMaybeNavigated);
  setInterval(onMaybeNavigated, 1000);
  onMaybeNavigated();
})();
