# DJ-CrateBuilder Browser Extension

Sends YouTube and SoundCloud URLs from the browser to the
[DJ-CrateBuilder](https://github.com/Sintax/DJ-CrateBuilder) desktop app —
channels go to the app's Watch List, individual tracks to its download flow.
The extension itself never downloads anything: it classifies the page, builds a
`djcrate://` URI, and hands it to the OS. Everything else happens in the app.

**Status: pre-implementation scaffold.** The design is approved
([docs/SPEC.md](docs/SPEC.md)) and the URL classifier is implemented and
tested; the UI surfaces and transport are stubs awaiting the implementation
plan. Nothing here is loadable-and-useful yet.

## Why it's never on the Chrome Web Store

The Web Store prohibits extensions that *facilitate* downloading YouTube
content, so this extension is deliberately never submitted. Chrome loads it
unpacked via Developer Mode; Firefox gets a self-hosted signed build. Details
in the [feasibility research](docs/research/CrateBuilder_Extension_Research_20260821/report.md).

## Layout

```
docs/
  SPEC.md                     approved design spec — start here
  specs/djcrate-uri-v1.md     the djcrate:// wire contract (the whole API)
  HANDOFF.md                  how the design was reached
  research/                   feasibility study (4 architectures compared)
  help/didnt-open.md          user help: handler not registered
src/
  manifest.chrome.json        per-browser manifests; build picks one
  manifest.firefox.json
  lib/classifier.js           URL → {kind, platform, canonicalUrl}  ✅ implemented
  lib/transport.js            send(payload) seam — Phase 1: djcrate:// (stub)
  lib/sent-memory.js          "Sent ✓" records in chrome.storage.local (stub)
  background.js               context menus, icon state (stub)
  popup/                      toolbar popup (stub)
  content/inpage.js           in-page "+ CrateBuilder" button (stub)
scripts/build.mjs             assembles dist/<browser>/ + zip
tests/                        node:test suite, no dependencies
```

## Developing

Node ≥ 20, no dependencies.

```bash
npm test            # classifier unit tests (node --test)
npm run build       # dist/chrome/ + dist/firefox/ + zips
```

Load in Chrome: `chrome://extensions` → Developer Mode → **Load unpacked** →
pick `dist/chrome/`. The app side must have Browser integration enabled
(DJ-CrateBuilder → Settings) or `djcrate://` links go nowhere — see
[docs/help/didnt-open.md](docs/help/didnt-open.md).

### Firefox

`npm run build:firefox` produces `dist/djcratebuilder-firefox.zip`. For
day-to-day development use `about:debugging` → "Load Temporary Add-on"
(reverts on restart). For a permanent install, the zip must be signed:
upload it at https://addons.mozilla.org/developers/ as **unlisted**
(self-distribution), then install the signed `.xpi` it hands back.

## The two-repo shape

The wire contract [docs/specs/djcrate-uri-v1.md](docs/specs/djcrate-uri-v1.md)
is owned here and consumed by the app repo, which implements handler
registration, argv parsing, and the receive modes. Neither side extends the
format without editing that file first.

## License

MIT — see [LICENSE](LICENSE).
