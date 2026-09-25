# Installing the DJ-CrateBuilder browser extension

The extension adds a **Send to DJ-CrateBuilder** option to YouTube and
SoundCloud pages. It doesn't download anything itself. It hands the link to
the DJ-CrateBuilder app on your computer, and the app does the rest.

## Before you start

1. Install the [DJ-CrateBuilder app](https://github.com/Sintax/DJ-CrateBuilder)
   if you haven't already.
2. Open the app, go to **Settings → Browser integration**, and switch it
   **on**. This tells your computer that CrateBuilder links belong to the app.
   Without it, clicking send does nothing.

Every download mentioned below is on the
[latest release page](https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/releases/latest).

---

## Firefox

Firefox 128 or newer.

1. Open the [latest release page](https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/releases/latest)
   **in Firefox**.
2. Click the file ending in **`.xpi`**.
3. Firefox asks whether to add DJ-CrateBuilder. Click **Add**.
4. Optional: click the puzzle-piece icon in the toolbar and pin
   DJ-CrateBuilder so its button is always visible.

That's it. Firefox checks for new versions and updates the extension by itself.

---

## Chrome, Edge, Brave and Opera

These browsers only allow one-click installs from their own stores, and the
Chrome Web Store doesn't allow extensions that help download from YouTube. So
this one is installed by hand. It takes about two minutes.

### Install

1. From the [latest release page](https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/releases/latest),
   download the file named **`djcratebuilder-chrome-….zip`**.
2. Make a folder somewhere it can stay for good, for example
   `Documents\DJ-CrateBuilder Extension`. **Don't delete this folder later.**
   The browser runs the extension straight from it.
3. Unzip the download into that folder. Afterwards the folder should contain a
   file called `manifest.json`, not another folder.
4. Open the extensions page by typing this into the address bar:

   | Browser | Address |
   |---|---|
   | Chrome | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Brave | `brave://extensions` |
   | Opera | `opera://extensions` |

5. Turn on **Developer mode**. In Chrome and Brave it's a switch in the top
   right. In Edge it's in the left-hand menu.
6. Click **Load unpacked** and pick the folder from step 2.
7. Optional: click the puzzle-piece icon in the toolbar and pin
   DJ-CrateBuilder.

When the browser starts, it may warn you about extensions in developer mode.
That's expected for an extension installed this way. Keep it switched on.

### Updating

These browsers can't update it for you:

1. Download the newest `djcratebuilder-chrome-….zip` from the
   [latest release page](https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/releases/latest).
2. Delete everything inside your extension folder, then unzip the new files
   into **the same folder**.
3. On the extensions page, click the circular **reload** arrow on the
   DJ-CrateBuilder card.

Using the same folder keeps your "Sent ✓" history.

---

## Your first send

1. Open a YouTube or SoundCloud channel or track.
2. Send it with the toolbar button, the right-click menu, or the
   **+ CrateBuilder** button on the page.
3. The first time, the browser asks whether to open DJ-CrateBuilder. Tick
   **Always allow**, then click **Open**.

Nothing happened? See [CrateBuilder didn't open?](help/didnt-open.md)
