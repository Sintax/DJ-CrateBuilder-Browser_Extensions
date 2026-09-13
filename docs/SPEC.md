# DJ-CrateBuilder Browser Extension — design spec

**Status:** approved 2026-08-23, implementation not started
**Supersedes:** the "Design decisions" section of [HANDOFF.md](HANDOFF.md), which
this document expands. The handoff stays as the record of how these decisions
were reached; this is the spec to build from.
**Prior art:** [research report](research/CrateBuilder_Extension_Research_20260821/report.md)
— read it for *why* the protocol-handler architecture was chosen. That analysis
is settled and is not reopened here.

---

## 1. What this builds

A browser extension that hands YouTube and SoundCloud URLs to the
DJ-CrateBuilder desktop app. Channels go to the app's Watch List; individual
tracks go to its download flow.

The extension **never downloads anything**, never talks to yt-dlp, and never
opens a network connection. It classifies the current page (or a link) and
navigates to a `djcrate://` URI. Everything else — genre selection, metadata
probing, dedup, the actual download — stays in the app, where that machinery
already exists.

The work spans two repositories:

| | Repo | Contains |
|---|---|---|
| **Send side** | this repo | Manifest V3 extension, three UI surfaces, URL classifier, sent-memory, transport module |
| **Receive side** | `DJ-CrateBuilder` | Handler registration, argv parsing, widened singleton protocol, two receive modes |

The contract between them is [`docs/specs/djcrate-uri-v1.md`](specs/djcrate-uri-v1.md).
That file is the whole API.

## 2. Constraints inherited from the research

Two findings bound the design and are not up for renegotiation:

- **The Chrome Web Store prohibits extensions that *facilitate* downloading
  YouTube content.** This extension is never submitted. Chrome loads it
  unpacked via Developer Mode; Firefox takes a self-hosted signed build.
- **Chrome 142's Local Network Access gating** is why the localhost-HTTP-bridge
  architecture was deferred rather than chosen. Don't reach for it.

## 3. Architecture

Phase 1 is the `djcrate://` custom protocol handler, one-way browser→app —
**structured so Phase 2 (native messaging, bidirectional) slots in without a
rewrite.**

### 3.1 The transport seam

Every UI surface calls one function:

```js
transport.send({ kind, url })   // → Promise<{ dispatched: boolean }>
```

The Phase 1 implementation builds a `djcrate://` URI and navigates to it. The
Phase 2 implementation posts a JSON message to a native host. **UI code never
learns which transport ran** and must never branch on it. This seam is the
single reason Phase 2 is an addition rather than a rewrite, so it is load-bearing:
no surface may build a `djcrate://` string itself.

`dispatched` means "handed to the browser", not "the app received it". Phase 1
cannot know the latter — see §7.

### 3.2 Flow

**App running:** click → `djcrate://` navigation → OS launches a second app
instance → it loses the singleton bind on port 49737 → forwards
`add djcrate://…` over the socket → exits. The running app receives, marshals
to the Tk thread, acts.

**App not running:** same start, but this instance wins the bind and processes
the payload once its UI is up. Quiet-inbox mode is still respected — it may
start minimised to tray.

This reuses `cratebuilder/singleton.py` exactly as designed; the
"second launch forwards to the running instance then exits" pattern is already
there for the `show` verb.

## 4. The URL classifier

One pure module, no browser APIs, no imports — the heart of the extension and
the natural TDD target. Signature:

```js
classify(rawUrl) → { kind, platform, canonicalUrl }
```

- `kind` — `'channel' | 'track' | 'unsupported'`
- `platform` — `'youtube' | 'soundcloud' | null` (null when the host isn't ours)
- `canonicalUrl` — the canonical form per
  [the URI contract §3](specs/djcrate-uri-v1.md#3-canonical-url-forms), or
  `null` when `kind` is `unsupported`

It is **total**: any input string, including garbage and `null`, returns a
result object. It never throws.

### 4.1 YouTube

Accepted hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`,
`music.youtube.com`, `youtu.be`. All normalise to `www.youtube.com`.

| Input shape | Result |
|---|---|
| `/@handle` | channel |
| `/channel/UC…` | channel |
| `/c/<name>` | channel |
| `/user/<name>` | channel |
| any of the above + a tab suffix (`/videos`, `/shorts`, `/streams`, `/playlists`, `/community`, `/about`, `/featured`, `/releases`, `/podcasts`, `/store`, `/search`) | channel, suffix stripped |
| `/watch?v=<id>` | track |
| `/shorts/<id>` | track, canonicalised to `watch?v=<id>` |
| `/live/<id>` | track, canonicalised to `watch?v=<id>` |
| `youtu.be/<id>` | track, canonicalised to `watch?v=<id>` |
| `/playlist?list=…`, `/results`, `/feed/…`, bare `/` | unsupported |

Ordering matters: `/@handle/shorts` is a channel tab, `/shorts/<id>` is a
track. Channel prefixes are tested first.

### 4.2 SoundCloud

Accepted hosts: `soundcloud.com`, `www.soundcloud.com`, `m.soundcloud.com`.
All normalise to `soundcloud.com`.

| Input shape | Result |
|---|---|
| `/<artist>` — one segment, not reserved | channel |
| `/<artist>/<sub-page>` where sub-page is `tracks`, `albums`, `sets`… no — see below | |
| `/<artist>/<track>` — two segments, second not reserved | track |
| `/<artist>/sets/<name>` | unsupported (playlist) |
| `/discover`, `/search`, `/stream`, `/you/…`, other reserved roots | unsupported |

Reserved first segments (not artists): `discover`, `search`, `stream`, `upload`,
`you`, `settings`, `notifications`, `messages`, `charts`, `feed`, `library`,
`tags`, `people`, `groups`, `pages`, `jobs`, `imprint`, `popular`, `terms`,
`privacy`, `legal`, `mobile`, `pro`, `premium`, `creators`, `help`, `login`,
`signin`, `logout`, `dashboard`, `embed`, `oembed`, `stations`, `station`.

### 4.3 Two additions beyond the brainstormed list

Both are small extrapolations of decisions already made. **Flagged here for
confirmation rather than slipped in silently.**

1. **`youtu.be/<id>` and `/live/<id>` classify as tracks.** The brainstorm listed
   only `/watch?v=` and `/shorts/`. Share links from the YouTube UI are
   `youtu.be`, so a right-click on one from a chat or search result is a very
   likely path. Both canonicalise to `watch?v=`, so nothing downstream changes.
2. **SoundCloud artist sub-pages strip to the channel.** `/<artist>/tracks`,
   `/likes`, `/reposts`, `/albums`, `/playlists`, `/comments`, `/following`,
   `/followers`, `/popular-tracks`, `/spotlight` resolve to
   `https://soundcloud.com/<artist>` as a **channel**. This is the exact analogue
   of stripping YouTube's `/videos` tab suffix, which the approved design already
   does. Without it, a user on `soundcloud.com/someartist/tracks` would see the
   button disabled for no visible reason.

   `/sets/` remains unsupported — it is a playlist, and §8 puts playlists out of
   scope.

If either is unwanted, the classifier tests are the only thing that changes.

## 5. Trigger surfaces

All three were chosen.

### 5.1 Toolbar button

Icon is colored on a supported page, gray otherwise. Click opens a small popup
showing:

- the page title
- what was detected — "YouTube channel", "SoundCloud track"
- one send button — **"Add channel to Watch List"** or **"Download this track"**
- sent-state if known ("Sent ✓ · 2 days ago")
- a "CrateBuilder didn't open?" help link (§7)
- a "Sent history" link (§6)

Popup rather than direct-send **so the user always sees what they are about to
send** before the browser's external-protocol dialog appears.

### 5.2 Context menu

Two entries, shown only when relevant:

- on a supported **page**: "Send [channel/track] to DJ-CrateBuilder"
- on a **link** to a supported URL: the same, for the link target — so a channel
  can be sent from a search-results page without visiting it

### 5.3 In-page button

A content script on the two sites only. On channel pages a small
"+ CrateBuilder" button near subscribe/follow; on track pages near the
like/share cluster. Position comes from a per-site adapter.

**Documented fallback, and it is a requirement not a nicety:** if a site
redesign breaks the anchor selector, the button **docks to a fixed page corner
rather than vanishing silently**. A silently-missing button reads as "the
extension is broken" and is the failure mode most likely to waste an afternoon.

## 6. Sent-memory

`chrome.storage.local`, keyed by canonical URL, storing
`{ kind, platform, sentAt }`.

Because Phase 1 is one-way, the label is honestly **"Sent ✓"** — never "Added".
The extension knows it dispatched the URI; it does not know the app acted on it.
Badge and in-page button reflect it on revisit.

The popup's "Sent history" link lists the last ~50 sends with a clear-all.

When Phase 2 lands, native-messaging replies overwrite these entries with real
app state ("In your watchlist ✓") and the same UI upgrades in place — which is
why the record is keyed by canonical URL rather than by send event.

## 7. Errors

**Handler not registered** → nothing opens, and one-way transport means the
extension *cannot detect this*. Do not fake detection with a timeout; that
produces false alarms on a slow app launch.

Instead the popup carries a "CrateBuilder didn't open?" link to a short help
note pointing at the app's Settings toggle. **Educate rather than pretend to
detect.**

## 8. Scope boundaries

- **Playlists and SoundCloud sets are out of scope for Phase 1.** The Watch List
  is channel-based and the download flow is per-track; playlists would need
  app-side handling that doesn't exist. Deliberate YAGNI — revisit only if
  actually missed.
- **Chrome (unpacked) and Firefox (self-hosted signed) only.** Edge was
  explicitly declined even though it would load unchanged.
- **No bookmarklet.** The research suggests one as a fallback; it was declined.
  Don't ship it unasked.

## 9. Cross-browser build

One source tree, two manifests. `src/manifest.chrome.json` and
`src/manifest.firefox.json`; `scripts/build.mjs` assembles a per-browser zip
into `dist/`.

Firefox differences: `browser_specific_settings` (extension ID + minimum
version), `background.scripts` as an event page rather than Chrome's
`service_worker`. The `djcrate://` side is identical — Firefox shows its own
one-time "always allow" dialog.

## 10. App-side receive (work in the main DJ-CrateBuilder repo)

Recorded here because the contract spans both repos. The implementation lands
there, under that repo's house rules.

- **Settings tab** gains a "Browser integration" row: a register/unregister
  toggle for the handler (writes `HKCU\Software\Classes\djcrate`, mirroring the
  `cratebuilder/startup.py` pattern — exe path when frozen, `pythonw.exe <script>`
  from source; `.desktop` `MimeType` on Linux), plus a receive-mode radio:
  **"Bring window forward" (default)** or **"Collect quietly"**.
- **Window-up mode:** `kind=channel` opens the existing add-channel dialog with
  the URL prefilled (the user picks genre there — the browser can't know it);
  `kind=track` opens the existing single-download flow prefilled.
- **Quiet inbox:** pending sends persist in the DB so they survive restarts
  (**`SCHEMA_VERSION` bump plus a migration step in `_init_schema` — house rule**),
  tray notification on arrival, a visible count in the main window, and a per-row
  "process" action opening the same prefilled dialogs. A duplicate URL already
  pending is silently coalesced.
- All parsing and dispatch (URI parse, verb dispatch, inbox model) lands in
  `cratebuilder/` as pure Tk-free unit-testable code. Only the dialogs and the
  tray ping live in the monolith.

## 11. Testing

- **Extension:** the URL classifier gets unit tests in plain JS via `node --test`
  — no browser, no dependencies, runs in under a second. `npm test`.
- **App:** pure logic under the fast pytest lane (`python -m pytest -q -m "not gui"`),
  dialogs under the gui lane. Per that repo's rule, "done" for pure-logic changes
  requires the **full** `python -m pytest -q`.
- **Manual end-to-end check per browser** before calling any of it done: register
  the handler, load unpacked, send a channel and a track, with the app both
  running and closed.

## 12. Build order

Both plans are written and live in [specs/plans/](specs/plans/):

- [2026-08-23-phase1-extension.md](specs/plans/2026-08-23-phase1-extension.md) —
  this repo, 9 tasks.
- [2026-09-13-browser-integration-receive.md](specs/plans/2026-09-13-browser-integration-receive.md)
  — the app repo's half, 10 tasks, written against the app's v2.0 web UI
  (pywebview window over `web/`, driven by `cratebuilder/service.py`).
  Stored here because this repo owns the contract; copy it into the app repo
  when that work starts. Replaces the 2026-08-23 plan, which targeted the
  since-retired tkinter UI.

The two meet at extension Task 9 / app Task 10 — the shared end-to-end
checklist. The app side must reach at least its Task 8 (window-mode sends
open the prefilled dialogs) before extension Task 9 can run.

1. Classifier + tests *(done — the rest is not)*
2. Transport module + `djcrate://` URI builder
3. App-side: registry toggle, argv parse, widened socket protocol — the receive
   end has to exist before any surface can be verified end to end
4. Toolbar popup (the surface that proves the loop)
5. Sent-memory
6. Context menu
7. In-page button + per-site adapters
8. Firefox manifest + build script
9. App-side: quiet inbox
