# Browser Integration (Receive Side) Implementation Plan

> **Where this executes:** the work in this plan lands in the **main app repo**,
> `C:\Users\djsin\Documents\GitHub\DJ-CrateBuilder\`. The plan is *stored* here
> because this repo owns the wire contract and SPEC §10 already records the
> app-side design. Copy it to that repo's `docs/specs/plans/` when the work
> begins, per its convention.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per the app repo's CLAUDE.md, execute in an isolated worktree (superpowers:using-git-worktrees) — this touches the singleton socket, the DB schema, and Settings.

**Goal:** The app receives `djcrate://` sends from the browser extension — registering the handler, parsing the URI, and acting on it in either "bring window forward" or "collect quietly" mode.

**Architecture:** All new parsing/dispatch logic lands in `cratebuilder/` as pure, Tk-free modules (`browserlink.py`, `protocolreg.py`, widened `singleton.py`, inbox methods on `DownloadsDatabase`). The monolith gains only thin wiring: argv handling at the entry point, one `_handle_djcrate_send` dispatcher, prefill support on the existing Add Channel dialog, a Settings row, and an inbox viewer.

**Tech Stack:** Python 3.10+, stdlib only (winreg, socket, sqlite3), pytest.

**Spec:** The send-side repo owns the contract — read both before starting:
`DJ-CrateBuilder-Browser_Extensions/docs/SPEC.md` (§10 is this plan's scope) and
`DJ-CrateBuilder-Browser_Extensions/docs/specs/djcrate-uri-v1.md` (the wire contract; §2 socket payload, §4 error handling).

## Global Constraints (from the app repo's CLAUDE.md — not optional)

- Work in a **worktree**, branch `feat/browser-integration`.
- Conventional Commits. **Never push, tag, or open a PR without an explicit ask.**
- **Never bump `APP_BUILD` or `APP_VERSION`**; never run `scripts/release.py`.
- **No tkinter imports in `cratebuilder/`.**
- DB schema change = `SCHEMA_VERSION` bump + migration step in `_init_schema`.
- Iterate with `python -m pytest -q -m "not gui"` (~8s); "done" for the branch requires the **full** `python -m pytest -q` plus launching the app to eyeball UI changes.
- Match house style: one-line module docstrings in `cratebuilder/`, multi-line docstrings + `# ══════` section dividers in the monolith, no new comments unless the *why* is non-obvious.
- Line references below are anchors against `main` as of 2026-08-23 (`DJ-CrateBuilder_v1.3.py` ~14,265 lines). Each edit quotes the surrounding code — re-locate by the quote if the file has drifted.

---

### Task 1: `cratebuilder/browserlink.py` — URI parsing

**Files:**
- Create: `cratebuilder/browserlink.py`
- Test: `tests/test_browserlink.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `parse_djcrate_uri(uri) → BrowserSend | ParseError`.
  `BrowserSend` is a frozen dataclass `{kind: str, url: str}` (kind ∈ `'channel'|'track'`, url = decoded canonical https URL).
  `ParseError` is a frozen dataclass `{reason: str, message: str}` with reason ∈ `'newer' | 'bad_url' | 'ignore'`; `message` is user-facing text, empty for `'ignore'`.
  Module constants `MSG_NEWER`, `MSG_BAD_URL` (Task 5 shows them in messageboxes).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_browserlink.py
"""Tests for djcrate:// URI parsing (wire contract v1)."""
from cratebuilder.browserlink import (
    parse_djcrate_uri, BrowserSend, ParseError, MSG_NEWER, MSG_BAD_URL)


def test_valid_channel_uri():
    r = parse_djcrate_uri(
        "djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist")
    assert r == BrowserSend(kind="channel", url="https://soundcloud.com/someartist")


def test_valid_track_uri_with_encoded_query():
    r = parse_djcrate_uri(
        "djcrate://add?v=1&kind=track&url="
        "https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ")
    assert r == BrowserSend(
        kind="track", url="https://www.youtube.com/watch?v=dQw4w9WgXcQ")


def test_parameter_order_is_not_significant():
    r = parse_djcrate_uri(
        "djcrate://add?url=https%3A%2F%2Fsoundcloud.com%2Fa&kind=channel&v=1")
    assert isinstance(r, BrowserSend)


def test_unknown_extra_parameters_are_ignored():
    r = parse_djcrate_uri(
        "djcrate://add?v=1&kind=track&extra=x&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb")
    assert isinstance(r, BrowserSend)


def test_newer_version_and_unknown_kind_get_the_update_message():
    for uri in (
        "djcrate://add?v=2&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fa",
        "djcrate://add?kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fa",   # v absent
        "djcrate://add?v=1&kind=playlist&url=https%3A%2F%2Fsoundcloud.com%2Fa",
        "djcrate://add?v=1&url=https%3A%2F%2Fsoundcloud.com%2Fa",            # kind absent
    ):
        r = parse_djcrate_uri(uri)
        assert r == ParseError(reason="newer", message=MSG_NEWER), uri


def test_bad_urls_get_the_unsupported_message():
    for uri in (
        "djcrate://add?v=1&kind=track",                                       # url absent
        "djcrate://add?v=1&kind=track&url=",                                  # url empty
        "djcrate://add?v=1&kind=track&url=http%3A%2F%2Fsoundcloud.com%2Fa",   # not https
        "djcrate://add?v=1&kind=track&url=https%3A%2F%2Fevil.example%2Fa",    # bad host
    ):
        r = parse_djcrate_uri(uri)
        assert r == ParseError(reason="bad_url", message=MSG_BAD_URL), uri


def test_non_add_verbs_and_junk_are_silently_ignored():
    for uri in (
        "djcrate://frobnicate?v=1",
        "https://soundcloud.com/a",       # not djcrate at all
        "show",
        "",
        None,
        12345,
    ):
        r = parse_djcrate_uri(uri)
        assert r == ParseError(reason="ignore", message=""), repr(uri)


def test_never_raises_on_garbage():
    parse_djcrate_uri("djcrate://add?%%%bad=encoding%")
    parse_djcrate_uri("djcrate://" + "x" * 100_000)
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_browserlink.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'cratebuilder.browserlink'`.

- [ ] **Step 3: Implement**

```python
# cratebuilder/browserlink.py
"""djcrate:// URI parsing for browser-extension sends (Tk-free).

Wire contract: the extension repo's docs/specs/djcrate-uri-v1.md. Parsing is
total — any input returns a result object, never an exception — because a
malformed URI must never take down the singleton listener thread.
"""
from dataclasses import dataclass
from urllib.parse import urlsplit, parse_qs

ACCEPTED_HOSTS = {"www.youtube.com", "soundcloud.com"}

MSG_NEWER = ("This send came from a newer version of the CrateBuilder "
             "extension — update DJ-CrateBuilder.")
MSG_BAD_URL = "That link isn't a supported YouTube or SoundCloud URL."


@dataclass(frozen=True)
class BrowserSend:
    kind: str   # 'channel' | 'track'
    url: str    # decoded canonical https URL


@dataclass(frozen=True)
class ParseError:
    reason: str    # 'newer' | 'bad_url' | 'ignore'
    message: str   # user-facing text; '' when reason == 'ignore'


def parse_djcrate_uri(uri):
    """Parse a djcrate:// URI into a BrowserSend, or a ParseError saying how
    to react: 'newer' and 'bad_url' carry a message to show the user,
    'ignore' means drop it silently (wrong scheme or verb — not ours)."""
    try:
        if not isinstance(uri, str):
            return ParseError("ignore", "")
        split = urlsplit(uri.strip())
        if split.scheme != "djcrate" or split.netloc != "add":
            return ParseError("ignore", "")
        params = parse_qs(split.query)
        version = params.get("v", [None])[0]
        kind = params.get("kind", [None])[0]
        if version != "1" or kind not in ("channel", "track"):
            return ParseError("newer", MSG_NEWER)
        url = params.get("url", [None])[0]
        if not url:
            return ParseError("bad_url", MSG_BAD_URL)
        target = urlsplit(url)
        if target.scheme != "https" or target.hostname not in ACCEPTED_HOSTS:
            return ParseError("bad_url", MSG_BAD_URL)
        return BrowserSend(kind=kind, url=url)
    except Exception:
        return ParseError("ignore", "")
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_browserlink.py -q` then `python -m pytest -q -m "not gui"`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/browserlink.py tests/test_browserlink.py
git commit -m "feat(browserlink): parse djcrate:// URIs per wire contract v1"
```

---

### Task 2: Widen the singleton socket protocol

**Files:**
- Modify: `cratebuilder/singleton.py`
- Test: `tests/test_singleton.py` (append; the existing seven tests must keep passing unchanged)

**Interfaces:**
- Consumes: nothing.
- Produces: `forward_add(port, uri, timeout=0.5)`;
  `listen_for_requests(sock, on_show, on_add=None)` dispatching `show` → `on_show()` and `add <uri>` → `on_add(uri)`;
  `listen_for_show_requests(sock, on_show)` kept as a back-compat wrapper (existing tests and the monolith call it until Task 4 swaps the call site).
  Wire behaviour per contract §2: newline-terminated UTF-8 line, 8 KiB cap, unknown verbs ignored, and **a bare/empty connection still means `show`** — preserving today's behaviour where any connection restores the window.

- [ ] **Step 1: Append the failing tests to `tests/test_singleton.py`**

```python
from cratebuilder.singleton import forward_add, listen_for_requests


def test_forward_add_delivers_uri_to_on_add():
    port = _free_port()
    holder = acquire_single_instance(port)
    assert holder is not None
    try:
        got = []
        event = threading.Event()
        listen_for_requests(holder, on_show=event.set,
                            on_add=lambda u: (got.append(u), event.set()))
        uri = "djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fa"
        forward_add(port, uri)
        assert event.wait(timeout=2)
        assert got == [uri]
    finally:
        holder.close()


def test_show_still_dispatches_to_on_show_not_on_add():
    port = _free_port()
    holder = acquire_single_instance(port)
    assert holder is not None
    try:
        shown = threading.Event()
        added = []
        listen_for_requests(holder, on_show=shown.set, on_add=added.append)
        request_show(port)
        assert shown.wait(timeout=2)
        assert added == []
    finally:
        holder.close()


def test_add_without_on_add_handler_is_ignored_not_fatal():
    port = _free_port()
    holder = acquire_single_instance(port)
    assert holder is not None
    try:
        shown = threading.Event()
        listen_for_requests(holder, on_show=shown.set)   # no on_add
        forward_add(port, "djcrate://add?v=1")
        request_show(port)                               # listener must survive
        assert shown.wait(timeout=2)
    finally:
        holder.close()


def test_oversized_line_is_capped_and_does_not_kill_listener():
    port = _free_port()
    holder = acquire_single_instance(port)
    assert holder is not None
    try:
        got = []
        event = threading.Event()
        listen_for_requests(holder, on_show=lambda: None,
                            on_add=lambda u: (got.append(u), event.set()))
        with socket.create_connection(("127.0.0.1", port), timeout=1) as s:
            s.sendall(b"add " + b"x" * 20000 + b"\n")
        forward_add(port, "djcrate://ok")
        assert event.wait(timeout=2)
        assert got[-1] == "djcrate://ok"
    finally:
        holder.close()


def test_forward_add_is_a_noop_when_nothing_is_listening():
    port = _free_port()
    forward_add(port, "djcrate://add?v=1", timeout=0.2)   # must not raise
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_singleton.py -q`
Expected: FAIL — `ImportError: cannot import name 'forward_add'`.

- [ ] **Step 3: Edit `cratebuilder/singleton.py`.** Keep the module docstring, `SINGLE_INSTANCE_PORT`, `acquire_single_instance`, and `request_show` exactly as they are. Replace the existing `listen_for_show_requests` function with these four:

```python
def forward_add(port, uri, timeout=0.5):
    """Relay a djcrate:// URI to the already-running instance holding *port*.

    Best-effort like request_show: called by a second launch that lost the
    bind race while carrying a protocol-handler argument. Wire format per the
    extension repo's docs/specs/djcrate-uri-v1.md §2: 'add <uri>\\n', UTF-8.
    """
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout) as s:
            s.sendall(b"add " + uri.encode("utf-8") + b"\n")
    except OSError:
        pass


def _read_line(conn, cap=8192):
    """Read one newline-terminated line (or until EOF/cap) from *conn*.

    Replaces the old fixed conn.recv(16): the 'add' verb carries a URI that
    doesn't fit in 16 bytes. The cap stops a hostile local writer growing the
    buffer without bound; the timeout stops a silent connection parking the
    listener thread forever.
    """
    chunks, total = [], 0
    conn.settimeout(1.0)
    try:
        while total < cap:
            data = conn.recv(1024)
            if not data:
                break
            chunks.append(data)
            total += len(data)
            if b"\n" in data:
                break
    except OSError:
        pass
    return b"".join(chunks).split(b"\n", 1)[0].decode("utf-8", "replace").strip()


def listen_for_requests(sock, on_show, on_add=None):
    """Run on a daemon thread, dispatching one verb per connection accepted on
    *sock*: 'show' (or a bare/legacy connection) calls on_show(); 'add <uri>'
    calls on_add(uri) when a handler was given. Unknown verbs are ignored.
    Callbacks must marshal to the UI thread themselves (this thread is not the
    Tk main thread). Returns once *sock* is closed.
    """
    def _loop():
        while True:
            try:
                conn, _addr = sock.accept()
            except OSError:
                return
            try:
                line = _read_line(conn)
            finally:
                conn.close()
            if line.startswith("add "):
                if on_add is not None:
                    on_add(line[4:].strip())
            elif line == "show" or not line:
                on_show()
            # anything else: unknown verb, ignore (contract §4)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t


def listen_for_show_requests(sock, on_show):
    """Back-compat alias from the two-verb widening; new callers should use
    listen_for_requests."""
    return listen_for_requests(sock, on_show)
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_singleton.py -q` (12 tests) then `python -m pytest -q -m "not gui"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/singleton.py tests/test_singleton.py
git commit -m "feat(singleton): widen socket protocol to show/add verbs"
```

---

### Task 3: `cratebuilder/protocolreg.py` — handler registration

**Files:**
- Create: `cratebuilder/protocolreg.py`
- Test: `tests/test_protocolreg.py`
- Modify: the Linux `.desktop` entry under `packaging/deb/`

**Interfaces:**
- Consumes: nothing.
- Produces: `protocol_is_registered() → bool`, `register_protocol() → bool`, `unregister_protocol() → bool`. All degrade gracefully (False / no-op) off-Windows or on registry error, mirroring `cratebuilder/startup.py`.

- [ ] **Step 1: Write the failing tests.** A dict-backed fake `winreg` — real HKCU writes in a test would pollute the developer's registry.

```python
# tests/test_protocolreg.py
"""Tests for djcrate:// protocol registration (fake winreg — no real HKCU)."""
import cratebuilder.protocolreg as pr


class FakeKey:
    def __init__(self, store, path):
        self.store, self.path = store, path


class FakeWinreg:
    """Dict-backed winreg: {key_path: {value_name: value}}."""
    HKEY_CURRENT_USER = object()
    KEY_READ = 1
    KEY_SET_VALUE = 2
    REG_SZ = 1

    def __init__(self):
        self.keys = {}

    def CreateKey(self, root, path):
        self.keys.setdefault(path, {})
        return FakeKey(self.keys, path)

    def OpenKey(self, root, path, reserved=0, access=0):
        if path not in self.keys:
            raise FileNotFoundError(path)
        return FakeKey(self.keys, path)

    def SetValueEx(self, key, name, reserved, vtype, value):
        self.keys[key.path][name] = value

    def QueryValueEx(self, key, name):
        try:
            return (self.keys[key.path][name], self.REG_SZ)
        except KeyError:
            raise FileNotFoundError(name)

    def DeleteKey(self, root, path):
        if path not in self.keys:
            raise FileNotFoundError(path)
        if any(k != path and k.startswith(path + "\\") for k in self.keys):
            raise OSError("subkeys exist")
        del self.keys[path]

    def CloseKey(self, key):
        pass


def _with_fake(monkeypatch):
    fake = FakeWinreg()
    monkeypatch.setattr(pr, "winreg", fake)
    return fake


def test_register_writes_the_class_tree(monkeypatch):
    fake = _with_fake(monkeypatch)
    assert pr.register_protocol() is True
    root = fake.keys[r"Software\Classes\djcrate"]
    assert root[""] == "URL:DJ-CrateBuilder Protocol"
    assert root["URL Protocol"] == ""
    cmd = fake.keys[r"Software\Classes\djcrate\shell\open\command"][""]
    assert cmd.startswith('"')
    assert cmd.endswith('"%1"')


def test_is_registered_reflects_state(monkeypatch):
    _with_fake(monkeypatch)
    assert pr.protocol_is_registered() is False
    pr.register_protocol()
    assert pr.protocol_is_registered() is True


def test_unregister_removes_everything(monkeypatch):
    fake = _with_fake(monkeypatch)
    pr.register_protocol()
    assert pr.unregister_protocol() is True
    assert r"Software\Classes\djcrate" not in fake.keys
    assert pr.protocol_is_registered() is False


def test_unregister_when_absent_is_ok(monkeypatch):
    _with_fake(monkeypatch)
    assert pr.unregister_protocol() is True


def test_everything_degrades_off_windows(monkeypatch):
    monkeypatch.setattr(pr, "winreg", None)
    assert pr.protocol_is_registered() is False
    assert pr.register_protocol() is False
    assert pr.unregister_protocol() is False
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_protocolreg.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'cratebuilder.protocolreg'`.

- [ ] **Step 3: Implement**

```python
# cratebuilder/protocolreg.py
"""Windows djcrate:// protocol registration via HKCU Software\\Classes.

Mirrors startup.py's degrade-gracefully pattern: every function returns False
or no-ops off-Windows and on registry error. Per-user, no admin rights.
Wire contract: the extension repo's docs/specs/djcrate-uri-v1.md.
"""
import os
import sys

try:
    import winreg  # Windows only
except ImportError:  # pragma: no cover
    winreg = None

_CLASS_KEY = r"Software\Classes\djcrate"
_COMMAND_KEY = _CLASS_KEY + r"\shell\open\command"


def _handler_command():
    """Quoted command Windows should run for a djcrate:// navigation."""
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" "%1"'
    exe = sys.executable
    pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
    runner = pyw if os.path.exists(pyw) else exe
    script = os.path.abspath(sys.argv[0])
    return f'"{runner}" "{script}" "%1"'


def protocol_is_registered():
    if winreg is None:
        return False
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _COMMAND_KEY, 0,
                             winreg.KEY_READ)
        try:
            winreg.QueryValueEx(key, "")
            return True
        finally:
            winreg.CloseKey(key)
    except (FileNotFoundError, OSError):
        return False


def register_protocol():
    """Write the class tree. Returns True on success. Re-registering is the
    supported way to refresh a stale path after the app moves."""
    if winreg is None:
        return False
    try:
        root = winreg.CreateKey(winreg.HKEY_CURRENT_USER, _CLASS_KEY)
        winreg.SetValueEx(root, "", 0, winreg.REG_SZ,
                          "URL:DJ-CrateBuilder Protocol")
        winreg.SetValueEx(root, "URL Protocol", 0, winreg.REG_SZ, "")
        winreg.CloseKey(root)
        cmd = winreg.CreateKey(winreg.HKEY_CURRENT_USER, _COMMAND_KEY)
        winreg.SetValueEx(cmd, "", 0, winreg.REG_SZ, _handler_command())
        winreg.CloseKey(cmd)
        return True
    except OSError:
        return False


def unregister_protocol():
    """Delete the class tree leaf-first (winreg has no recursive delete).
    Returns True when gone, including when it was never there."""
    if winreg is None:
        return False
    for path in (_COMMAND_KEY,
                 _CLASS_KEY + r"\shell\open",
                 _CLASS_KEY + r"\shell",
                 _CLASS_KEY):
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
        except FileNotFoundError:
            pass
        except OSError:
            return False
    return True
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_protocolreg.py -q` then `python -m pytest -q -m "not gui"`
Expected: PASS.

- [ ] **Step 5: Linux `.desktop` MimeType.** In `packaging/deb/`, locate the `.desktop` file (or the heredoc in `build-deb.sh` that generates it) and add this line to its `[Desktop Entry]` section:

```
MimeType=x-scheme-handler/djcrate;
```

This is build-time only and **cannot be verified from Windows.** Say so in the commit body — do not claim it works.

- [ ] **Step 6: Commit**

```bash
git add cratebuilder/protocolreg.py tests/test_protocolreg.py packaging/deb/
git commit -m "feat(protocolreg): per-user djcrate:// handler registration

Linux .desktop MimeType added but unverified — no Linux box in this session."
```

---

### Task 4: Entry-point argv handling + listener swap (monolith)

**Files:**
- Modify: `DJ-CrateBuilder_v1.3.py` — the singleton import (~line 54) and the entry block (~lines 14230-14256)

**Interfaces:**
- Consumes: `forward_add`, `listen_for_requests` (Task 2).
- Produces: calls `app._handle_djcrate_send(uri)` — defined in Task 5. **Tasks 4 and 5 are one commit**: the file will not import cleanly between them, so do Task 5 immediately after and run tests only at the end of Task 5.

- [ ] **Step 1: Update the import.** Current code at lines 54-56:

```python
from cratebuilder.singleton import (
    acquire_single_instance, request_show, listen_for_show_requests,
    SINGLE_INSTANCE_PORT)
```

Replace with:

```python
from cratebuilder.singleton import (
    acquire_single_instance, request_show, forward_add,
    listen_for_requests, SINGLE_INSTANCE_PORT)
```

- [ ] **Step 2: Widen the second-launch path.** Current code at lines 14239-14242:

```python
    _instance_lock = acquire_single_instance(SINGLE_INSTANCE_PORT)
    if _instance_lock is None:
        request_show(SINGLE_INSTANCE_PORT)
        sys.exit(0)
```

Replace with:

```python
    _djcrate_uri = next(
        (a for a in sys.argv[1:] if a.startswith("djcrate://")), None)
    _instance_lock = acquire_single_instance(SINGLE_INSTANCE_PORT)
    if _instance_lock is None:
        if _djcrate_uri:
            forward_add(SINGLE_INSTANCE_PORT, _djcrate_uri)
        else:
            request_show(SINGLE_INSTANCE_PORT)
        sys.exit(0)
```

Add one sentence to the existing comment block above it, in its voice: a launch carrying a `djcrate://` argument forwards the payload instead of asking for a window restore.

- [ ] **Step 3: Swap the listener and handle a winner's own URI.** Current code at lines 14255-14256:

```python
    listen_for_show_requests(
        _instance_lock, lambda: app.after(0, app._show_from_tray))
```

Replace with:

```python
    listen_for_requests(
        _instance_lock,
        on_show=lambda: app.after(0, app._show_from_tray),
        on_add=lambda uri: app.after(0, app._handle_djcrate_send, uri))
    if _djcrate_uri:
        # This launch WAS the protocol-handler invocation and won the bind:
        # act on the payload once the UI has settled. Quiet-inbox mode is
        # still respected — _handle_djcrate_send decides whether to surface.
        app.after(1500, app._handle_djcrate_send, _djcrate_uri)
```

- [ ] **Step 4: Do not run tests or commit yet.** Proceed directly to Task 5.

---

### Task 5: `_handle_djcrate_send` + Add Channel dialog prefill (monolith)

**Files:**
- Modify: `cratebuilder/settings.py:16-59` (schema key); `DJ-CrateBuilder_v1.3.py` — cratebuilder imports (~line 54 region), new methods after `_show_from_tray` (~line 7733), `_watchlist_open_add_dialog` (~line 12091)
- Test: `tests/test_djcrate_dispatch.py` (gui lane)

**Interfaces:**
- Consumes: `parse_djcrate_uri` / `BrowserSend` / `ParseError` (Task 1); the new Settings key `browser_receive_mode`; existing `self._url_var` (line 6022), `self._record_url_history` (called at 13065), `self._notebook.select(self._tab_main)` (pattern at 13066), `self._show_from_tray` (7733).
- Produces: `app._handle_djcrate_send(uri)` (Task 4 calls it); `_watchlist_open_add_dialog(initial_url=None)` (Task 8's inbox reuses it); `app._inbox_collect(send)` (Task 8 replaces the stub).
  **Quiet mode is a stub here that falls through to window behaviour** — so Tasks 4-6 deliver a complete, shippable window-mode integration even if 7-8 are deferred.

- [ ] **Step 1: Add the Settings schema key.** In `cratebuilder/settings.py::_schema_defaults`, add directly after `"run_at_startup": False,`:

```python
        "browser_receive_mode": "window",   # 'window' | 'quiet'
```

Run `python -m pytest -q -m "not gui"`. If a settings-schema enumeration test fails (check `tests/test_settings_vars.py` and `tests/test_settings.py`), add the new key to whatever list that test maintains, matching how the previously-added key was handled there.

- [ ] **Step 2: Import browserlink in the monolith.** Beside the other `cratebuilder` imports (~lines 40-60), matching their exact style — the file already uses the `cb_`-prefixed alias convention (`cb_startup`, `cb_scanproc`):

```python
import cratebuilder.browserlink as cb_browserlink
```

- [ ] **Step 3: Add the dispatcher.** Place it immediately after the `_show_from_tray` method (starts line 7733), keeping the surrounding `# ══════` divider style:

```python
    def _handle_djcrate_send(self, uri):
        """Act on a djcrate:// send from the browser extension.

        Called from two places, both of which have already marshalled onto
        the Tk thread: this process's own argv when the protocol launch won
        the singleton bind, and the socket listener when it lost. Window mode
        opens the matching prefilled flow; quiet mode collects instead.
        Contract errors surface as messageboxes per the wire contract's §4.
        """
        result = cb_browserlink.parse_djcrate_uri(uri)
        if isinstance(result, cb_browserlink.ParseError):
            if result.message:
                self._show_from_tray()
                messagebox.showwarning("Browser send", result.message,
                                       parent=self)
            return
        if self._settings.get("browser_receive_mode") == "quiet":
            self._inbox_collect(result)
            return
        self._show_from_tray()
        self._open_prefilled_for(result)

    def _open_prefilled_for(self, send):
        """Open the existing flow for a send: channels go to the Add Channel
        dialog (the user picks genre there — the browser can't know it),
        tracks prefill the Main tab."""
        if send.kind == "channel":
            self._watchlist_open_add_dialog(initial_url=send.url)
        else:
            self._url_var.set(send.url)
            self._record_url_history(send.url)
            self._notebook.select(self._tab_main)

    def _inbox_collect(self, send):
        """Quiet-inbox receive. Stub until the inbox lands: behaves as window
        mode so a quiet-mode setting can never swallow a send."""
        self._show_from_tray()
        self._open_prefilled_for(send)
```

`messagebox` is already imported at the top of the monolith — confirm with a grep rather than re-importing.

- [ ] **Step 4: Add prefill to the dialog.** Current code at line 12091-12092:

```python
    def _watchlist_open_add_dialog(self):
        """Open the dialog to add a new channel to the Watch List."""
```

Replace with:

```python
    def _watchlist_open_add_dialog(self, initial_url=None):
        """Open the dialog to add a new channel to the Watch List.
        initial_url prefills the URL field (browser-extension sends)."""
```

Then directly after `url_var = tk.StringVar()` (line 12118), add:

```python
        if initial_url:
            url_var.set(initial_url)
```

- [ ] **Step 5: Write the gui-lane test**

```python
# tests/test_djcrate_dispatch.py
"""Tests for _handle_djcrate_send dispatch (gui lane — needs a real app)."""
from urllib.parse import quote


def _channel_uri(url="https://soundcloud.com/someartist"):
    return f"djcrate://add?v=1&kind=channel&url={quote(url, safe='')}"


def _track_uri(url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"):
    return f"djcrate://add?v=1&kind=track&url={quote(url, safe='')}"


def test_track_send_prefills_main_tab(app):
    app._handle_djcrate_send(_track_uri())
    assert app._url_var.get() == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_channel_send_opens_prefilled_dialog(app, monkeypatch):
    opened = {}
    monkeypatch.setattr(
        app, "_watchlist_open_add_dialog",
        lambda initial_url=None: opened.setdefault("url", initial_url))
    app._handle_djcrate_send(_channel_uri())
    assert opened["url"] == "https://soundcloud.com/someartist"


def test_unknown_verb_is_ignored_without_touching_the_ui(app):
    before = app._url_var.get()
    app._handle_djcrate_send("djcrate://frobnicate")
    assert app._url_var.get() == before


def test_newer_version_warns_and_does_not_prefill(app, monkeypatch):
    warned = []
    import DJ_CrateBuilder_v1_3 as _unused_probe  # noqa: F401  (see note below)
    monkeypatch.setattr(
        "tkinter.messagebox.showwarning",
        lambda *a, **k: warned.append(a))
    before = app._url_var.get()
    app._handle_djcrate_send(
        "djcrate://add?v=99&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb")
    assert warned, "expected a version-skew warning"
    assert app._url_var.get() == before


def test_add_dialog_prefills_the_url_field(app):
    app._watchlist_open_add_dialog(initial_url="https://soundcloud.com/x")
    dlg = [w for w in app.winfo_children()
           if w.winfo_class() == "Toplevel"][-1]
    try:
        assert dlg.title() == "Add Channel to Watch List"
        entries = [w for w in dlg.winfo_children()[0].winfo_children()
                   if w.winfo_class() in ("Entry", "TEntry")]
        assert entries[0].get() == "https://soundcloud.com/x"
    finally:
        dlg.destroy()
```

Two notes for the implementer:
- Delete the `import DJ_CrateBuilder_v1_3` probe line — it is not a valid module name and is not needed; monkeypatching `tkinter.messagebox.showwarning` is enough because the monolith does `from tkinter import messagebox`. If that patch doesn't intercept (it won't if the monolith bound the name at import time), patch the bound attribute instead: `monkeypatch.setattr(cb_main_module.messagebox, "showwarning", ...)` using the `cb` fixture from `conftest.py`.
- The URL field is the first `Entry` built inside the dialog's single `outer` frame. If that widget walk proves brittle, keep the first four tests (they carry the real assertions) and reduce this one to asserting the dialog title.

- [ ] **Step 6: Run**

Run: `python -m pytest tests/test_djcrate_dispatch.py -q` then `python -m pytest -q -m "not gui"`
Expected: PASS.

- [ ] **Step 7: Manual verify (house rule for UI changes).** Launch `python DJ-CrateBuilder_v1.3.py`, then from a second terminal:

```powershell
python DJ-CrateBuilder_v1.3.py "djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist"
```

Expected: second process exits immediately; the running app comes forward with Add Channel prefilled. Repeat with a `kind=track` URI → Main tab prefilled. Close the app entirely and repeat → the app launches and the dialog appears ~1.5s after the UI is up.

- [ ] **Step 8: Commit (Tasks 4 + 5 together)**

```bash
git add DJ-CrateBuilder_v1.3.py cratebuilder/settings.py tests/test_djcrate_dispatch.py
git commit -m "feat(receive): djcrate:// argv and socket receive with prefilled flows"
```

---

### Task 6: Settings row — Browser integration

**Files:**
- Modify: `DJ-CrateBuilder_v1.3.py` — cratebuilder imports (~line 54), var init (~line 4708, beside `_run_at_startup`), Settings tab (~line 6316, after the auto-add row), handlers (~line 7877, beside `_on_run_at_startup_toggle`)

**Interfaces:**
- Consumes: `protocolreg` (Task 3); the `browser_receive_mode` Settings key (Task 5).
- Produces: the toggle the E2E checklist and `docs/help/didnt-open.md` both point users at.

- [ ] **Step 1: Import**

```python
import cratebuilder.protocolreg as cb_protocolreg
```

- [ ] **Step 2: Vars.** Beside the `_run_at_startup` var creation (lines 4708-4711), mirroring its read-the-real-state pattern:

```python
        self._browser_handler = tk.BooleanVar(
            value=cb_protocolreg.protocol_is_registered())
        self._browser_receive_mode = tk.StringVar(
            value=self._settings.get("browser_receive_mode"))
```

- [ ] **Step 3: Settings rows.** Insert after the auto-add checkbox block (after line 6316), before the auto-download interval row:

```python
        # Browser integration: djcrate:// handler + receive mode
        browser_row = ttk.Frame(outer)
        browser_row.pack(fill="x", pady=(2, 4))
        self._browser_handler_cb = ttk.Checkbutton(
            browser_row,
            text="Browser integration: register the djcrate:// link handler",
            variable=self._browser_handler,
            command=self._on_browser_handler_toggle,
            style="S.Opt.TCheckbutton")
        self._browser_handler_cb.pack(side="left")
        self._settings_help(
            browser_row,
            "Lets the browser extension send YouTube/SoundCloud channels and "
            "tracks straight to this app. Re-toggle after moving or "
            "reinstalling the app to refresh the stored path.",
            wraplength=320).pack(side="left", padx=(8, 0))

        recv_row = ttk.Frame(outer)
        recv_row.pack(fill="x", pady=(2, 4))
        ttk.Label(recv_row, text="When a browser send arrives:",
                  style="S.TLabel").pack(side="left", padx=(0, 10))
        for _text, _value in (("Bring window forward", "window"),
                              ("Collect quietly", "quiet")):
            ttk.Radiobutton(
                recv_row, text=_text, value=_value,
                variable=self._browser_receive_mode,
                command=self._on_browser_receive_mode_change
            ).pack(side="left", padx=(0, 12))
```

Before writing the radiobuttons, grep the Settings tab for an existing `ttk.Radiobutton` and copy its `style=` argument if one is in use; if the tab has none, leave the styling off as above.

- [ ] **Step 4: Handlers.** Beside `_on_run_at_startup_toggle` (line 7877), mirroring its revert-on-failure shape:

```python
    def _on_browser_handler_toggle(self):
        """Register or unregister the djcrate:// handler, reverting the
        checkbox if the registry write failed."""
        want = self._browser_handler.get()
        ok = (cb_protocolreg.register_protocol() if want
              else cb_protocolreg.unregister_protocol())
        if not ok:
            self._browser_handler.set(not want)
            messagebox.showwarning(
                "Browser integration",
                "Couldn't update the Windows registry entry.", parent=self)

    def _on_browser_receive_mode_change(self):
        self._settings.set("browser_receive_mode",
                           self._browser_receive_mode.get())
```

- [ ] **Step 5: Run + manual verify**

Run: `python -m pytest -q -m "not gui"` — PASS.
Launch the app: the Settings tab shows both rows. Toggle the handler on, then from a terminal:

```powershell
reg query "HKCU\Software\Classes\djcrate\shell\open\command"
```

Expected: the command with a trailing `"%1"`. Toggle off → `reg query` reports the key is gone. Change the receive-mode radio, restart the app, confirm it persisted.

- [ ] **Step 6: Commit**

```bash
git add DJ-CrateBuilder_v1.3.py
git commit -m "feat(settings): browser integration toggle and receive mode"
```

---

### Task 7: Quiet inbox — persistence

**Files:**
- Modify: `cratebuilder/db.py` — `SCHEMA_VERSION` (line 68), the `_init_schema` executescript (lines 120-180), the migrations section (~line 219), new methods after `add_watchlist_channel` (line 918)
- Test: `tests/test_db.py` — update the version assert at line 295; append inbox tests

**Interfaces:**
- Consumes: nothing new.
- Produces: `add_inbox_item(*, url, kind, received_at=None) → bool` (False = coalesced duplicate); `list_inbox() → list[sqlite3.Row]` with columns `id, url, kind, received_at`, oldest first; `remove_inbox_item(item_id) → None`; `inbox_count() → int`.

- [ ] **Step 1: Write the failing tests.** Change line 295's assert from `== 7` to `== 8`, then append (matching the fixture idiom the neighbouring tests use for building a `DownloadsDatabase` on a tmp path):

```python
def test_inbox_add_list_remove_count(tmp_path):
    db = DownloadsDatabase(str(tmp_path / "t.db"))
    assert db.inbox_count() == 0
    assert db.add_inbox_item(url="https://soundcloud.com/a", kind="channel",
                             received_at=100) is True
    assert db.add_inbox_item(url="https://soundcloud.com/a/b", kind="track",
                             received_at=200) is True
    assert db.inbox_count() == 2
    rows = db.list_inbox()
    assert [r["url"] for r in rows] == [
        "https://soundcloud.com/a", "https://soundcloud.com/a/b"]
    assert rows[0]["kind"] == "channel"
    db.remove_inbox_item(rows[0]["id"])
    assert db.inbox_count() == 1


def test_inbox_duplicate_url_is_coalesced(tmp_path):
    db = DownloadsDatabase(str(tmp_path / "t.db"))
    assert db.add_inbox_item(url="https://soundcloud.com/a", kind="channel") is True
    assert db.add_inbox_item(url="https://soundcloud.com/a", kind="channel") is False
    assert db.inbox_count() == 1


def test_inbox_survives_reopen(tmp_path):
    path = str(tmp_path / "t.db")
    DownloadsDatabase(path).add_inbox_item(
        url="https://soundcloud.com/a", kind="channel")
    assert DownloadsDatabase(path).inbox_count() == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_db.py -q`
Expected: the three new tests FAIL on missing methods, and the version test FAILS on `8 != 7` — proving both edits are observed.

- [ ] **Step 3: Implement.** Bump line 68 to `SCHEMA_VERSION = 8`. Append this table to the `executescript` block, before its closing `"""` at line 180:

```sql
                    CREATE TABLE IF NOT EXISTS browser_inbox (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT,
                        url         TEXT NOT NULL UNIQUE,
                        kind        TEXT NOT NULL,
                        received_at INTEGER NOT NULL
                    );
```

In the migrations section (after the v6 block ending ~line 247, before the `INSERT OR REPLACE INTO schema_info`), add a comment in the house voice recording that schema v8 adds `browser_inbox` and that the `CREATE TABLE IF NOT EXISTS` above *is* the migration — an existing database gains the table on next open, so no ALTER is needed.

Then add the four methods after `add_watchlist_channel` (line 918):

```python
    def add_inbox_item(self, *, url, kind, received_at=None):
        """Queue a browser-extension send for later processing. A URL already
        pending is silently coalesced (returns False); a fresh row returns
        True, which is what drives the tray ping."""
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO browser_inbox (url, kind, received_at) "
                "VALUES (?, ?, ?)",
                (url, kind, int(received_at if received_at is not None
                                else time.time())))
            return cur.rowcount == 1

    def list_inbox(self):
        """All pending browser sends, oldest first."""
        with self._conn() as conn:
            return conn.execute(
                "SELECT id, url, kind, received_at FROM browser_inbox "
                "ORDER BY received_at, id").fetchall()

    def remove_inbox_item(self, item_id):
        with self._conn() as conn:
            conn.execute("DELETE FROM browser_inbox WHERE id = ?", (item_id,))

    def inbox_count(self):
        with self._conn() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM browser_inbox").fetchone()[0]
```

Confirm `time` is already imported at the top of `db.py`; add it if not.

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_db.py -q` then `python -m pytest -q -m "not gui"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cratebuilder/db.py tests/test_db.py
git commit -m "feat(db): browser_inbox table at schema v8 with URL coalescing"
```

---

### Task 8: Quiet inbox — UI

**Files:**
- Modify: `DJ-CrateBuilder_v1.3.py` — replace the `_inbox_collect` stub from Task 5; Watch List toolbar (~line 10863); new dialog methods beside `_watchlist_open_add_dialog` (~line 12090)
- Test: `tests/test_djcrate_dispatch.py` (append)

**Interfaces:**
- Consumes: Task 7's four db methods; `self._tray_icon.notify(message, title="DJ-CrateBuilder")` (`cratebuilder/tray.py:78` — already a safe no-op when the tray isn't running); the app's `DownloadsDatabase` attribute; `_open_prefilled_for` (Task 5).
- Produces: nothing later tasks consume.

**Before starting:** grep the monolith for `DownloadsDatabase(` and note the attribute the app stores it on (the snippets below assume `self._db`). Use the real name consistently in Steps 1, 3, and 4.

- [ ] **Step 1: Replace the `_inbox_collect` stub** from Task 5 with the real one:

```python
    def _inbox_collect(self, send):
        """Quiet-inbox receive: persist, ping the tray, refresh the count.
        No window comes forward — that is the whole point of the mode."""
        fresh = self._db.add_inbox_item(url=send.url, kind=send.kind)
        if fresh:
            self._tray_icon.notify(
                f"Queued a {send.kind} from your browser — open the Watch "
                f"List tab to process it.")
        self._wl_update_inbox_button()
```

- [ ] **Step 2: Toolbar button.** After `self._wl_add_btn.pack(side="left", padx=(0, 6))` at line 10863, add — copying the `tk.Button` kwargs from `_wl_add_btn` exactly so it matches its neighbours:

```python
        self._wl_inbox_btn = tk.Button(
            toolbar, text="  📥  Inbox  ",
            font=("Segoe UI", 10, "bold"),
            bg=SURFACE2, fg=LINK_COL,
            activebackground=BORDER, activeforeground=TEXT,
            relief="flat", bd=0, padx=12, pady=4, cursor="hand2",
            command=self._wl_open_inbox_dialog)
        self._wl_inbox_btn.pack(side="left", padx=(0, 6))
        self._wl_update_inbox_button()
```

- [ ] **Step 3: Count refresh + dialog.** New methods beside the Add Channel dialog section (line 12090), keeping the `# ══════` divider style:

```python
    # ── Browser inbox dialog ─────────────────────────────────────────────────
    def _wl_update_inbox_button(self):
        """Show the inbox button with a live count, or hide it when empty —
        the toolbar stays clean for users who never enable quiet mode."""
        try:
            count = self._db.inbox_count()
        except Exception:
            count = 0
        if count:
            self._wl_inbox_btn.configure(text=f"  📥  Inbox ({count})  ")
            if not self._wl_inbox_btn.winfo_ismapped():
                self._wl_inbox_btn.pack(side="left", padx=(0, 6))
        else:
            self._wl_inbox_btn.pack_forget()

    def _wl_open_inbox_dialog(self):
        """List pending browser sends. Process opens the same prefilled flow
        a window-mode send would have opened; Remove discards the row."""
        dlg = tk.Toplevel(self)
        dlg.title("Browser Inbox")
        dlg.geometry("560x420")
        dlg.configure(bg=BG)
        dlg.transient(self)
        dlg.grab_set()

        outer = tk.Frame(dlg, bg=BG, padx=20, pady=16)
        outer.pack(fill="both", expand=True)
        tk.Label(outer, text="Pending browser sends",
                 font=("Segoe UI", 13, "bold"), fg=TEXT, bg=BG
                 ).pack(anchor="w", pady=(0, 10))
        rows_frame = tk.Frame(outer, bg=BG)
        rows_frame.pack(fill="both", expand=True)

        def _refresh():
            for w in rows_frame.winfo_children():
                w.destroy()
            items = self._db.list_inbox()
            if not items:
                tk.Label(rows_frame, text="Inbox is empty.",
                         font=("Segoe UI", 10), fg=TEXT_DIM, bg=BG
                         ).pack(anchor="w", pady=8)
            for item in items:
                row = tk.Frame(rows_frame, bg=BG)
                row.pack(fill="x", pady=2)
                tk.Label(row, text=item["kind"], width=8, anchor="w",
                         font=("Segoe UI", 9, "bold"), fg=TEXT_DIM, bg=BG
                         ).pack(side="left")
                tk.Label(row, text=item["url"], anchor="w",
                         font=("Segoe UI", 9), fg=TEXT, bg=BG
                         ).pack(side="left", fill="x", expand=True)
                tk.Button(row, text="Process",
                          font=("Segoe UI", 9), bg=SURFACE2, fg=LINK_COL,
                          relief="flat", bd=0, padx=8, cursor="hand2",
                          command=lambda it=item: _process(it)
                          ).pack(side="right", padx=(4, 0))
                tk.Button(row, text="Remove",
                          font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT_DIM,
                          relief="flat", bd=0, padx=8, cursor="hand2",
                          command=lambda it=item: _remove(it)
                          ).pack(side="right")

        def _remove(item):
            self._db.remove_inbox_item(item["id"])
            self._wl_update_inbox_button()
            _refresh()

        def _process(item):
            self._db.remove_inbox_item(item["id"])
            self._wl_update_inbox_button()
            dlg.destroy()
            self._open_prefilled_for(
                cb_browserlink.BrowserSend(kind=item["kind"], url=item["url"]))

        _refresh()
```

- [ ] **Step 4: Append the gui-lane tests**

```python
def test_quiet_mode_collects_instead_of_opening_dialogs(app, monkeypatch):
    app._settings.set("browser_receive_mode", "quiet")
    opened = []
    monkeypatch.setattr(app, "_watchlist_open_add_dialog",
                        lambda initial_url=None: opened.append(initial_url))
    app._handle_djcrate_send(_channel_uri())
    assert opened == []
    assert app._db.inbox_count() == 1


def test_quiet_mode_coalesces_duplicate_sends(app):
    app._settings.set("browser_receive_mode", "quiet")
    app._handle_djcrate_send(_channel_uri())
    app._handle_djcrate_send(_channel_uri())
    assert app._db.inbox_count() == 1


def test_processing_an_inbox_item_removes_it(app):
    app._settings.set("browser_receive_mode", "quiet")
    app._handle_djcrate_send(_track_uri())
    item = app._db.list_inbox()[0]
    app._db.remove_inbox_item(item["id"])
    assert app._db.inbox_count() == 0
```

The `app` fixture redirects the DB into `tmp_path` per `conftest.py`, so these leave the developer's real database untouched.

- [ ] **Step 5: Run**

Run: `python -m pytest tests/test_djcrate_dispatch.py tests/test_db.py -q` then `python -m pytest -q -m "not gui"`
Expected: PASS.

- [ ] **Step 6: Manual verify.** Set receive mode to "Collect quietly", minimise the app to tray, and run the second-terminal send from Task 5 Step 7. Expected: no window comes forward; a tray balloon appears; the Watch List toolbar shows "📥 Inbox (1)". Process opens the prefilled dialog and the count drops; Remove discards; the button disappears at zero; a pending item survives an app restart.

- [ ] **Step 7: Commit**

```bash
git add DJ-CrateBuilder_v1.3.py tests/test_djcrate_dispatch.py
git commit -m "feat(inbox): quiet-mode browser inbox with tray ping and process flow"
```

---

### Task 9: Full-suite gate and branch wrap-up

**Files:** none new.

- [ ] **Step 1: Full suite.** Run `python -m pytest -q` (both lanes, ~2 min). Every test green, including the ~975 pre-existing ones. The house rule is explicit: "done" for pure-logic changes requires this run, and its output reported. Fix anything red before proceeding.

- [ ] **Step 2: Launch and eyeball.** `python DJ-CrateBuilder_v1.3.py` — Settings rows present and working, both receive modes behaving per the Task 5 and Task 8 manual checks.

- [ ] **Step 3: Cross-repo E2E.** Hand back to the extension repo's plan, Task 9 — the ten-row checklist at `DJ-CrateBuilder-Browser_Extensions/docs/e2e-checklist.md`, run in both Chrome and Firefox.

- [ ] **Step 4: Stop.** Merging the branch and any push wait for an explicit ask, per CLAUDE.md. Use superpowers:finishing-a-development-branch to present the integration options.

---

## Self-review notes

- **Contract coverage:** §1/§4 parsing and messages → Task 1; §2 socket framing (line read, 8 KiB cap, `show` back-compat, unknown-verb ignore) → Task 2; §3 canonical-host validation → Task 1's `ACCEPTED_HOSTS`. SPEC §10: registry toggle → Tasks 3+6; window-up mode → Tasks 4+5; quiet inbox (persist, coalesce, tray ping, visible count, per-row process) → Tasks 7+8; Linux MimeType → Task 3 Step 5, flagged as unverifiable from Windows.
- **House rules:** schema bump + migration → Task 7; no tkinter in `cratebuilder/` → all four new/changed package modules are stdlib-only; worktree, no-push, no-APP_BUILD → Global Constraints and Task 9 Step 4.
- **Deliberate sequencing:** Tasks 4+5 commit as one (the entry point references a method Task 5 defines). Quiet mode stubs to window behaviour in Task 5, so Tasks 4-6 are independently shippable if 7-8 slip.
- **Known unknowns, surfaced not hidden:** the app's `DownloadsDatabase` attribute name (Task 8 opens with a grep), the Settings-tab radiobutton style name (Task 6 Step 3), whether a settings-schema enumeration test lists keys (Task 5 Step 1), and the messagebox monkeypatch binding (Task 5 Step 5). Each names the check to run rather than guessing.
