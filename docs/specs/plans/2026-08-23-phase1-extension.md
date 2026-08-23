# Phase 1 Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Phase 1 extension — classify the page, send a `djcrate://` URI, remember what was sent — loadable unpacked in Chrome and buildable for Firefox.

**Architecture:** All UI surfaces (popup, context menu, in-page button) route sends through the background worker, which is the only caller of `lib/transport.js` — the seam that makes Phase 2 (native messaging) an addition, not a rewrite. Pure logic lives in `src/lib/` modules tested with `node --test`; browser-API wiring stays thin and is verified manually.

**Tech Stack:** Plain JS, ES modules, Manifest V3, `node:test`. **Zero npm dependencies.**

**Spec:** `docs/SPEC.md` (design), `docs/specs/djcrate-uri-v1.md` (wire contract). The companion app-side plan is `DJ-CrateBuilder/docs/specs/plans/2026-08-23-browser-integration-receive.md`.

## Global Constraints

- Node ≥ 20; no npm dependencies, ever. Test command is bare `npm test` → `node --test` (passing a `tests/` path breaks discovery on Windows — don't).
- No UI surface may build a `djcrate://` string — only `lib/transport.js` does.
- `lib/classifier.js` stays pure (no browser APIs, never throws) — already implemented, don't touch except via its test table.
- Wire format changes require editing `docs/specs/djcrate-uri-v1.md` FIRST.
- Sent-state label is **"Sent ✓"**, never "Added" (one-way transport, SPEC §6).
- Never submit to the Chrome Web Store; no store scaffolding.
- Out of scope: playlists/sets, Edge, bookmarklet (SPEC §8).
- Conventional Commits (`type(scope): subject`). Commit freely; **never push without an explicit ask**.
- Working dir: `c:\Users\djsin\Documents\GitHub\DJ-CrateBuilder-Browser_Extensions`. LF line endings (enforced by `.gitattributes`).
- The existing stub files already contain doc comments; **replace stub bodies, keep or improve the doc comments**.

---

### Task 1: Fake-chrome test helper + transport module

**Files:**
- Create: `tests/helpers/fake-chrome.js`
- Modify: `src/lib/transport.js` (replace stub bodies)
- Test: `tests/transport.test.js`

**Interfaces:**
- Consumes: nothing (classifier exists but isn't needed here).
- Produces: `buildUri({kind, url}) → string` (throws `TypeError` on bad input);
  `send({kind, url}, {tabId} = {}) → Promise<{dispatched: true}>`;
  test helper `installFakeChrome() → {calls, store, uninstall}` where
  `calls.tabsUpdate` is an array of argument arrays and `store` is the
  `Map` behind `chrome.storage.local`.

Note: `node --test` only treats `*.test.js` files as tests, so `tests/helpers/fake-chrome.js` is safely ignored by discovery.

- [ ] **Step 1: Write the fake-chrome helper** (needed by this and later tasks)

```js
// tests/helpers/fake-chrome.js
/**
 * Minimal in-memory stand-in for the chrome.* APIs the extension uses.
 * Install before importing code under test; uninstall in afterEach.
 */
export function installFakeChrome() {
  const calls = { tabsUpdate: [] };
  const store = new Map();

  const asKeyList = (keys) => (typeof keys === 'string' ? [keys] : keys);

  globalThis.chrome = {
    tabs: {
      update: async (...args) => {
        calls.tabsUpdate.push(args);
        return {};
      },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (keys === null || keys === undefined) {
            return Object.fromEntries(store);
          }
          const out = {};
          for (const k of asKeyList(keys)) {
            if (store.has(k)) out[k] = structuredClone(store.get(k));
          }
          return out;
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) {
            store.set(k, structuredClone(v));
          }
        },
        remove: async (keys) => {
          for (const k of asKeyList(keys)) store.delete(k);
        },
        clear: async () => store.clear(),
      },
    },
  };
  return { calls, store, uninstall: () => { delete globalThis.chrome; } };
}
```

- [ ] **Step 2: Write the failing transport tests**

```js
// tests/transport.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeChrome } from './helpers/fake-chrome.js';
import { buildUri, send } from '../src/lib/transport.js';

test('buildUri builds the v1 URI with an encoded url', () => {
  assert.equal(
    buildUri({ kind: 'channel', url: 'https://soundcloud.com/someartist' }),
    'djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist',
  );
  // ? and = inside the URL must themselves be encoded (contract §1)
  assert.equal(
    buildUri({ kind: 'track', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ',
  );
});

test('buildUri rejects bad payloads', () => {
  assert.throws(() => buildUri({ kind: 'playlist', url: 'https://x.com' }), TypeError);
  assert.throws(() => buildUri({ kind: 'channel', url: 'http://insecure.com' }), TypeError);
  assert.throws(() => buildUri({ kind: 'channel', url: 42 }), TypeError);
  assert.throws(() => buildUri({}), TypeError);
});

test('send navigates the given tab to the built URI', async () => {
  const fake = installFakeChrome();
  try {
    const out = await send(
      { kind: 'track', url: 'https://soundcloud.com/a/b' }, { tabId: 7 });
    assert.deepEqual(out, { dispatched: true });
    assert.deepEqual(fake.calls.tabsUpdate, [
      [7, { url: 'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb' }],
    ]);
  } finally {
    fake.uninstall();
  }
});

test('send without a tabId targets the active tab (no-id overload)', async () => {
  const fake = installFakeChrome();
  try {
    await send({ kind: 'channel', url: 'https://soundcloud.com/a' });
    assert.equal(fake.calls.tabsUpdate.length, 1);
    assert.equal(fake.calls.tabsUpdate[0].length, 1); // props only, no tabId
  } finally {
    fake.uninstall();
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: transport tests FAIL with "not implemented — see docs/SPEC.md §3.1" (the stub throws); classifier's 20 keep passing.

- [ ] **Step 4: Implement transport** — replace both stub bodies in `src/lib/transport.js`, keeping the file's doc comments:

```js
export function buildUri({ kind, url } = {}) {
  if (kind !== 'channel' && kind !== 'track') {
    throw new TypeError(`bad kind: ${kind}`);
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new TypeError(`bad url: ${url}`);
  }
  return `djcrate://add?v=1&kind=${kind}&url=${encodeURIComponent(url)}`;
}

export async function send(payload, { tabId } = {}) {
  const uri = buildUri(payload);
  if (tabId !== undefined) {
    await chrome.tabs.update(tabId, { url: uri });
  } else {
    await chrome.tabs.update({ url: uri });
  }
  return { dispatched: true };
}
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm test` — Expected: all pass (20 classifier + 4 transport).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/fake-chrome.js tests/transport.test.js src/lib/transport.js
git commit -m "feat(transport): djcrate:// URI builder and tab-navigation send"
```

---

### Task 2: Sent-memory

**Files:**
- Modify: `src/lib/sent-memory.js` (replace stub bodies; keep doc comments)
- Test: `tests/sent-memory.test.js`

**Interfaces:**
- Consumes: `installFakeChrome()` from Task 1.
- Produces: `getSent(canonicalUrl) → Promise<{kind, platform, sentAt}|null>`;
  `recordSent(canonicalUrl, {kind, platform}, now = Date.now()) → Promise<void>`;
  `history(limit = 50) → Promise<Array<{url, kind, platform, sentAt}>>` newest-first;
  `clearAll() → Promise<void>`.
  Storage keys are `'sent:' + canonicalUrl`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/sent-memory.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeChrome } from './helpers/fake-chrome.js';
import { getSent, recordSent, history, clearAll } from '../src/lib/sent-memory.js';

test('sent-memory round trip, history order, and clear', async () => {
  const fake = installFakeChrome();
  try {
    assert.equal(await getSent('https://soundcloud.com/a'), null);

    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 1000);
    await recordSent('https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { kind: 'track', platform: 'youtube' }, 2000);

    assert.deepEqual(await getSent('https://soundcloud.com/a'),
      { kind: 'channel', platform: 'soundcloud', sentAt: 1000 });

    const h = await history();
    assert.deepEqual(h.map((e) => e.url), [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',   // newest first
      'https://soundcloud.com/a',
    ]);
    assert.equal(h[0].kind, 'track');

    await clearAll();
    assert.equal((await history()).length, 0);
    assert.equal(await getSent('https://soundcloud.com/a'), null);
  } finally {
    fake.uninstall();
  }
});

test('history caps at the limit', async () => {
  const fake = installFakeChrome();
  try {
    for (let i = 0; i < 60; i++) {
      await recordSent(`https://soundcloud.com/artist${i}`,
        { kind: 'channel', platform: 'soundcloud' }, i);
    }
    const h = await history();
    assert.equal(h.length, 50);
    assert.equal(h[0].url, 'https://soundcloud.com/artist59'); // newest kept
  } finally {
    fake.uninstall();
  }
});

test('re-sending overwrites the record (keyed by canonical URL)', async () => {
  const fake = installFakeChrome();
  try {
    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 1000);
    await recordSent('https://soundcloud.com/a',
      { kind: 'channel', platform: 'soundcloud' }, 5000);
    assert.equal((await getSent('https://soundcloud.com/a')).sentAt, 5000);
    assert.equal((await history()).length, 1);
  } finally {
    fake.uninstall();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test`; expected FAIL with "not implemented".

- [ ] **Step 3: Implement** — replace the four stub bodies in `src/lib/sent-memory.js`:

```js
const PREFIX = 'sent:';

export async function getSent(canonicalUrl) {
  const key = PREFIX + canonicalUrl;
  const got = await chrome.storage.local.get(key);
  return got[key] ?? null;
}

export async function recordSent(canonicalUrl, { kind, platform }, now = Date.now()) {
  await chrome.storage.local.set({
    [PREFIX + canonicalUrl]: { kind, platform, sentAt: now },
  });
}

export async function history(limit = 50) {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, rec]) => ({ url: k.slice(PREFIX.length), ...rec }))
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, limit);
}

export async function clearAll() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
}
```

- [ ] **Step 4: Run tests to verify all pass** — `npm test`.

- [ ] **Step 5: Commit**

```bash
git add tests/sent-memory.test.js src/lib/sent-memory.js
git commit -m "feat(sent-memory): storage.local records keyed by canonical URL"
```

---

### Task 3: UI text helpers

**Files:**
- Create: `src/lib/ui-text.js`
- Test: `tests/ui-text.test.js`

**Interfaces:**
- Consumes: classification objects (`{kind, platform}`) from `classifier.js`.
- Produces: `buttonLabelFor({kind}) → string|null`;
  `menuTitleFor({kind}) → string|null`;
  `sentLine(sentAt, now = Date.now()) → string` ("Sent ✓ · 2 days ago").
  All copy lives here so popup / menu / in-page button can't drift apart.

- [ ] **Step 1: Write the failing tests**

```js
// tests/ui-text.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buttonLabelFor, menuTitleFor, sentLine } from '../src/lib/ui-text.js';

test('button labels (SPEC §5.1 copy, verbatim)', () => {
  assert.equal(buttonLabelFor({ kind: 'channel' }), 'Add channel to Watch List');
  assert.equal(buttonLabelFor({ kind: 'track' }), 'Download this track');
  assert.equal(buttonLabelFor({ kind: 'unsupported' }), null);
});

test('context-menu titles (SPEC §5.2 copy, verbatim)', () => {
  assert.equal(menuTitleFor({ kind: 'channel' }), 'Send channel to DJ-CrateBuilder');
  assert.equal(menuTitleFor({ kind: 'track' }), 'Send track to DJ-CrateBuilder');
  assert.equal(menuTitleFor({ kind: 'unsupported' }), null);
});

test('sentLine buckets relative time and always says Sent, never Added', () => {
  const now = 10 * 24 * 60 * 60 * 1000;
  assert.equal(sentLine(now - 5 * 1000, now), 'Sent ✓ · just now');
  assert.equal(sentLine(now - 90 * 1000, now), 'Sent ✓ · 1 minute ago');
  assert.equal(sentLine(now - 30 * 60 * 1000, now), 'Sent ✓ · 30 minutes ago');
  assert.equal(sentLine(now - 3 * 60 * 60 * 1000, now), 'Sent ✓ · 3 hours ago');
  assert.equal(sentLine(now - 2 * 24 * 60 * 60 * 1000, now), 'Sent ✓ · 2 days ago');
  assert.ok(!sentLine(now - 1000, now).includes('Added'));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`; expected FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// src/lib/ui-text.js
/**
 * All user-facing copy for the three surfaces, in one place so they can't
 * drift apart. "Sent ✓" — never "Added" — because Phase 1 is one-way and
 * the extension only knows it dispatched the URI (SPEC §6).
 */

export function buttonLabelFor({ kind }) {
  if (kind === 'channel') return 'Add channel to Watch List';
  if (kind === 'track') return 'Download this track';
  return null;
}

export function menuTitleFor({ kind }) {
  if (kind === 'channel') return 'Send channel to DJ-CrateBuilder';
  if (kind === 'track') return 'Send track to DJ-CrateBuilder';
  return null;
}

export function sentLine(sentAt, now = Date.now()) {
  const plural = (n, unit) => `Sent ✓ · ${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const s = Math.max(0, Math.floor((now - sentAt) / 1000));
  if (s < 60) return 'Sent ✓ · just now';
  const m = Math.floor(s / 60);
  if (m < 60) return plural(m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return plural(h, 'hour');
  return plural(Math.floor(h / 24), 'day');
}
```

- [ ] **Step 4: Run tests to verify all pass** — `npm test`.

- [ ] **Step 5: Commit**

```bash
git add tests/ui-text.test.js src/lib/ui-text.js
git commit -m "feat(ui-text): shared surface copy and Sent-state formatting"
```

---

### Task 4: Popup view-model

**Files:**
- Create: `src/lib/popup-model.js`
- Test: `tests/popup-model.test.js`

**Interfaces:**
- Consumes: `classify`, `describe`, `isSendable` (classifier); `buttonLabelFor`, `sentLine` (ui-text).
- Produces: `popupModel({rawUrl, title, sent = null, now = Date.now()})` →
  `{sendable, title, detected, buttonLabel, sentLine, payload}` where `payload`
  is `{kind, url, platform}` (`url` = canonical) or `null` when not sendable.
  Task 6's popup.js renders exactly this object.

- [ ] **Step 1: Write the failing tests**

```js
// tests/popup-model.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { popupModel } from '../src/lib/popup-model.js';

test('sendable channel page', () => {
  const m = popupModel({
    rawUrl: 'https://www.youtube.com/@someartist/videos',
    title: 'Some Artist - YouTube',
    now: 5000,
  });
  assert.deepEqual(m, {
    sendable: true,
    title: 'Some Artist - YouTube',
    detected: 'YouTube channel',
    buttonLabel: 'Add channel to Watch List',
    sentLine: null,
    payload: {
      kind: 'channel',
      url: 'https://www.youtube.com/@someartist',
      platform: 'youtube',
    },
  });
});

test('sendable track with an existing sent record', () => {
  const m = popupModel({
    rawUrl: 'https://soundcloud.com/a/b',
    title: 'b by a',
    sent: { kind: 'track', platform: 'soundcloud', sentAt: 0 },
    now: 2 * 24 * 60 * 60 * 1000,
  });
  assert.equal(m.buttonLabel, 'Download this track');
  assert.equal(m.sentLine, 'Sent ✓ · 2 days ago');
  assert.equal(m.payload.url, 'https://soundcloud.com/a/b');
});

test('unsupported page', () => {
  const m = popupModel({ rawUrl: 'https://example.com/x', title: 'X' });
  assert.equal(m.sendable, false);
  assert.equal(m.detected, 'Not a supported YouTube or SoundCloud page');
  assert.equal(m.buttonLabel, null);
  assert.equal(m.payload, null);
});

test('missing title and url degrade gracefully', () => {
  const m = popupModel({ rawUrl: undefined, title: undefined });
  assert.equal(m.sendable, false);
  assert.equal(m.title, '');
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`.

- [ ] **Step 3: Implement**

```js
// src/lib/popup-model.js
/**
 * Pure view-model for the toolbar popup (SPEC §5.1): everything popup.js
 * renders, computed with no DOM and no browser APIs so it's testable.
 */
import { classify, describe, isSendable } from './classifier.js';
import { buttonLabelFor, sentLine } from './ui-text.js';

export function popupModel({ rawUrl, title, sent = null, now = Date.now() }) {
  const c = classify(rawUrl);
  if (!isSendable(c)) {
    return {
      sendable: false,
      title: title ?? '',
      detected: 'Not a supported YouTube or SoundCloud page',
      buttonLabel: null,
      sentLine: null,
      payload: null,
    };
  }
  return {
    sendable: true,
    title: title ?? '',
    detected: describe(c),
    buttonLabel: buttonLabelFor(c),
    sentLine: sent ? sentLine(sent.sentAt, now) : null,
    payload: { kind: c.kind, url: c.canonicalUrl, platform: c.platform },
  };
}
```

- [ ] **Step 4: Run tests to verify all pass** — `npm test`.

- [ ] **Step 5: Commit**

```bash
git add tests/popup-model.test.js src/lib/popup-model.js
git commit -m "feat(popup-model): pure view-model for the toolbar popup"
```

---

### Task 5: Background worker — icon state, context menus, send routing

**Files:**
- Modify: `src/background.js` (replace the stub; keep the header comment)
- Verify: manual, loaded unpacked in Chrome

**Interfaces:**
- Consumes: `classify`, `isSendable` (classifier); `menuTitleFor` (ui-text); `send` (transport); `recordSent`, `getSent` (sent-memory).
- Produces (runtime messages later tasks rely on):
  - `{type: 'djcb:send', url, tabId}` → responds `{dispatched: boolean}` — the ONLY send path for popup and content script.
  - `{type: 'djcb:page-state', url}` → responds `{classification, sent}` where `classification` is the classify() result and `sent` is the sent-memory record or null.

- [ ] **Step 1: Implement `src/background.js`** (no unit test — thin wiring over already-tested modules; verified by the manual smoke below):

```js
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
```

- [ ] **Step 2: Run the full test suite** — `npm test`; expected: all still pass (background has no unit tests, but a syntax error would surface when Chrome loads it).

- [ ] **Step 3: Build and load unpacked**

Run: `npm run build`, then Chrome → `chrome://extensions` → Developer Mode → Load unpacked → `dist/chrome/`.

- [ ] **Step 4: Manual smoke checklist**

- Icon turns orange on `https://soundcloud.com/discover`? It must NOT (unsupported page) — gray.
- Icon orange on a SoundCloud artist page and a YouTube channel page; gray on `https://www.youtube.com` home.
- Right-click on a channel page → "Send channel to DJ-CrateBuilder" appears; on a YouTube home page → no entry.
- Right-click a link to a channel from Google results → "Send link to DJ-CrateBuilder" appears.
- Clicking a send entry with **no handler registered yet**: Chrome shows its external-protocol dialog or does nothing visible — either is expected at this stage; the send counts as dispatched. (**Contingency:** if instead the service-worker console shows a `tabs.update` error about the URL scheme, Chrome has blocked protocol navigation from the API — switch `send()` in `src/lib/transport.js` to `chrome.tabs.create({url: uri, active: false})` + `chrome.tabs.remove` of the created tab after 3s, update `tests/transport.test.js` to match the new calls, and note it in the file's doc comment.)

- [ ] **Step 5: Commit**

```bash
git add src/background.js
git commit -m "feat(background): tab icon state, context menus, single send path"
```

---

### Task 6: Popup UI + sent history view

**Files:**
- Modify: `src/popup/popup.html`, `src/popup/popup.js`, `src/popup/popup.css` (replace stubs)
- Verify: manual

**Interfaces:**
- Consumes: `popupModel` (Task 4), `history`/`clearAll` (Task 2, imported directly — popup pages may read storage), `djcb:send` + `djcb:page-state` messages (Task 5).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Replace `src/popup/popup.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main id="view-main">
    <p id="page-title"></p>
    <p id="detected"></p>
    <button id="send" hidden></button>
    <p id="sent-state" hidden></p>
    <nav>
      <a id="help-link" href="#">CrateBuilder didn't open?</a>
      <a id="history-link" href="#">Sent history</a>
    </nav>
  </main>
  <main id="view-history" hidden>
    <p class="heading">Sent history</p>
    <ul id="history-list"></ul>
    <nav>
      <a id="back-link" href="#">Back</a>
      <a id="clear-link" href="#">Clear all</a>
    </nav>
  </main>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `src/popup/popup.js`**

```js
/**
 * Toolbar popup (SPEC §5.1). Renders popupModel() for the active tab; the
 * send button routes through the background's djcb:send so recording can't
 * be skipped. Popup-before-send is deliberate: the user sees what they're
 * about to send before the browser's external-protocol dialog.
 */
import { popupModel } from '../lib/popup-model.js';
import { history, clearAll } from '../lib/sent-memory.js';
import { sentLine } from '../lib/ui-text.js';

const HELP_URL =
  'https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/blob/main/docs/help/didnt-open.md';

const $ = (id) => document.getElementById(id);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = await chrome.runtime.sendMessage(
    { type: 'djcb:page-state', url: tab?.url ?? '' });
  const model = popupModel({
    rawUrl: tab?.url, title: tab?.title, sent: state?.sent ?? null });
  render(model, tab);
}

function render(model, tab) {
  $('page-title').textContent = model.title;
  $('detected').textContent = model.detected;
  $('detected').classList.toggle('dim', !model.sendable);
  const btn = $('send');
  btn.hidden = !model.sendable;
  btn.textContent = model.buttonLabel ?? '';
  $('sent-state').hidden = model.sentLine === null;
  $('sent-state').textContent = model.sentLine ?? '';
  btn.onclick = async () => {
    btn.disabled = true;
    const out = await chrome.runtime.sendMessage(
      { type: 'djcb:send', url: tab.url, tabId: tab.id });
    if (out?.dispatched) {
      $('sent-state').textContent = 'Sent ✓ · just now';
      $('sent-state').hidden = false;
    }
    btn.disabled = false;
  };
}

async function showHistory() {
  const list = $('history-list');
  list.replaceChildren();
  const now = Date.now();
  for (const entry of await history()) {
    const li = document.createElement('li');
    const url = document.createElement('span');
    url.className = 'hist-url';
    url.textContent = entry.url;
    const when = document.createElement('span');
    when.className = 'hist-when';
    when.textContent = sentLine(entry.sentAt, now);
    li.append(url, when);
    list.append(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing sent yet.';
    list.append(li);
  }
  $('view-main').hidden = true;
  $('view-history').hidden = false;
}

$('help-link').onclick = () => chrome.tabs.create({ url: HELP_URL });
$('history-link').onclick = showHistory;
$('back-link').onclick = () => {
  $('view-history').hidden = true;
  $('view-main').hidden = false;
};
$('clear-link').onclick = async () => { await clearAll(); showHistory(); };

init();
```

- [ ] **Step 3: Replace `src/popup/popup.css`**

```css
body {
  width: 300px;
  margin: 0;
  padding: 12px;
  font: 13px/1.45 system-ui, sans-serif;
  color: #222;
  background: #fff;
}
#page-title { font-weight: 600; margin: 0 0 2px; word-break: break-word; }
#detected { margin: 0 0 10px; color: #444; }
#detected.dim { color: #999; }
.heading { font-weight: 600; margin: 0 0 8px; }
#send {
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: #e6772e;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
#send:disabled { opacity: 0.6; }
#sent-state { margin: 8px 0 0; color: #2e7d32; }
nav { display: flex; justify-content: space-between; margin-top: 12px; }
nav a { color: #666; font-size: 12px; cursor: pointer; text-decoration: underline; }
#history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
}
#history-list li { padding: 4px 0; border-bottom: 1px solid #eee; }
.hist-url { display: block; word-break: break-all; }
.hist-when { color: #2e7d32; font-size: 11px; }
```

- [ ] **Step 4: Test + rebuild + manual verify**

Run: `npm test` (all pass), `npm run build`, reload the unpacked extension.

- On a channel page: title, "YouTube channel", orange "Add channel to Watch List" button.
- On a track page: "Download this track".
- On an unsupported page: gray text, no button.
- Click send → button works, "Sent ✓ · just now" appears; revisit popup → sent line persists.
- "Sent history" lists the send; "Clear all" empties it; "Back" returns.
- "CrateBuilder didn't open?" opens the help doc on GitHub.

- [ ] **Step 5: Commit**

```bash
git add src/popup/
git commit -m "feat(popup): detection view, send button, sent history"
```

---

### Task 7: In-page button + per-site adapters

**Files:**
- Modify: `src/content/inpage.js` (replace stub; keep header comment)
- Verify: manual on live youtube.com and soundcloud.com

**Interfaces:**
- Consumes: `djcb:page-state` and `djcb:send` messages (Task 5). Content scripts are not ES modules — they talk to the background instead of importing libs.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Implement `src/content/inpage.js`**

```js
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
```

- [ ] **Step 2: Rebuild and manual verify** — `npm run build`, reload extension, then on live sites:

- YouTube channel page: button appears near Subscribe. Navigate (SPA) to a video: button moves to the like/share cluster with track styling.
- SoundCloud artist page and track page: same pattern.
- A page where no anchor matches (simulate: temporarily change a selector list to `['#nonexistent']`, rebuild): button docks bottom-right corner — then restore the selectors.
- Click → external-protocol behaviour as in Task 5; button flips to "Sent ✓"; reload page → still "Sent ✓".
- Watch the tab console for errors during 5 minutes of normal browsing (the 1s poll must be silent).

- [ ] **Step 3: Run tests** — `npm test` (unchanged, all pass).

- [ ] **Step 4: Commit**

```bash
git add src/content/inpage.js
git commit -m "feat(content): in-page button with per-site anchors and corner-dock fallback"
```

---

### Task 8: Firefox build check

**Files:**
- Modify: `src/manifest.firefox.json` (only if the manual check below finds a dialect problem)
- Verify: manual, temporary load in Firefox

**Interfaces:** none new.

- [ ] **Step 1: Build** — `npm run build:firefox`.

- [ ] **Step 2: Temporary-load in Firefox** — `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → pick `dist/firefox/manifest.json`.

- [ ] **Step 3: Manual smoke** — repeat the Task 5 and Task 6 checklists in Firefox. Known dialect notes: Firefox MV3 supports the `chrome.*` namespace and event-page `background.scripts`; `OffscreenCanvas` works in event pages. If `chrome.action.setIcon` with `imageData` misbehaves, fall back to accepting the default icon in Firefox and note it in the README (don't add asset files for this).

- [ ] **Step 4: Note the signing story in the README** — append to the Developing section of `README.md`:

```markdown
### Firefox

`npm run build:firefox` produces `dist/djcratebuilder-firefox.zip`. For
day-to-day development use `about:debugging` → "Load Temporary Add-on"
(reverts on restart). For a permanent install, the zip must be signed:
upload it at https://addons.mozilla.org/developers/ as **unlisted**
(self-distribution), then install the signed `.xpi` it hands back.
```

- [ ] **Step 5: Commit**

```bash
git add README.md src/manifest.firefox.json
git commit -m "chore(firefox): verify MV3 build and document self-host signing"
```

---

### Task 9: End-to-end verification (GATED — needs the app-side plan complete)

**Files:**
- Create: `docs/e2e-checklist.md` (results recorded inline)

**Interfaces:** consumes the finished app-side work from `DJ-CrateBuilder/docs/specs/plans/2026-08-23-browser-integration-receive.md`.

Do not start until the app repo's Browser-integration Settings toggle exists and its full pytest suite is green.

- [ ] **Step 1: Create `docs/e2e-checklist.md`** with this table and fill every cell with PASS/FAIL + notes as you run it:

```markdown
# Phase 1 end-to-end checklist

Prereq: app built from the browser-integration branch, handler registered via
Settings → Browser integration, extension loaded (Chrome unpacked / Firefox
temporary).

| # | Scenario | Chrome | Firefox |
|---|---|---|---|
| 1 | App running · popup-send a YouTube channel → add-channel dialog opens prefilled | | |
| 2 | App running · popup-send a SoundCloud track → Main tab prefilled with track URL | | |
| 3 | App closed · send a channel → app launches, dialog opens prefilled after UI up | | |
| 4 | Context menu on a channel page → same result as #1 | | |
| 5 | Context menu on a link to a channel (from search results page) → sends link target | | |
| 6 | In-page button on channel + track pages → sends, flips to "Sent ✓" | | |
| 7 | Receive mode "Collect quietly" → send lands in inbox, count visible, process opens dialog | | |
| 8 | Duplicate quiet send of same URL → coalesced, count unchanged | | |
| 9 | Handler NOT registered → nothing opens; popup help link explains | | |
| 10 | Popup sent-state + history reflect all of the above | | |
```

- [ ] **Step 2: Run every row in both browsers.** Any FAIL: fix (in whichever repo owns the failure), re-run the row, only then mark PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/e2e-checklist.md
git commit -m "docs(e2e): record Phase 1 end-to-end verification results"
```

---

## Self-review notes

- SPEC coverage: §3.1 transport → Task 1; §4 classifier → already done (pre-plan); §5.1 → Tasks 4+6; §5.2 → Task 5; §5.3 → Task 7; §6 → Tasks 2/5/6/7; §7 help link → Task 6; §9 Firefox → Task 8; §11 manual E2E → Task 9. §10 (app side) is the companion plan.
- Known judgment call, documented in Task 5: Chrome cannot retitle a link context-menu entry per-target before display (no `onShown`), so the link entry has a static title with host-pattern gating — the page entry is retitled per tab as SPEC words it.
- Contingency for `tabs.update` protocol navigation is spelled out in Task 5 Step 4 rather than hidden.
