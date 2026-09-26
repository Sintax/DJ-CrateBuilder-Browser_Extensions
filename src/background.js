/**
 * Background service worker (Chrome) / event page (Firefox).
 *
 * The ONLY caller of transport.send in the whole extension: popup and
 * content script both route sends through the djcb:send message so
 * sent-memory recording can't be forgotten and Phase 2 swaps one file.
 */
import { classify, isSendable } from './lib/classifier.js';
import { menuTitleFor } from './lib/ui-text.js';
import { send } from './lib/transport.js';
import { MENU_ITEMS, menuAction, sendPayload } from './lib/menu-model.js';
import { recordSent, getSent } from './lib/sent-memory.js';

// Resolved lazily (not at module load) so Firefox's browser.* is preferred
// when present, falling back to chrome.* (Chrome, and Firefox's polyfill).
const api = () => globalThis.browser ?? globalThis.chrome;

// ── Toolbar icon: colored on a sendable page, gray otherwise (SPEC §5.1) ──
// Drawn at runtime on an OffscreenCanvas — no PNG assets to maintain.
function drawIcon(size, active) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const u = size / 16;
  ctx.fillStyle = active ? '#e6772e' : '#9a9a9a';   // crate orange / gray
  ctx.fillRect(1 * u, 3 * u, 14 * u, 12 * u);       // crate body
  ctx.fillStyle = active ? '#7a3a10' : '#5f5f5f';
  ctx.fillRect(1 * u, 6 * u, 14 * u, 1 * u);        // slats
  ctx.fillRect(1 * u, 10 * u, 14 * u, 1 * u);
  return ctx.getImageData(0, 0, size, size);
}

// A red ✗ that flashBadge is showing right now must not be wiped by a refresh
// that happens to land in the same 2s window. The hold lives only in this
// worker, so a worker death drops it — which is exactly what makes the badge
// clear below self-healing for a ✗ stranded by that death.
const FLASH_MS = 2000;
const badgeHold = new Map();   // tabId → epoch ms this flash stops mattering

function badgeHeld(tabId) {
  const until = badgeHold.get(tabId);
  if (until === undefined) return false;
  if (Date.now() >= until) { badgeHold.delete(tabId); return false; }
  return true;
}

async function refreshTabUi(tabId, url) {
  // Self-healing: flashBadge's 2s timeout dies with the service worker, so a
  // red ✗ can get stranded. Any navigation or tab switch wipes it.
  if (!badgeHeld(tabId)) {
    try {
      await api().action.setBadgeText({ tabId, text: '' });
    } catch { /* tab may be gone */ }
  }
  const c = classify(url ?? '');
  const active = isSendable(c);
  try {
    await api().action.setIcon({
      tabId,
      imageData: { 16: drawIcon(16, active), 32: drawIcon(32, active) },
    });
  } catch { /* tab may be gone */ }
  const title = menuTitleFor(c);
  try {
    await api().contextMenus.update('djcb-page', {
      visible: title !== null,
      title: title ?? 'Send to DJ-CrateBuilder',
    });
  } catch { /* menu not created yet */ }
  // The two choices only make sense on a single track; on a channel page the
  // plain send is the whole menu.
  for (const item of MENU_ITEMS.filter((m) => m.pageTrackOnly)) {
    try {
      await api().contextMenus.update(item.id, { visible: c.kind === 'track' });
    } catch { /* menu not created yet */ }
  }
}

api().tabs.onUpdated.addListener((tabId, info, tab) => {
  // contextMenus.update is global, not per-tab — only the foreground tab
  // may retitle it, or a background tab finishing load would steal it.
  if (!tab.active) return;
  if (info.url || info.status === 'complete') refreshTabUi(tabId, tab.url);
});
api().tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await api().tabs.get(tabId);
    refreshTabUi(tabId, tab.url);
  } catch { /* tab may be gone */ }
});

// ── Context menus (SPEC §5.2) ─────────────────────────────────────────────
// Page entry: retitled per active tab (Chrome has no onShown to retitle at
// open time — Firefox does, but this codepath works on both). Link entry:
// static title; host patterns keep it to the two sites, and a click on an
// unsupported link (e.g. a playlist) flashes the badge instead of silently
// doing nothing. A track also gets Add to batch / Download now (design
// 2026-09-25): shown on the page when refreshTabUi finds a track, and on
// links shaped like one (TRACK_LINK_PATTERNS in lib/menu-model.js).
//
// removeAll() first so a rebuild can never hit a duplicate id; the calls are
// serialised through one chain so the onInstalled and onStartup calls below
// can't interleave. Deliberately NOT run at module load: the MV3 worker
// re-evaluates the module body on every wake, and a rebuild there would leave
// a window after each wake in which a right-click shows no CrateBuilder entry.
let menuWork = Promise.resolve();
function createMenus() {
  menuWork = menuWork.then(async () => {
    try {
      await api().contextMenus.removeAll();
    } catch { /* nothing to remove */ }
    try {
      for (const m of MENU_ITEMS) {
        api().contextMenus.create({
          id: m.id, contexts: m.contexts, title: m.title,
          [m.patternKey]: m.patterns,
          ...(m.pageTrackOnly ? { visible: false } : {}),
        });
      }
    } catch { /* already present */ }
  });
  return menuWork;
}

// ── Startup sweep ─────────────────────────────────────────────────────────
// Without this a tab keeps the browser's default toolbar tile until it's next
// loaded or activated — the worker has simply never seen it. The default tile
// before the first sweep is accepted (SPEC: no icon assets to maintain, so
// there is no default_icon/icons entry in either manifest).
//
// Install/startup only, never at module load: the worker wakes constantly
// (every tab event above wakes it), and a sweep per wake costs two canvas
// renders plus three IPC calls per open tab and fights flashBadge for the
// badge. A tab the sweep misses self-heals on its next activation or load.
async function sweepTabs() {
  try {
    const tabs = await api().tabs.query({});
    // Active tabs last: refreshTabUi also retitles the single global page
    // menu, so whichever tab is refreshed last is the one it ends up naming.
    const ordered = [
      ...tabs.filter((t) => !t.active),
      ...tabs.filter((t) => t.active),
    ];
    for (const tab of ordered) await refreshTabUi(tab.id, tab.url);
  } catch { /* tabs unavailable */ }
}

// Menus first, then the sweep: refreshTabUi retitles the page entry and can
// only do that once it has been created.
function initUi() { createMenus().then(sweepTabs); }

api().runtime.onInstalled.addListener(initUi);
api().runtime.onStartup?.addListener?.(initUi);

api().contextMenus.onClicked.addListener((info, tab) => {
  const { source, then } = menuAction(info.menuItemId);
  const raw = source === 'link' ? info.linkUrl : (info.pageUrl ?? tab?.url);
  handleSend(raw, tab?.id, then).catch((err) => {
    console.warn('djcb: context-menu send failed', err);
  });
});

async function flashBadge(tabId) {
  // Hold set before the first await: this is the only feedback the
  // unsupported-link path has, so a refresh racing it must not clear it.
  badgeHold.set(tabId, Date.now() + FLASH_MS);
  try {
    await api().action.setBadgeBackgroundColor({ tabId, color: '#c0392b' });
    await api().action.setBadgeText({ tabId, text: '✗' });
    setTimeout(() => {
      badgeHold.delete(tabId);
      api().action.setBadgeText({ tabId, text: '' });
    }, FLASH_MS);
  } catch {
    badgeHold.delete(tabId);   // nothing showing — don't hold a dead tab
  }
}

// ── The one send path ─────────────────────────────────────────────────────
// Never throws: a rejected send() (e.g. tabs.update failing) must resolve
// {dispatched: false, error} rather than reject across the message boundary,
// or the popup/content-script caller is left hanging with no response.
async function handleSend(rawUrl, tabId, then) {
  const c = classify(rawUrl);
  if (!isSendable(c)) {
    if (tabId !== undefined) await flashBadge(tabId);
    return { dispatched: false };
  }
  try {
    await send(sendPayload(c, then), { tabId });
    await recordSent(c.canonicalUrl, { kind: c.kind, platform: c.platform });
    return { dispatched: true };
  } catch (err) {
    return { dispatched: false, error: String(err?.message ?? err) };
  }
}

api().runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'djcb:send') {
    handleSend(msg.url ?? sender?.tab?.url, msg.tabId ?? sender?.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ dispatched: false, error: String(err?.message ?? err) }));
    return true; // async response
  }
  if (msg?.type === 'djcb:page-state') {
    const c = classify(msg.url);
    Promise.resolve(c.canonicalUrl ? getSent(c.canonicalUrl) : null)
      .then((sent) => sendResponse({ classification: c, sent }))
      .catch(() => sendResponse({ classification: c, sent: null }));
    return true;
  }
  return false;
});
