# Right-click actions: Add to batch / Download now

**Status:** design, awaiting review
**Date:** 2026-09-25
**Touches:** this repo (extension + wire contract) and `Sintax/DJ-CrateBuilder`
(receive side + web UI)

## In plain words

Right-clicking a YouTube video or SoundCloud track gives three choices:

1. **Add to batch**: the app asks which genre, then puts the track in the
   download queue. Nothing starts.
2. **Download now**: the app asks which genre, then queues the track and
   starts downloading. If a batch is already running, the track joins it and
   downloads when its turn comes.
3. **Send track to DJ-CrateBuilder**: same as today, the link lands in the
   app's link box.

Channels don't change: one choice, which opens **Add Channel**.

The app always comes to the front and always asks for the genre (the
browser doesn't know your genres). **Cancel** adds nothing. If **Collect
quietly** is on, the send waits in the Browser Inbox with its choice
remembered, and **Process** asks for the genre then.

Decisions already made with the user: always ask for the genre; keep the
plain send as a third choice; channels unchanged.

---

## 1. Wire contract: one optional parameter

`docs/specs/djcrate-uri-v1.md` gains an optional `then` parameter:

```
djcrate://add?v=1&kind=track&url=<…>&then=batch
djcrate://add?v=1&kind=track&url=<…>&then=download
```

| `then` | Meaning |
|---|---|
| absent | Today's behaviour: prefill the link box. |
| `batch` | Ask for a genre, add to the batch queue. |
| `download` | Ask for a genre, add to the batch queue, start downloading. |

Rules:

- **`v` stays 1.** The contract already says a receiver ignores unknown extra
  parameters, so an older app ignores `then` and prefills the link box. That
  fallback is safe.
- `then` is only meaningful with `kind=track`. With `kind=channel` it is
  ignored.
- An unrecognised `then` value is treated as absent (the link still arrives,
  as a plain prefill). It is not an error, because the link itself is valid.
- The Phase 2 JSON payload (§5) carries the same field as `"then"`.

## 2. Extension

**Menus.** Chrome and Firefox group an extension's items under a submenu
named after it once more than one is visible, so no explicit parent item is
needed.

| Item id | Context | Shown when | Title |
|---|---|---|---|
| `djcb-page` | page | on the two sites (existing; retitled per tab) | `Send track to DJ-CrateBuilder` / `Send channel to DJ-CrateBuilder` |
| `djcb-page-batch` | page | active tab is a track | `Add to batch` |
| `djcb-page-download` | page | active tab is a track | `Download now` |
| `djcb-link` | link | any link on the two sites (existing) | `Send link to DJ-CrateBuilder` |
| `djcb-link-batch` | link | link looks like a track (see below) | `Add to batch` |
| `djcb-link-download` | link | link looks like a track | `Download now` |

- Page items: `refreshTabUi` already classifies the active tab. It now also
  sets `visible` on the two new page items (true only for `kind === 'track'`).
- Link items: the menu can't classify a link before it opens, so the new link
  items use `targetUrlPatterns` for track-shaped links:
  - YouTube: `/watch*`, `/shorts/*`, `/live/*`, and `youtu.be/*`
  - SoundCloud: `soundcloud.com/*/*`
- The SoundCloud pattern also matches non-track pages (`/artist/sets/…`,
  `/artist/likes`). If the clicked link classifies as a channel, the action is
  dropped and it is sent as a plain send (Add Channel). If it is unsupported,
  the badge flashes ✗ as it does today.
- **Menu titles** live in `lib/ui-text.js` with the rest of the copy.
- **Send path:** `handleSend(rawUrl, tabId, then)` passes `then` through to
  `send({kind, url, then})` only when `kind === 'track'`. `buildUri` appends
  `&then=<value>` when present and rejects any value other than `batch` or
  `download`.
- **Sent-memory:** unchanged. Any successful send marks the URL "Sent ✓".
- The toolbar popup and the in-page button are unchanged.

## 3. App

**Parse** (`cratebuilder/browserlink.py`): `BrowserSend` gains
`then: str | None`, which is `'batch'`, `'download'` or `None`. It is only
set when `kind == 'track'`.

**Receive** (`service.browser_receive`): the send dict becomes
`{kind, url, then}` in window mode (live `browser.send` event and the parked
list).

**Quiet mode / inbox** (`db.py`):

- Schema **v9**: `ALTER TABLE browser_inbox ADD COLUMN then_action TEXT`.
  v8 hasn't shipped in a nightly yet, but it already exists in local
  databases, so this has to be a real migration rather than an edit to v8.
- `add_inbox_item(url, kind, then=None)`: a repeat send of the same URL still
  coalesces to one row, and its `then_action` becomes the newest choice.
- `list_inbox`, `get_inbox_item` and `browser_inbox_take` return `then`.

**Web UI** (`web/app.js`, `handleBrowserSend`):

- `kind === 'track'` with `then` set: switch to Downloads and open a
  **"Which genre?"** dialog. It contains the track URL (read-only), the genre
  picker (`genreSelect()`, including New Genre), **Cancel**, and a primary
  button labelled **Add to batch** or **Download now**.
- Confirm:
  1. Picking "(none)" goes through the existing `openNoGenreGate()`.
  2. `batch.add {url, genre, platform}`. The platform is detected from the URL
     the same way the Downloads form does it.
  3. For `download`, call `download.start` unless a batch is already running,
     in which case the added row joins the running batch (`batch_add` already
     does this). Tell the user: "Added — it will download when its turn
     comes."
  4. If a Watch List run blocks `download.start`, the track stays queued with
     a toast: "Added to batch — press Start once the Watch List run
     finishes."
- **Cancel** adds nothing and leaves the Downloads screen as it was.
- No `then`: today's prefill path is unchanged.
- **Inbox Process** hands the stored row, including `then`, to the same
  handler.

**Bring to front:** already fixed (`grant_foreground`, commit b4423d6).

## 4. Testing

- Extension (node:test): `buildUri` with and without `then`, and rejecting bad
  values; menu titles; `handleSend` dropping `then` for channels.
- App (pytest):
  - `parse_djcrate_uri` for each `then` case (absent, batch, download,
    unknown, on a channel).
  - `browser_receive` passing `then` through in both modes.
  - v8→v9 migration on an existing v8 database.
  - Inbox coalescing updating `then_action`.
  - `browser_inbox_take` returning `then`.
- App web tests (`tests/test_web_*_client.py`): static wiring for the genre
  dialog, plus a Node-harness run of the confirm path for batch vs download vs
  batch-running.
- Manual (user): the three choices in Chrome on a YouTube video, a SoundCloud
  track and a SoundCloud link, plus one quiet-mode send processed from the
  inbox.

## 5. Release order

1. App first: merge to `main` and cut a nightly. An app that understands
   `then` is harmless before any extension sends it.
2. Then the extension: bump to 0.2.0 and tag. An older app that gets `then`
   prefills the link box, so nothing breaks if someone updates the extension
   first.

## Out of scope

The toolbar popup and in-page button gaining the new choices; channel actions
("Download whole channel now"); Rumble support.
