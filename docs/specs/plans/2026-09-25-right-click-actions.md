# Right-click Add to batch / Download now — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-clicking a YouTube video or SoundCloud track offers Add to batch / Download now; the app asks for a genre and queues (and optionally starts) it.

**Architecture:** One optional `then` parameter on the existing v1 `djcrate://` URI carries the choice. The extension adds four context-menu items and passes `then`; the app parses it, carries it through window mode, the parked list and the quiet-mode inbox (schema v9 column), and the web UI opens a "Which genre?" dialog that calls the existing `batch.add` / `download.start` RPCs.

**Tech Stack:** Extension: MV3 JS, `node:test`. App: Python 3.10+, SQLite, pytest; web UI plain JS tested from Python (static + Node harness).

**Spec:** `docs/specs/2026-09-25-right-click-actions-design.md` (this repo)

## Global Constraints

- Contract version stays `v=1`; `then` ∈ {`batch`, `download`}, only meaningful with `kind=track`; unknown `then` value = absent.
- A send dict carries a `then` key **only when it is set** (existing tests compare `{"kind", "url"}` exactly).
- Menu copy, verbatim: `Add to batch`, `Download now`; existing `Send track to DJ-CrateBuilder` / `Send channel to DJ-CrateBuilder` / `Send link to DJ-CrateBuilder` unchanged.
- App repo rules: read `.claude/skills/changing-the-web-ui/SKILL.md` before editing `web/`; tests slice `app.js` as text with two-space-indented function markers; no new colours; never bump `APP_VERSION`/`APP_BUILD`; Conventional Commits; work in a worktree; never push without an ask.
- Extension repo: no dependencies; `npm test` must stay green; `npx --yes web-ext@8 lint --self-hosted --source-dir=dist/firefox` must stay at 0/0/0.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Workspaces

- **Extension:** `C:\Users\djsin\Documents\GitHub\DJ-CrateBuilder-Browser_Extensions\.claude\worktrees\clever-raman-79cbe7` (branch `claude/clever-raman-79cbe7`, up to date with `main`).
- **App:** create `git worktree add .worktrees/right-click-actions -b feat/right-click-actions main` in `C:\Users\djsin\Documents\GitHub\DJ-CrateBuilder`. Run all app commands from that worktree.

## File map

| Repo | File | Change |
|---|---|---|
| ext | `docs/specs/djcrate-uri-v1.md` | document `then` |
| ext | `src/lib/transport.js` | `buildUri` appends `&then=` |
| ext | `src/lib/menu-model.js` (new) | menu item table, id → action, send payload |
| ext | `src/lib/ui-text.js` | action titles |
| ext | `src/background.js` | create items from the table, toggle page items, pass `then` |
| ext | `docs/INSTALL.md`, `install/*.txt`, `docs/SPEC.md` | mention the new choices |
| app | `cratebuilder/browserlink.py` | `BrowserSend.then` |
| app | `cratebuilder/db.py` | schema v9 `then_action`, upsert choice |
| app | `cratebuilder/service.py` | carry `then` through receive/park/overflow/inbox |
| app | `web/app.js` | genre dialog, start logic, `handleBrowserSend` branch |
| app | tests: `test_browserlink.py`, `test_db.py`, `test_service_browser.py`, `test_web_browser_client.py` | new cases |

---

### Task 1: Contract + `buildUri` carries `then` (extension)

**Files:**
- Modify: `docs/specs/djcrate-uri-v1.md` (§1 table + a new §1.1, §5 JSON)
- Modify: `src/lib/transport.js` (`buildUri`)
- Test: `tests/transport.test.js`

**Interfaces:**
- Produces: `buildUri({kind, url, then?}) → string`; throws `TypeError` for `then` not in {undefined, 'batch', 'download'}.

- [ ] **Step 1: Write the failing tests** — append to `tests/transport.test.js`:

```js
test('buildUri appends the right-click choice when there is one', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const base = 'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ';
  assert.equal(buildUri({ kind: 'track', url, then: 'batch' }), `${base}&then=batch`);
  assert.equal(buildUri({ kind: 'track', url, then: 'download' }), `${base}&then=download`);
  assert.equal(buildUri({ kind: 'track', url, then: undefined }), base);
});

test('buildUri refuses a choice the contract does not define', () => {
  assert.throws(() => buildUri({ kind: 'track', url: 'https://soundcloud.com/a/b', then: 'play' }), TypeError);
});
```

- [ ] **Step 2: Run** `npm test` — expect the two new tests to FAIL (`then` ignored / no throw).

- [ ] **Step 3: Implement** — in `src/lib/transport.js` replace `buildUri` with:

```js
const THEN_VALUES = new Set(['batch', 'download']);

/**
 * Build the v1 URI for a send. Exported separately so it can be unit-tested
 * without a browser.
 *
 * @param {{kind: 'channel'|'track', url: string, then?: 'batch'|'download'}} payload
 *   — url is the canonical URL from the classifier, NOT the raw page URL;
 *   then is the right-click choice (contract §1.1), absent for a plain send.
 * @returns {string} e.g. "djcrate://add?v=1&kind=track&url=…&then=batch"
 */
export function buildUri({ kind, url, then } = {}) {
  if (kind !== 'channel' && kind !== 'track') {
    throw new TypeError(`bad kind: ${kind}`);
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new TypeError(`bad url: ${url}`);
  }
  if (then !== undefined && !THEN_VALUES.has(then)) {
    throw new TypeError(`bad then: ${then}`);
  }
  const uri = `djcrate://add?v=1&kind=${kind}&url=${encodeURIComponent(url)}`;
  return then ? `${uri}&then=${then}` : uri;
}
```

Also update `send`'s JSDoc payload type to include `then?`.

- [ ] **Step 4: Contract doc** — in `docs/specs/djcrate-uri-v1.md`:
  - Add a row to the §1 table: `| \`then\` | \`batch\` \| \`download\` | **Optional.** The right-click choice — see §1.1. |` and change the sentence "`v`, `kind`, and `url` are all required" to "`v`, `kind`, and `url` are required; `then` is optional".
  - Insert §1.1 after the examples:

```markdown
### 1.1 `then` — what to do with a track (optional)

| `then` | App behaviour |
|---|---|
| absent | Prefill the link box (the original v1 behaviour). |
| `batch` | Ask for a genre, add the track to the batch queue. |
| `download` | Ask for a genre, add it to the batch queue and start downloading (or join a batch already running). |

Only meaningful with `kind=track`; a receiver ignores it on `kind=channel`.
An unrecognised value is treated as absent — the link is still valid, so it
still arrives as a plain prefill. `v` stays `1`: an app that predates `then`
ignores it as an unknown extra parameter and prefills, which is a safe
fallback.

    djcrate://add?v=1&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb&then=download
```

  - §5: change the JSON to `{"v": 1, "action": "add", "kind": …, "url": …, "then": …}` and "the **same three fields**" to "the same fields".

- [ ] **Step 5: Run** `npm test` — all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transport.js tests/transport.test.js docs/specs/djcrate-uri-v1.md
git commit -m "feat(transport): optional then=batch|download on djcrate:// sends"
```

---

### Task 2: Menu model, titles, and background wiring (extension)

**Files:**
- Create: `src/lib/menu-model.js`
- Modify: `src/lib/ui-text.js` (add `ACTION_TITLES`)
- Modify: `src/background.js` (imports, `SITE_PATTERNS` moved, `refreshTabUi`, `createMenus`, `onClicked`, `handleSend`)
- Modify: `docs/INSTALL.md`, `install/chrome.txt`, `install/firefox.txt`, `docs/SPEC.md` §5.2
- Test: `tests/menu-model.test.js` (new), `tests/ui-text.test.js`

**Interfaces:**
- Consumes: `buildUri`/`send` with `then` (Task 1); `classify(url) → {kind, platform, canonicalUrl}`.
- Produces: `SITE_PATTERNS: string[]`, `TRACK_LINK_PATTERNS: string[]`, `MENU_ITEMS: {id, contexts, title, patterns, patternKey, then?, pageTrackOnly?}[]`, `menuAction(menuItemId) → {source: 'page'|'link', then: 'batch'|'download'|undefined}`, `sendPayload(classification, then) → {kind, url, then?}`; `ACTION_TITLES = {batch: 'Add to batch', download: 'Download now'}`.

- [ ] **Step 1: Write the failing tests** — `tests/menu-model.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MENU_ITEMS, SITE_PATTERNS, TRACK_LINK_PATTERNS, menuAction, sendPayload,
} from '../src/lib/menu-model.js';

test('the choices come first, the plain send last, for page and link alike', () => {
  assert.deepEqual(MENU_ITEMS.map((m) => m.id), [
    'djcb-page-batch', 'djcb-page-download', 'djcb-page',
    'djcb-link-batch', 'djcb-link-download', 'djcb-link',
  ]);
  const titles = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m.title]));
  assert.equal(titles['djcb-page-batch'], 'Add to batch');
  assert.equal(titles['djcb-link-download'], 'Download now');
  assert.equal(titles['djcb-link'], 'Send link to DJ-CrateBuilder');
});

test('page choices start hidden; the tab refresh shows them on a track', () => {
  const byId = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m]));
  assert.equal(byId['djcb-page-batch'].pageTrackOnly, true);
  assert.equal(byId['djcb-page-download'].pageTrackOnly, true);
  assert.equal(byId['djcb-page'].pageTrackOnly, undefined);
});

test('link choices are limited to track-shaped links; the plain link send is not', () => {
  const byId = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m]));
  assert.equal(byId['djcb-link-batch'].patterns, TRACK_LINK_PATTERNS);
  assert.equal(byId['djcb-link'].patterns, SITE_PATTERNS);
  assert.equal(byId['djcb-link'].patternKey, 'targetUrlPatterns');
  assert.equal(byId['djcb-page'].patternKey, 'documentUrlPatterns');
  for (const p of ['https://www.youtube.com/watch*', 'https://youtu.be/*',
    'https://www.youtube.com/shorts/*', 'https://soundcloud.com/*/*']) {
    assert.ok(TRACK_LINK_PATTERNS.includes(p), p);
  }
});

test('a menu id says where the URL comes from and what to do with it', () => {
  assert.deepEqual(menuAction('djcb-page'), { source: 'page', then: undefined });
  assert.deepEqual(menuAction('djcb-page-batch'), { source: 'page', then: 'batch' });
  assert.deepEqual(menuAction('djcb-link-download'), { source: 'link', then: 'download' });
  assert.deepEqual(menuAction('djcb-link'), { source: 'link', then: undefined });
});

test('the choice rides along only on a track; a channel gets a plain send', () => {
  const track = { kind: 'track', canonicalUrl: 'https://soundcloud.com/a/b' };
  const channel = { kind: 'channel', canonicalUrl: 'https://soundcloud.com/a' };
  assert.deepEqual(sendPayload(track, 'download'),
    { kind: 'track', url: 'https://soundcloud.com/a/b', then: 'download' });
  assert.deepEqual(sendPayload(track, undefined),
    { kind: 'track', url: 'https://soundcloud.com/a/b' });
  assert.deepEqual(sendPayload(channel, 'batch'),
    { kind: 'channel', url: 'https://soundcloud.com/a' });
});
```

And append to `tests/ui-text.test.js` (add `ACTION_TITLES` to its import):

```js
test('right-click choice titles (design 2026-09-25, verbatim)', () => {
  assert.deepEqual(ACTION_TITLES, { batch: 'Add to batch', download: 'Download now' });
});
```

- [ ] **Step 2: Run** `npm test` — expect FAIL (module/export missing).

- [ ] **Step 3: Implement** — `src/lib/ui-text.js`, after `menuTitleFor`:

```js
/** Right-click choices for a track (design 2026-09-25). */
export const ACTION_TITLES = Object.freeze({ batch: 'Add to batch', download: 'Download now' });
```

`src/lib/menu-model.js`:

```js
/**
 * The context-menu table and the pure decisions around it, kept out of
 * background.js so they can be tested without a browser.
 *
 * Creation order is menu order: the two choices first, the plain send last.
 * Chrome and Firefox fold an extension's items into a submenu named after it
 * once more than one is visible, so there is no parent item.
 */
import { ACTION_TITLES } from './ui-text.js';

export const SITE_PATTERNS = [
  'https://www.youtube.com/*', 'https://youtube.com/*',
  'https://m.youtube.com/*', 'https://music.youtube.com/*',
  'https://youtu.be/*',
  'https://soundcloud.com/*', 'https://www.soundcloud.com/*',
  'https://m.soundcloud.com/*',
];

// A link's kind can't be classified before the menu opens, so the choices
// are shown on links SHAPED like a track. SoundCloud's two-segment pattern
// also catches /artist/sets/… and /artist/likes; a click on one of those is
// classified at click time and falls back to a plain send (sendPayload).
export const TRACK_LINK_PATTERNS = [
  'https://www.youtube.com/watch*', 'https://youtube.com/watch*',
  'https://m.youtube.com/watch*', 'https://music.youtube.com/watch*',
  'https://www.youtube.com/shorts/*', 'https://youtube.com/shorts/*',
  'https://m.youtube.com/shorts/*',
  'https://www.youtube.com/live/*', 'https://youtube.com/live/*',
  'https://youtu.be/*',
  'https://soundcloud.com/*/*', 'https://www.soundcloud.com/*/*',
  'https://m.soundcloud.com/*/*',
];

const page = (id, title, extra = {}) => ({
  id, contexts: ['page'], title, patterns: SITE_PATTERNS,
  patternKey: 'documentUrlPatterns', ...extra,
});
const link = (id, title, patterns, extra = {}) => ({
  id, contexts: ['link'], title, patterns,
  patternKey: 'targetUrlPatterns', ...extra,
});

export const MENU_ITEMS = [
  page('djcb-page-batch', ACTION_TITLES.batch, { then: 'batch', pageTrackOnly: true }),
  page('djcb-page-download', ACTION_TITLES.download, { then: 'download', pageTrackOnly: true }),
  page('djcb-page', 'Send to DJ-CrateBuilder'),
  link('djcb-link-batch', ACTION_TITLES.batch, TRACK_LINK_PATTERNS, { then: 'batch' }),
  link('djcb-link-download', ACTION_TITLES.download, TRACK_LINK_PATTERNS, { then: 'download' }),
  link('djcb-link', 'Send link to DJ-CrateBuilder', SITE_PATTERNS),
];

const BY_ID = new Map(MENU_ITEMS.map((m) => [m.id, m]));

export function menuAction(menuItemId) {
  const item = BY_ID.get(menuItemId);
  return {
    source: item?.contexts[0] === 'link' ? 'link' : 'page',
    then: item?.then,
  };
}

/** What goes to transport.send: the choice only rides along on a track. */
export function sendPayload(c, then) {
  const payload = { kind: c.kind, url: c.canonicalUrl };
  if (c.kind === 'track' && then) payload.then = then;
  return payload;
}
```

`src/background.js`:
1. Imports: add `import { MENU_ITEMS, SITE_PATTERNS, menuAction, sendPayload } from './lib/menu-model.js';` and **delete** the local `const SITE_PATTERNS = [ … ];` block (lines 17-23).
2. In `refreshTabUi`, after the existing `contextMenus.update('djcb-page', …)` try-block, add:

```js
  // The two choices only make sense on a single track; on a channel page the
  // plain send is the whole menu.
  for (const item of MENU_ITEMS.filter((m) => m.pageTrackOnly)) {
    try {
      await api().contextMenus.update(item.id, { visible: c.kind === 'track' });
    } catch { /* menu not created yet */ }
  }
```

3. In `createMenus`, replace the two `create` calls with:

```js
      for (const m of MENU_ITEMS) {
        api().contextMenus.create({
          id: m.id, contexts: m.contexts, title: m.title,
          [m.patternKey]: m.patterns,
          ...(m.pageTrackOnly ? { visible: false } : {}),
        });
      }
```

4. Replace the `onClicked` listener with:

```js
api().contextMenus.onClicked.addListener((info, tab) => {
  const { source, then } = menuAction(info.menuItemId);
  const raw = source === 'link' ? info.linkUrl : (info.pageUrl ?? tab?.url);
  handleSend(raw, tab?.id, then).catch((err) => {
    console.warn('djcb: context-menu send failed', err);
  });
});
```

5. `handleSend(rawUrl, tabId, then)`: change the `send(...)` line to `await send(sendPayload(c, then), { tabId });`. Other callers (the `djcb:send` message) keep passing two arguments, so `then` is `undefined` for them.
6. Update the "Context menus (SPEC §5.2)" comment: the page choices are shown only on a track (toggled in `refreshTabUi`), the link choices by `TRACK_LINK_PATTERNS`.

- [ ] **Step 4: Run** `npm test` — all PASS. Then `npm run build` and `npx --yes web-ext@8 lint --self-hosted --source-dir=dist/firefox` → 0 errors, 0 warnings, 0 notices.

- [ ] **Step 5: Docs.**
  - `docs/INSTALL.md` "Your first send", step 2: after "the right-click menu", add a sentence: "On a video or track, the right-click menu also offers **Add to batch** and **Download now**: the app asks which genre, then queues it (and, for Download now, starts downloading)."
  - `install/chrome.txt` and `install/firefox.txt` "YOUR FIRST SEND": add the same sentence in plain text (no markdown).
  - `docs/SPEC.md` §5.2: add "Tracks also get **Add to batch** / **Download now** — see `docs/specs/2026-09-25-right-click-actions-design.md`."

- [ ] **Step 6: Run** `npm test` (the install-text test checks the .txt files still contain their required phrases) — PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/menu-model.js src/lib/ui-text.js src/background.js tests/menu-model.test.js tests/ui-text.test.js docs/INSTALL.md install/chrome.txt install/firefox.txt docs/SPEC.md
git commit -m "feat(menus): right-click Add to batch / Download now on tracks"
```

---

### Task 3: Parse `then` (app)

**Files:**
- Modify: `cratebuilder/browserlink.py`
- Test: `tests/test_browserlink.py`

**Interfaces:**
- Produces: `BrowserSend(kind, url, then=None)` — frozen dataclass; `then` ∈ {None, 'batch', 'download'}, never set on a channel.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_browserlink.py`:

```python
_TRACK = "djcrate://add?v=1&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb"


def test_then_is_absent_on_a_plain_send():
    assert parse_djcrate_uri(_TRACK).then is None


def test_then_carries_the_right_click_choice():
    assert parse_djcrate_uri(_TRACK + "&then=batch").then == "batch"
    assert parse_djcrate_uri(_TRACK + "&then=download") == BrowserSend(
        kind="track", url="https://soundcloud.com/a/b", then="download")


def test_an_unknown_then_is_a_plain_send_not_an_error():
    r = parse_djcrate_uri(_TRACK + "&then=play")
    assert isinstance(r, BrowserSend) and r.then is None


def test_then_is_ignored_on_a_channel():
    r = parse_djcrate_uri(
        "djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fa&then=download")
    assert r == BrowserSend(kind="channel", url="https://soundcloud.com/a")
```

- [ ] **Step 2: Run** `python -m pytest tests/test_browserlink.py -q` — FAIL (`BrowserSend` has no `then`).

- [ ] **Step 3: Implement** — in `cratebuilder/browserlink.py`:

```python
THEN_VALUES = ("batch", "download")


@dataclass(frozen=True)
class BrowserSend:
    kind: str   # 'channel' | 'track'
    url: str    # decoded canonical https URL
    then: str | None = None   # 'batch' | 'download' — a track's right-click choice
```

and replace `return BrowserSend(kind=kind, url=url)` with:

```python
        then = params.get("then", [None])[0]
        # Contract §1.1: only a track carries a choice, and a value this
        # build does not know is a plain send — the link itself is valid.
        if kind != "track" or then not in THEN_VALUES:
            then = None
        return BrowserSend(kind=kind, url=url, then=then)
```

Add `from __future__ import annotations` at the top if the repo's floor (3.10) rejects `str | None` in a dataclass field — it does not (PEP 604 is 3.10), so no import needed.

- [ ] **Step 4: Run** `python -m pytest tests/test_browserlink.py -q` — PASS.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/browserlink.py tests/test_browserlink.py
git commit -m "feat(browserlink): parse the optional then=batch|download choice"
```

---

### Task 4: Inbox remembers the choice — schema v9 (app)

**Files:**
- Modify: `cratebuilder/db.py` (`SCHEMA_VERSION`, `CREATE TABLE browser_inbox`, migration after the v8 comment, `add_inbox_item`, `list_inbox`, `get_inbox_item`)
- Test: `tests/test_db.py`

**Interfaces:**
- Produces: `add_inbox_item(*, url, kind, received_at=None, then=None) → bool` (True = fresh row; a coalesced repeat sets `then_action` to the newest choice and returns False); rows from `list_inbox()` / `get_inbox_item()` include `then_action`.

- [ ] **Step 1: Write the failing tests** — in `tests/test_db.py` rename `test_schema_version_is_8` → `test_schema_version_is_9` and change both `8`s to `9`. Append:

```python
def test_inbox_remembers_the_right_click_choice(tmp_path):
    db = _new_db(tmp_path)
    db.add_inbox_item(url="https://soundcloud.com/a/b", kind="track", then="download")
    db.add_inbox_item(url="https://soundcloud.com/a", kind="channel")
    rows = db.list_inbox()
    assert [r["then_action"] for r in rows] == ["download", None]
    assert db.get_inbox_item(rows[0]["id"])["then_action"] == "download"


def test_a_repeat_send_coalesces_and_the_newest_choice_wins(tmp_path):
    db = _new_db(tmp_path)
    url = "https://soundcloud.com/a/b"
    assert db.add_inbox_item(url=url, kind="track", then="batch") is True
    assert db.add_inbox_item(url=url, kind="track", then="download") is False
    assert db.inbox_count() == 1
    assert db.list_inbox()[0]["then_action"] == "download"
    assert db.add_inbox_item(url=url, kind="track") is False
    assert db.list_inbox()[0]["then_action"] is None


def test_an_existing_v8_database_gains_then_action(tmp_path):
    """v8 never shipped in a nightly but exists in local databases, so the
    column arrives by migration, not by editing v8's CREATE TABLE."""
    path = str(tmp_path / "v8.db")
    db = DownloadsDatabase(path)
    with db._conn() as conn:
        conn.execute("DROP TABLE browser_inbox")
        conn.execute("""CREATE TABLE browser_inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL, received_at INTEGER NOT NULL)""")
        conn.execute("INSERT INTO browser_inbox (url, kind, received_at) "
                     "VALUES ('https://soundcloud.com/a', 'channel', 1)")
        conn.execute("UPDATE schema_info SET value = '8' WHERE key = 'version'")
    reopened = DownloadsDatabase(path)
    assert "then_action" in _columns(reopened, "browser_inbox")
    assert reopened.list_inbox()[0]["then_action"] is None
    with reopened._conn() as conn:
        assert conn.execute("SELECT value FROM schema_info "
                            "WHERE key = 'version'").fetchone()["value"] == "9"
```

Also check the existing `test_an_existing_v7_database_gains_the_inbox_table` — if it asserts the version stamp is `"8"`, change that to `"9"`.

- [ ] **Step 2: Run** `python -m pytest tests/test_db.py -q` — FAIL.

- [ ] **Step 3: Implement** in `cratebuilder/db.py`:
  - `SCHEMA_VERSION = 9`.
  - `CREATE TABLE IF NOT EXISTS browser_inbox (…)`: add `then_action TEXT` after `received_at INTEGER NOT NULL` (comma after `NOT NULL`).
  - After the `# schema v8: browser_inbox …` comment block and before the `INSERT OR REPLACE INTO schema_info` statement:

```python
                # schema v9: browser_inbox.then_action — a quiet-mode send's
                # right-click choice ('batch' | 'download'), so Process can
                # ask for the genre and act on it. Fresh databases get it from
                # the CREATE above; v8 ones gain it here.
                try:
                    conn.execute(
                        "ALTER TABLE browser_inbox ADD COLUMN then_action TEXT")
                    self._log("info",
                              "migration: added then_action to browser_inbox")
                except sqlite3.OperationalError:
                    pass  # column already exists
```

  - Replace `add_inbox_item`:

```python
    def add_inbox_item(self, *, url, kind, received_at=None, then=None):
        """Queue a browser-extension send for later processing. A URL already
        pending is coalesced (returns False) and takes the newest right-click
        choice — the user's last click is what they meant; a fresh row
        returns True, which is what drives the tray ping."""
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO browser_inbox "
                "(url, kind, received_at, then_action) VALUES (?, ?, ?, ?)",
                (url, kind, int(received_at if received_at is not None
                                else time.time()), then))
            if cur.rowcount == 1:
                return True
            conn.execute("UPDATE browser_inbox SET then_action = ? WHERE url = ?",
                         (then, url))
            return False
```

  - `list_inbox` and `get_inbox_item`: select `id, url, kind, received_at, then_action`.

- [ ] **Step 4: Run** `python -m pytest tests/test_db.py -q` — PASS. Also `grep -rn "SCHEMA_VERSION\|== \"8\"\|'8'" tests/` for other pins of version 8 and update them.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/db.py tests/test_db.py
git commit -m "feat(db): schema v9 — browser inbox remembers the right-click choice"
```

---

### Task 5: Service carries `then` end to end (app)

**Files:**
- Modify: `cratebuilder/service.py` (`browser_receive`, `_queue_browser_overflow`, `browser_inbox_list`, `browser_inbox_take`)
- Test: `tests/test_service_browser.py`

**Interfaces:**
- Consumes: `BrowserSend.then` (Task 3); `add_inbox_item(..., then=)` and `then_action` rows (Task 4).
- Produces: send dicts `{"kind", "url"}` plus `"then"` only when set — in the `browser.send` event, `snapshot.browser.pending`, and `browser.inbox_take`'s return; `browser.inbox_list` rows gain `"then"` (always present, may be `None`).

- [ ] **Step 1: Write the failing tests** — in `tests/test_service_browser.py` change `_uri` to:

```python
def _uri(kind, url, then=None):
    uri = f"djcrate://add?v=1&kind={kind}&url={quote(url, safe='')}"
    return uri + (f"&then={then}" if then else "")
```

In `test_inbox_list_take_and_remove` change the key-set assertion to `{"id", "kind", "url", "received_at", "then"}`. Append:

```python
def test_a_live_send_carries_the_right_click_choice(service):
    _ready(service)
    service.browser_receive(_uri("track", TRACK, then="download"))
    assert _of(service, BROWSER_SEND) == [
        {"kind": "track", "url": TRACK, "then": "download"}]


def test_a_parked_send_keeps_its_choice(service):
    service.browser_receive(_uri("track", TRACK, then="batch"))
    assert _ready(service)["browser"]["pending"] == [
        {"kind": "track", "url": TRACK, "then": "batch"}]


def test_an_overflowed_send_keeps_its_choice_in_the_inbox(service):
    service.browser_receive(_uri("channel", CHANNEL))
    service.browser_receive(_uri("track", TRACK, then="download"))
    _ready(service)
    rows = service.call("browser.inbox_list")
    assert [(r["url"], r["then"]) for r in rows] == [(TRACK, "download")]


def test_quiet_mode_remembers_the_choice_and_process_hands_it_back(service, settings):
    settings.set("browser_receive_mode", RECEIVE_MODE_QUIET)
    service.browser_receive(_uri("track", TRACK, then="batch"))
    service.browser_receive(_uri("channel", CHANNEL))
    rows = service.call("browser.inbox_list")
    assert [(r["kind"], r["then"]) for r in rows] == [("track", "batch"), ("channel", None)]
    assert service.call("browser.inbox_take", {"id": rows[0]["id"]}) == {
        "kind": "track", "url": TRACK, "then": "batch"}
    assert service.call("browser.inbox_take", {"id": rows[1]["id"]}) == {
        "kind": "channel", "url": CHANNEL}
```

- [ ] **Step 2: Run** `python -m pytest tests/test_service_browser.py -q` — FAIL.

- [ ] **Step 3: Implement** in `cratebuilder/service.py`:
  - Add a module-level helper near `BROWSER_SEND`:

```python
def _send_dict(kind, url, then):
    """A browser send as the page sees it. `then` only when set, so a plain
    send stays exactly {kind, url}."""
    send = {"kind": kind, "url": url}
    if then:
        send["then"] = then
    return send
```

  - `browser_receive`: `send = _send_dict(result.kind, result.url, result.then)`; quiet-mode call becomes `add_inbox_item(url=result.url, kind=result.kind, then=result.then)`.
  - `_queue_browser_overflow`: `db.add_inbox_item(url=send["url"], kind=send["kind"], then=send.get("then"))`.
  - `browser_inbox_list`: add `"then": r["then_action"]` to each dict.
  - `browser_inbox_take`: `return _send_dict(row["kind"], row["url"], row["then_action"])`.

- [ ] **Step 4: Run** `python -m pytest tests/test_service_browser.py tests/test_browserlink.py tests/test_db.py -q` — PASS.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/service.py tests/test_service_browser.py
git commit -m "feat(service): carry the right-click choice through receive, park and inbox"
```

---

### Task 6: "Which genre?" dialog and start logic (app web UI)

Read `.claude/skills/changing-the-web-ui/SKILL.md` first.

**Files:**
- Modify: `web/app.js` — new block `/* ── right-click choices` placed immediately **before** `  /* ── browser extension sends`; `handleBrowserSend` branch; `markDownloadsStarted()` extracted from the `#dl-start` handler.
- Test: `tests/test_web_browser_client.py`

**Interfaces:**
- Consumes: send `{kind, url, then?}` (Task 5); existing `genreSelect(current)`, `genreRow(sel, platformOf)`, `platformFromUrl(url)`, `openModal`, `modalButton`, `labelled`, `closeModal`, `openNoGenreGate()`, `call(method, params)`, `cbApi.call`, `renderBatch()`, `renderDownloads()`, `toast`, `dl`, `state`, `NO_GENRE_VALUE`.
- Produces: `openBrowserAction(send)`, `async confirmBrowserAction(send, genre)`, `markDownloadsStarted()`.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_web_browser_client.py`:

```python
# ── right-click choices: Add to batch / Download now ────────────────────────

def test_a_track_with_a_choice_asks_for_a_genre_instead_of_prefilling(app_js):
    body = _slice(app_js, "  function handleBrowserSend(send)",
                  "  function drainBrowserPending()")
    assert "send.then === 'batch' || send.then === 'download'" in body
    assert body.index("openBrowserAction(send);") < body.index("if (send.kind === 'channel')")


def test_the_genre_dialog_labels_its_button_with_the_choice(app_js):
    body = _slice(app_js, "  function openBrowserAction(send)",
                  "  async function confirmBrowserAction(send, genre)")
    assert "title: 'Which genre?'" in body
    assert "'Download now' : 'Add to batch'" in body
    assert "modalButton('Cancel', 'cb-btn--quiet', closeModal)" in body
    assert "genreRow(sel, () => platform)" in body


def test_start_shares_the_state_reset_with_the_right_click_path(app_js):
    start = _slice(app_js, "$('#dl-start').addEventListener('click'",
                   "$('#dl-cancel').addEventListener('click'")
    assert "markDownloadsStarted();" in start


_ACTION_HARNESS = """
const NO_GENRE_VALUE = '(none)';
const calls = [];
const toasts = [];
let gateAnswer = true;
const reopened = [];
const dl = { running: %(running)s, paused: true, rows: { a: 1 }, current: 'x', overall: 1 };
const state = { batch: [] };
let startFails = %(start_fails)s;
async function call(method, params) {
  calls.push([method, params || null]);
  return method === 'batch.list' ? [{ id: 1 }] : {};
}
const cbApi = { call: async (method) => {
  calls.push([method, null]);
  if (startFails) { const e = new Error('A Watch List run is in progress.'); e.userFacing = true; throw e; }
  return {};
} };
function closeModal() {}
async function openNoGenreGate() { return gateAnswer; }
function openBrowserAction(send) { reopened.push(send.url); }
function platformFromUrl(u) { return /soundcloud/.test(u) ? 'SoundCloud' : 'YouTube'; }
function renderBatch() {}
let rendered = 0;
function renderDownloads() { rendered += 1; }
function toast(m, warn) { toasts.push([m, !!warn]); }
%(mark)s
%(confirm)s
(async () => {
  await confirmBrowserAction({ kind: 'track', url: 'https://soundcloud.com/a/b', then: '%(then)s' }, '%(genre)s');
  console.log(JSON.stringify({ calls, toasts, reopened, dl, rendered }));
})();
"""


def _run_action(app_js, tmp_path, *, then, genre="House", running="false",
                start_fails="false"):
    return _run_node(tmp_path, f"action_{then}_{running}_{start_fails}.mjs", _ACTION_HARNESS % {
        "then": then, "genre": genre, "running": running, "start_fails": start_fails,
        "mark": _slice(app_js, "  function markDownloadsStarted()", "\n  }\n") + "\n  }\n",
        "confirm": _slice(app_js, "  async function confirmBrowserAction(send, genre)",
                          "  /* ── browser extension sends"),
    })


def test_add_to_batch_queues_with_the_chosen_genre_and_starts_nothing(app_js, tmp_path):
    r = _run_action(app_js, tmp_path, then="batch")
    assert r["calls"][0] == ["batch.add", {"url": "https://soundcloud.com/a/b",
                                           "genre": "House", "platform": "SoundCloud"}]
    assert ["download.start", None] not in r["calls"]
    assert r["toasts"] == [["Added to batch", False]]


def test_download_now_queues_then_starts(app_js, tmp_path):
    r = _run_action(app_js, tmp_path, then="download")
    methods = [c[0] for c in r["calls"]]
    assert methods.index("batch.add") < methods.index("download.start")
    assert r["dl"]["running"] is True and r["dl"]["paused"] is False
    assert r["dl"]["rows"] == {} and r["rendered"] == 1


def test_download_now_during_a_running_batch_joins_it(app_js, tmp_path):
    r = _run_action(app_js, tmp_path, then="download", running="true")
    assert "download.start" not in [c[0] for c in r["calls"]]
    assert r["toasts"] == [["Added — it will download when its turn comes.", False]]


def test_download_now_blocked_by_a_watch_list_run_stays_queued(app_js, tmp_path):
    r = _run_action(app_js, tmp_path, then="download", start_fails="true")
    assert r["calls"][0][0] == "batch.add"
    assert r["toasts"] == [["Added to batch. A Watch List run is in progress.", True]]


def test_backing_out_of_the_no_genre_gate_reopens_the_genre_dialog(app_js, tmp_path):
    src = _ACTION_HARNESS.replace("let gateAnswer = true;", "let gateAnswer = false;")
    r = _run_node(tmp_path, "action_gate.mjs", src % {
        "then": "batch", "genre": "(none)", "running": "false", "start_fails": "false",
        "mark": _slice(app_js, "  function markDownloadsStarted()", "\n  }\n") + "\n  }\n",
        "confirm": _slice(app_js, "  async function confirmBrowserAction(send, genre)",
                          "  /* ── browser extension sends"),
    })
    assert r["calls"] == []
    assert r["reopened"] == ["https://soundcloud.com/a/b"]
```

- [ ] **Step 2: Run** `python -m pytest tests/test_web_browser_client.py -q` — FAIL (markers not found).

- [ ] **Step 3: Implement** in `web/app.js`:

  a) Immediately before the line `  /* ── browser extension sends ──…`, insert:

```js
  /* ── right-click choices ──────────────────────────────────────────────────
     A track sent with "Add to batch" or "Download now" (send.then). The
     browser can't know a genre, so this asks for one — the user chose to be
     asked every time — and the button repeats their choice so the click that
     commits is the one they already made. Cancel adds nothing. */
  function openBrowserAction(send) {
    const download = send.then === 'download';
    const platform = platformFromUrl(send.url);
    const sel = genreSelect($('#dl-genre').value || NO_GENRE_VALUE);
    openModal({
      title: 'Which genre?',
      width: 520,
      body(body) {
        const url = document.createElement('div');
        url.className = 'cb-mono';
        url.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px';
        url.textContent = send.url;
        url.title = send.url;
        body.append(labelled('Track', url), labelled('Genre', genreRow(sel, () => platform)));
      },
      foot(foot) {
        const cancel = modalButton('Cancel', 'cb-btn--quiet', closeModal);
        const go = modalButton(download ? 'Download now' : 'Add to batch', 'cb-btn--fill',
          () => confirmBrowserAction(send, sel.value));
        go.style.marginLeft = 'auto';
        foot.append(cancel, go);
      },
    });
  }

  /* One modal at a time: the genre dialog closes before the no-genre gate
     opens, so backing out of the gate re-asks rather than dropping the send. */
  async function confirmBrowserAction(send, genre) {
    closeModal();
    if (genre === NO_GENRE_VALUE && !(await openNoGenreGate())) {
      openBrowserAction(send);
      return;
    }
    try {
      await call('batch.add', { url: send.url, genre, platform: platformFromUrl(send.url) });
      state.batch = await call('batch.list');
      renderBatch();
    } catch (_) { return; /* call() already toasted the reason */ }
    if (send.then !== 'download') { toast('Added to batch'); return; }
    // batch.add has already put the row into the running batch.
    if (dl.running) { toast('Added — it will download when its turn comes.'); return; }
    try {
      await cbApi.call('download.start');
      markDownloadsStarted();
    } catch (err) {
      toast(err.userFacing ? `Added to batch. ${err.message}`
        : 'Added to batch — press Start once the Watch List run finishes.', true);
    }
  }

```

  b) In `handleBrowserSend`, inside the `setTimeout(() => {`, right after the second `closeModal();` and before `if (send.kind === 'channel') {`, insert:

```js
      if (send.kind === 'track' && (send.then === 'batch' || send.then === 'download')) {
        show('downloads');
        openBrowserAction(send);
        return;
      }
```

  c) Extract the state reset from the `#dl-start` handler. Add near `addToBatch()` (after it):

```js
  function markDownloadsStarted() {
    dl.running = true;
    dl.paused = false;
    dl.rows = {};
    dl.current = null;
    dl.overall = null;
    renderDownloads();
  }
```

  and in the `#dl-start` handler replace the six lines from `dl.running = true;` through `renderDownloads();` with `markDownloadsStarted();`.

- [ ] **Step 4: Run** `python -m pytest -q tests/test_web_*_client.py` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app.js tests/test_web_browser_client.py
git commit -m "feat(web): ask for a genre on a right-click Add to batch / Download now"
```

---

### Task 7: Full verification, then hand to the user

- [ ] **Step 1:** App worktree: `python -m pytest -q` — all pass (no new failures vs. `main`).
- [ ] **Step 2:** Extension worktree: `npm test`; `npm run build`; web-ext lint self-hosted → 0/0/0.
- [ ] **Step 3:** Tell the user how to try it (restart the test app from `.worktrees/right-click-actions`, reload the unpacked extension, refresh YouTube/SoundCloud tabs) and what to check: the three choices on a YouTube video, a SoundCloud track and a SoundCloud link; Cancel; (none) genre; Download now with and without a batch running; one quiet-mode send processed from the inbox; light and dark theme for the dialog.
- [ ] **Step 4 (after the user confirms):** merge `feat/right-click-actions` into app `main` and the extension branch into extension `main`; push both when the user says so. The app nightly (`scripts/release.py`) and the extension `v0.2.0` tag each wait for an explicit ask — app first, then extension (spec §5).
