# Releasing the extension

Releases are built by GitHub (`.github/workflows/release.yml`) whenever a
version tag is pushed. The release page it creates holds:

| File | For |
|---|---|
| `djcratebuilder-firefox-<v>.xpi` | Firefox. Signed by Mozilla, installs in one click, updates itself. |
| `updates.json` | What installed Firefox copies check for new versions. |
| `djcratebuilder-chrome-<v>.zip` | Chrome, Edge, Brave, Opera. Loaded by hand ([INSTALL.md](INSTALL.md)). |

## Cutting a release

1. Put the new version (e.g. `0.2.0`) in all three places:
   `package.json`, `src/manifest.chrome.json`, `src/manifest.firefox.json`.
   The workflow refuses to publish if they disagree with the tag.
2. Commit that change, e.g. `chore(release): 0.2.0`.
3. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

4. Watch it under the repo's **Actions** tab. Mozilla's signing usually takes
   a few minutes.

Firefox only installs a version that is higher than the one it already has,
so every release needs a new number.

## One-time setup: Mozilla signing keys

Without these, releases still go out, but Firefox gets an unsigned zip that
can only be loaded temporarily for testing, and nothing updates itself.

1. Go to <https://addons.mozilla.org/developers/> and sign in, or create a
   free Mozilla account.
2. Accept the developer agreement if asked.
3. Open <https://addons.mozilla.org/developers/addon/api/key/> and click
   **Generate new credentials**. You get two values: a **JWT issuer** and a
   **JWT secret**. Keep the page open. The secret is only shown once.
4. On GitHub, open this repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**, and add two secrets:
   - Name `AMO_JWT_ISSUER`, value: the JWT issuer
   - Name `AMO_JWT_SECRET`, value: the JWT secret

The extension is signed as **unlisted**. Mozilla checks and signs it, but it
does not appear in their public add-on store. People install it from our
release page instead.
