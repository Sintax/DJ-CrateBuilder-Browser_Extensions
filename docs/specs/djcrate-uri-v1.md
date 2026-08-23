# `djcrate://` URI contract — v1

**Status:** approved, unimplemented
**Owned by:** this repo (`DJ-CrateBuilder-Browser_Extensions`)
**Consumed by:** this repo's transport module, and the main app repo
(`DJ-CrateBuilder`) argv parser + singleton socket listener

This is the entire API between the browser extension and the desktop app in
Phase 1. Both codebases cite this file; neither may extend the format without
editing it here first.

---

## 1. The URI

```
djcrate://add?v=1&kind=<kind>&url=<percent-encoded canonical URL>
```

`add` is the **verb**. `v`, `kind`, and `url` are all required; a URI missing
any of them is malformed and must be rejected, not guessed at.

| Parameter | Values | Notes |
|---|---|---|
| `v` | `1` | Contract version. Bumped only for a breaking change. |
| `kind` | `channel` \| `track` | What the app should do with the URL. |
| `url` | percent-encoded absolute `https://` URL | The **canonical** form produced by the classifier — see §3. |

Parameter order is not significant; receivers must parse by name. Unknown
extra parameters are ignored by a receiver of the same `v` (so a future
optional field is additive rather than breaking).

### Examples

```
djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fwww.youtube.com%2F%40someartist
djcrate://add?v=1&kind=track&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ
djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist
djcrate://add?v=1&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist%2Fsome-track
```

Note that the `?` and `=` inside the YouTube watch URL are themselves encoded
(`%3F`, `%3D`). Encoding the whole URL with `encodeURIComponent` is what
produces this and is the only correct way to build the parameter.

---

## 2. The socket payload

When the OS launches a second app instance to handle the URI and that
instance loses the singleton bind on `127.0.0.1:49737`, it forwards the URI
over the socket to the running instance, then exits.

The line it sends is the URI prefixed with the verb:

```
add djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist\n
```

Rules:

- **UTF-8, newline-terminated.** The existing `show` verb stays exactly as it
  is (bare `show`, no newline required) so old and new behaviour coexist.
- The listener's current fixed 16-byte read (`conn.recv(16)` in
  `cratebuilder/singleton.py`) **widens to a length-safe line read** — read
  until `\n` or a sane cap (8 KiB), then dispatch on the first token.
- Verb dispatch: `show` → restore window (unchanged); `add` → parse the
  remainder as a `djcrate://` URI and hand it to the receive layer.
- An unrecognised verb is ignored, not fatal.

---

## 3. Canonical URL forms

The extension classifier is the single producer of these. The app trusts the
shape but must still validate the scheme is `https:` and the host is one of
the four accepted hosts before acting.

| Platform | Kind | Canonical form |
|---|---|---|
| YouTube | channel | `https://www.youtube.com/@handle`<br>`https://www.youtube.com/channel/UC…`<br>`https://www.youtube.com/c/…`<br>`https://www.youtube.com/user/…` |
| YouTube | track | `https://www.youtube.com/watch?v=<id>` |
| SoundCloud | channel | `https://soundcloud.com/<artist>` |
| SoundCloud | track | `https://soundcloud.com/<artist>/<track>` |

Canonicalisation guarantees:

- Host is lowercased and normalised (`m.`, `music.`, and bare `youtube.com`
  all become `www.youtube.com`; `m.`/`www.` SoundCloud becomes
  `soundcloud.com`).
- **Path case is preserved.** YouTube video IDs and `UC…` channel IDs are
  case-sensitive; lowercasing them would break the URL.
- Channel tab suffixes are stripped (`/videos`, `/shorts`, `/streams`, …).
- All query parameters are dropped except YouTube's `v`. No `?si=`, no
  `&list=`, no `#fragment`.
- No trailing slash.

The canonical URL is also the **sent-memory key** in the extension and the
dedup key for the app's quiet inbox, which is why it has to be stable.

---

## 4. Version and error handling

The app is the only side that can report an error — Phase 1 is one-way, so
the extension never learns the outcome.

| Condition | App behaviour |
|---|---|
| `v` is absent, non-numeric, or `> 1` | Show: *"This send came from a newer version of the CrateBuilder extension — update DJ-CrateBuilder."* Do not guess. |
| `kind` not in {`channel`, `track`} | Same message. An unknown kind means a newer contract. |
| `url` absent, not `https:`, or host not accepted | Show a plain *"That link isn't a supported YouTube or SoundCloud URL"* — this is a bad send, not a version skew. |
| Verb is not `add` or `show` | Ignore silently. |

**A malformed URI must never crash the app or the listener thread.** Parsing
is pure and total: it returns a result object, it does not raise.

---

## 5. Forward compatibility with Phase 2

Phase 2 replaces the transport with native messaging, which is bidirectional.
The payload the extension sends becomes the JSON object
`{"v": 1, "action": "add", "kind": …, "url": …}` — the **same three fields**,
so the app-side parse and dispatch written for Phase 1 is reused directly. The
only new work is the reply channel.

Because of that, the app-side URI parse, verb dispatch, and inbox model all
land in `cratebuilder/` as pure, Tk-free, unit-testable code. Only the
prefilled dialogs and the tray notification live in the monolith.
