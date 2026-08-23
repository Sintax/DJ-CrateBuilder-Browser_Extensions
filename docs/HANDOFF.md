# Handoff — DJ-CrateBuilder Browser Extension

**Date:** 2026-08-23
**Status:** SUPERSEDED as of later that day — the repo is initialised, the design
below is written up as [SPEC.md](SPEC.md) + [specs/djcrate-uri-v1.md](specs/djcrate-uri-v1.md),
and the URL classifier is implemented with tests. This file remains as the record
of how the decisions were reached.
**Next step:** implementation plan (`superpowers:writing-plans`), then build-order
step 2 onward per SPEC §12.

---

## What this project is

A browser extension that sends YouTube and SoundCloud URLs from the browser to the
DJ-CrateBuilder desktop app — channels go to the app's Watch List, individual tracks go to
its download flow. It is a **separate project from the main DJ-CrateBuilder repo**, but the
work spans both: the extension lives here, the receiving side lands in the app repo at
`C:\Users\djsin\Documents\GitHub\DJ-CrateBuilder\`.

## Prior work — read this first

Feasibility research is complete and lives at:

`docs/research/CrateBuilder_Extension_Research_20260821/report.md` (source of truth;
`report.html` and a 6-page PDF are the same content, plus `sources.jsonl` and
`run_manifest.json`)

**Read `report.md` before doing anything.** It evaluates four architectures and explains why
Phase 1 is the `djcrate://` protocol handler. Do not re-litigate that analysis; the decisions
below build on it. The two constraints it surfaces that bound this project:

- The Chrome Web Store prohibits extensions that *facilitate* downloading YouTube content.
  This extension is never submitted to the store — Chrome loads it unpacked via Developer Mode.
- Chrome 142's Local Network Access gating is why the localhost-HTTP-bridge architecture was
  deferred rather than chosen. Don't reach for it.

## Design decisions (approved 2026-08-23)

These came out of a brainstorming session and exist **only in this document** — they are not
in the research report. The user approved Section 1 explicitly and then said "GO!" to
Sections 2–5 as presented.

### Architecture

Phase 1 as the research recommends — `djcrate://` custom protocol handler, one-way
browser→app — **but structured so Phase 2 (native messaging, bidirectional) slots in without
a rewrite.**

Two codebases, one contract between them:

- **This repo** — Manifest V3 extension for Chrome (unpacked) and Firefox (self-hosted
  signed), one source tree with a per-browser manifest. Contains three UI surfaces, a URL
  classifier, sent-memory, and a **transport module** with a `send(payload)` interface whose
  only Phase 1 implementation navigates to a `djcrate://` URI. Phase 2 adds a
  native-messaging implementation behind that same interface; UI code never learns which
  transport ran.
- **App repo** — Settings toggle registering the handler (HKCU `Software\Classes\djcrate`,
  mirroring the existing `cratebuilder/startup.py` pattern; `.desktop` MimeType on Linux),
  argv parsing at launch, the singleton socket protocol widened from bare `show` to versioned
  verbs, and two receive modes.

**Flow when the app is running:** click → `djcrate://` navigation → OS launches a second app
instance → it loses the singleton bind on port 49737, forwards `add <payload>` over the
socket, exits → running app receives, marshals to the Tk thread, acts.
**When the app is not running:** same start, but this instance wins the bind and processes the
payload once its UI is up (quiet-inbox mode still respected — it may start minimised to tray).

The extension never talks to yt-dlp, never downloads, and needs no host permissions beyond the
two music sites (and those only for the in-page button). Genre selection, metadata probing,
and dedup all stay in the app, where that machinery already exists.

### The wire contract

The URI is the whole API, versioned from day one:

```
djcrate://add?v=1&kind=channel&url=<urlencoded canonical URL>
djcrate://add?v=1&kind=track&url=<urlencoded canonical URL>
```

The socket payload the losing instance forwards is that same string prefixed: `add djcrate://…`.
The existing `show` verb stays as-is; the listener's current 16-byte read widens to a
length-safe line read. Unknown `v` or `kind` → the app says "This send came from a newer
extension — update CrateBuilder" rather than guessing. This format gets a short spec file in
this repo that both codebases cite.

### Extension surfaces

**URL classifier** — one pure module, the heart of the extension. Returns
`{kind: 'channel' | 'track' | 'unsupported', platform: 'youtube' | 'soundcloud', canonicalUrl}`:

- YouTube channel: `/@handle`, `/channel/UC…`, `/c/…`, `/user/…` (tab suffixes like `/videos` stripped)
- YouTube track: `/watch?v=…`, `/shorts/…` (canonicalised to `watch?v=`)
- SoundCloud channel: `soundcloud.com/<artist>` — one path segment, minus reserved words
  (`discover`, `search`, …)
- SoundCloud track: `soundcloud.com/<artist>/<track>` — two segments, excluding `/sets/`
- Playlists, sets, everything else → `unsupported`; surfaces stay disabled.

**Three trigger surfaces** (all three were chosen):

1. **Toolbar button** — icon colored on a supported page, gray otherwise. Click opens a small
   popup showing the page title, what was detected ("YouTube channel"), one send button
   ("Add channel to Watch List" / "Download this track"), and sent-state if known. Popup
   rather than direct-send so the user always sees what they're about to send.
2. **Context menu** — two entries, shown only when relevant: on a supported page, "Send
   [channel/track] to DJ-CrateBuilder"; on a *link* to a supported URL, the same for the link
   target, so a channel can be sent from a search-results page without visiting it.
3. **In-page button** — content script on the two sites only. On channel pages a small
   "+ CrateBuilder" button near subscribe/follow; on track pages near the like/share cluster.
   Positioned by a per-site adapter with a documented fallback: **if a site redesign breaks
   the anchor selector, the button docks to a fixed page corner rather than vanishing silently.**

**Sent-memory** — `chrome.storage.local`, keyed by canonical URL, storing
`{kind, platform, sentAt}`. Because Phase 1 is one-way, the label is honestly **"Sent ✓"**,
never "Added". Badge and in-page button reflect it on revisit. The popup gets a "Sent history"
link listing the last ~50 sends with a clear-all. When Phase 2 lands, native-messaging replies
overwrite these entries with real app state ("In your watchlist ✓") and the same UI upgrades
in place.

### App-side receive (work in the main DJ-CrateBuilder repo)

- **Settings tab** gains a "Browser integration" row: a register/unregister toggle for the
  handler (exe path when frozen, `pythonw.exe <script>` from source), plus a receive-mode
  radio — **"Bring window forward" (default)** or **"Collect quietly"**.
- **Window-up mode:** `kind=channel` opens the existing add-channel dialog with the URL
  prefilled (user picks genre there — the browser can't know it); `kind=track` opens the
  existing single-download flow prefilled.
- **Quiet inbox:** pending sends persist in the DB so they survive restarts (**schema bump
  plus a migration step in `_init_schema` — house rule, see app repo CLAUDE.md**), tray
  notification on arrival, a visible count in the main window, and a per-row "process" action
  opening the same prefilled dialogs. A duplicate URL already pending is silently coalesced.
- All parsing and dispatch (URI parse, verb dispatch, inbox model) lands in `cratebuilder/`
  as pure Tk-free unit-testable code. Only the dialogs and the tray ping live in the monolith.

### Scope boundaries

- **Playlists and SoundCloud sets are out of scope for Phase 1.** The Watch List is
  channel-based and the download flow is per-track; playlists would need app-side handling
  that doesn't exist. Deliberate YAGNI — revisit only if actually missed.
- **Browsers: Chrome (unpacked) and Firefox (self-hosted signed) only.** Edge was explicitly
  declined even though it would load unchanged. The bookmarklet fallback the research
  suggests was also declined — don't ship it unasked.
- Firefox needs `manifest.firefox.json` (adds `browser_specific_settings`, MV3 dialect
  differences) and a small build script assembling per-browser zips. The `djcrate://` side is
  identical; Firefox shows its own one-time "always allow" dialog.

### Errors and testing

- **Handler not registered** → nothing opens, and one-way transport means the extension
  cannot detect this. The popup therefore carries a "CrateBuilder didn't open?" link to a
  help note pointing at the Settings toggle. Educate rather than pretend to detect.
- **Extension tests:** the URL classifier gets unit tests in plain JS, no browser needed.
- **App tests:** pure logic under the fast pytest lane (`python -m pytest -q -m "not gui"`);
  dialogs under the gui lane. Manual end-to-end check per browser before calling it done.

## State of the workspace

- `C:\Users\djsin\Documents\GitHub\DJ-CrateBuilder-Browser_Extensions\` — **not a git repo
  yet.** Contains only `docs/` (this file and `docs/research/`). Renamed from the older
  `DJ-CrateBuild (Browser Extensions)` folder; any memory or note referring to the old name
  or to a research path under `research\` at the project root is stale — the bundle now sits
  under `docs/research/`.
- The main app repo is clean on `main` as of this session; **nothing about this feature has
  been written there.**

## Suggested skills

- **`superpowers:writing-plans`** — the intended next step. The design above is approved; it
  needs a spec written down and then a phased implementation plan. The brainstorming skill's
  own flow terminates by handing off to this one.
- **`superpowers:brainstorming`** — only if the next session wants to *reopen* a design
  question (e.g. the user changes their mind on playlists or Edge). Do not re-run it to
  re-derive what's already decided above.
- **`superpowers:test-driven-development`** — when implementation starts. The URL classifier
  and the app-side URI parser are both pure functions with obvious test tables; they are
  natural TDD targets.
- **`superpowers:using-git-worktrees`** — the app-side changes touch the singleton socket, the
  DB schema, and Settings. The main repo's CLAUDE.md asks for isolation on work of that shape.
- **`superpowers:verification-before-completion`** — before claiming any of this works. Note
  the app repo's standing rule: pure-logic changes need the **full** `python -m pytest -q`
  before "done", and UI changes need the app actually launched and looked at.

## Standing rules that apply to the app-side work

From the main repo's `CLAUDE.md` — these are not optional:

- Conventional Commits (`type(scope): subject`), direct-to-`main` for routine work.
- **Never push, tag, or open a PR without an explicit ask.** Committing freely is fine.
- **Never bump `APP_BUILD`** in feature work — the release script owns it. `APP_VERSION` stays `"1.3"`.
- **Never run `scripts/release.py` without an explicit ask.** Use `/build-update` when asked to ship.
- DB schema changes require a `SCHEMA_VERSION` bump plus a migration step in `_init_schema`.
- No tkinter imports inside `cratebuilder/` — it's a pure-logic, headless-testable boundary.
- Don't extract further code out of the monolith; the deep-modules pass is finished. New
  pure logic may go straight into `cratebuilder/`.