# Phase 1 end-to-end checklist

Prereq: app built from the browser-integration branch, handler registered via
Settings → Browser integration, extension loaded (Chrome unpacked / Firefox
temporary).

## Run 1 — 2026-09-16 (implementation session)

The app side was exercised against the `feat/browser-integration` worktree by
launching `web_window.py` with a sandboxed home and issuing the same
`djcrate://` URIs the extension builds, from a second process — exactly what
the OS handler does once registered. The browser columns were **not run** in
this session: registering the handler writes the user's registry and would
point at a temporary worktree, and loading the unpacked extension needs the
user's browser. Those cells are for the user's pass.

| # | Scenario | App side (CLI send) | Chrome | Firefox |
|---|---|---|---|---|
| 1 | App running · popup-send a YouTube channel → add-channel dialog opens prefilled | PASS — window came forward on the Watch List, "+ Add Channel" open, URL filled | not run | not run |
| 2 | App running · popup-send a SoundCloud track → Downloads screen prefilled with track URL | PASS — Downloads screen, URL box filled, platform detected, genre focused | not run | not run |
| 3 | App closed · send a channel → app launches, dialog opens prefilled after UI up | see Run 2 below | not run | not run |
| 4 | Context menu on a channel page → same result as #1 | n/a (browser) | not run | not run |
| 5 | Context menu on a link to a channel (from search results page) → sends link target | n/a (browser) | not run | not run |
| 6 | In-page button on channel + track pages → sends, flips to "Sent ✓" | n/a (browser) | not run | not run |
| 7 | Receive mode "Collect quietly" → send lands in inbox, count visible, process opens dialog | PASS — no window change; Overview "Needs attention" row; Watch List "🌐 Browser Inbox (2)"; Process → Add Channel prefilled; Remove → empty, button hidden | not run | not run |
| 8 | Duplicate quiet send of same URL → coalesced, count unchanged | PASS — three sends (channel, track, channel again) → two rows, one "queued" notification per fresh URL | not run | not run |
| 9 | Handler NOT registered → nothing opens; popup help link explains | n/a (browser) | not run | not run |
| 10 | Popup sent-state + history reflect all of the above | n/a (browser) | not run | not run |

Also verified app-side: a `v=99` URI → warning toast + bell entry, no dialog
(contract §4); both themes for the Settings card and the inbox modal.

## Run 2 — cold start (app closed) — 2026-09-16

Same sandbox as Run 1, app process fully stopped before each launch, URI
passed on the command line exactly as the OS handler would.

| Scenario | Result |
|---|---|
| Window mode · `kind=channel` with the app closed | PASS — window visible in ~4 s, "+ Add Channel" open on the Watch List with the URL prefilled, no duplicate dialog |
| Window mode · burst of two sends before the UI is up | PASS — one dialog opens for the first send; the second lands in the Browser Inbox with a "Browser sends queued — 1 more send …" notice, and the handed-over URL is not also left in the inbox |
| Quiet mode · `kind=channel` with the app closed | PASS — window opens normally (no dialog), "Browser send queued" notice, inbox count +1, Watch List button "🌐 Browser Inbox (n)". One earlier attempt showed the window hidden with the burst-style notice instead; an instrumented re-run could not reproduce it and the trace was clean, so it is attributed to a leftover instance from the previous test still holding the port |
| Restart after quiet sends | PASS — inbox rows and count survive a restart |

Not covered by either run — for the user's own pass:

- Ticking "Register djcrate:// handler" in Settings (writes the user's
  registry; from a worktree it would point at a temporary path).
- The browser columns of Run 1 (extension loaded in Chrome / Firefox). Commit
  `7fc7ee3` says "verify" in its subject; no Firefox load actually happened
  in this session — only the manifest/README review.
- Linux `.desktop` registration.
