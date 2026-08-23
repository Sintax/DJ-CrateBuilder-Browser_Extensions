# CrateBuilder didn't open?

You clicked send, the browser asked (or didn't ask) about opening
DJ-CrateBuilder, and… nothing happened.

The extension **cannot detect this** — the `djcrate://` send is one-way by
design — so here is the checklist, most likely first:

1. **The handler isn't registered.** Open DJ-CrateBuilder → **Settings** →
   **Browser integration** → turn the toggle **on**. This registers the
   `djcrate://` link type with Windows (or your Linux desktop). It's per-user
   and needs no admin rights.
2. **The browser's permission dialog was dismissed.** Chrome and Firefox each
   show a one-time "Open DJ-CrateBuilder?" dialog per site. If it was
   cancelled once with "always deny" remembered, re-enable it in the browser's
   site settings for youtube.com / soundcloud.com, then send again and tick
   *always allow*.
3. **The app moved or was reinstalled somewhere else.** The registration
   stores the app's path. Toggle Browser integration off and on again in
   Settings to re-register the current location.
4. **It actually did work, quietly.** If receive mode is set to **"Collect
   quietly"**, sends land in the app's inbox (tray notification + a count in
   the main window) instead of bringing a window forward.
