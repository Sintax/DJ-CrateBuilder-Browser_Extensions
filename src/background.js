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
import { recordSent, getSent } from './lib/sent-memory.js';

const SITE_PATTERNS = [
  'https://www.youtube.com/*', 'https://youtube.com/*',
  'https://m.youtube.com/*', 'https://music.youtube.com/*',
  'https://youtu.be/*',
  'https://soundcloud.com/*', 'https://www.soundcloud.com/*',
  'https://m.soundcloud.com/*',
];

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

async function refreshTabUi(tabId, url) {
  const c = classify(url ?? '');
  const active = isSendable(c);
  try {
    await chrome.action.setIcon({
      tabId,
      imageData: { 16: drawIcon(16, active), 32: drawIcon(32, active) },
    });
  } catch { /* tab may be gone */ }
  const title = menuTitleFor(c);
  try {
    await chrome.contextMenus.update('djcb-page', {
      visible: title !== null,
      title: title ?? 'Send to DJ-CrateBuilder',
    });
  } catch { /* menu not created yet */ }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') refreshTabUi(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    refreshTabUi(tabId, tab.url);
  } catch { /* tab may be gone */ }
});

// ── Context menus (SPEC §5.2) ─────────────────────────────────────────────
// Page entry: retitled per active tab (Chrome has no onShown to retitle at
// open time — Firefox does, but this codepath works on both). Link entry:
// static title; host patterns keep it to the two sites, and a click on an
// unsupported link (e.g. a playlist) flashes the badge instead of silently
// doing nothing.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'djcb-page', contexts: ['page'],
    title: 'Send to DJ-CrateBuilder',
    documentUrlPatterns: SITE_PATTERNS,
  });
  chrome.contextMenus.create({
    id: 'djcb-link', contexts: ['link'],
    title: 'Send link to DJ-CrateBuilder',
    targetUrlPatterns: SITE_PATTERNS,
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const raw = info.menuItemId === 'djcb-link'
    ? info.linkUrl
    : (info.pageUrl ?? tab?.url);
  await handleSend(raw, tab?.id);
});

async function flashBadge(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c0392b' });
    await chrome.action.setBadgeText({ tabId, text: '✗' });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2000);
  } catch { /* tab may be gone */ }
}

// ── The one send path ─────────────────────────────────────────────────────
async function handleSend(rawUrl, tabId) {
  const c = classify(rawUrl);
  if (!isSendable(c)) {
    if (tabId !== undefined) await flashBadge(tabId);
    return { dispatched: false };
  }
  await send({ kind: c.kind, url: c.canonicalUrl }, { tabId });
  await recordSent(c.canonicalUrl, { kind: c.kind, platform: c.platform });
  return { dispatched: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'djcb:send') {
    handleSend(msg.url ?? sender?.tab?.url, msg.tabId ?? sender?.tab?.id)
      .then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'djcb:page-state') {
    const c = classify(msg.url);
    Promise.resolve(c.canonicalUrl ? getSent(c.canonicalUrl) : null)
      .then((sent) => sendResponse({ classification: c, sent }));
    return true;
  }
  return false;
});
