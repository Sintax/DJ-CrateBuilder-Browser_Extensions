/**
 * Toolbar popup (SPEC §5.1). Renders popupModel() for the active tab from the
 * tab and storage alone, so the popup still paints when the background worker
 * is asleep or wedged; only the send button talks to it, routing through
 * djcb:send so recording can't be skipped. Popup-before-send is deliberate:
 * the user sees what they're about to send before the browser's
 * external-protocol dialog.
 */
import { popupModel } from '../lib/popup-model.js';
import { history, clearAll, getSent } from '../lib/sent-memory.js';
import { classify } from '../lib/classifier.js';
import { sentLine } from '../lib/ui-text.js';

// Resolved lazily (not at module load) so Firefox's browser.* is preferred
// when present, falling back to chrome.* (Chrome, and Firefox's polyfill).
const api = () => globalThis.browser ?? globalThis.chrome;

const HELP_URL =
  'https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/blob/main/docs/help/didnt-open.md';

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const [tab] = await api().tabs.query({ active: true, currentWindow: true });
    const c = classify(tab?.url ?? '');
    let sent = null;
    try {
      if (c.canonicalUrl) sent = await getSent(c.canonicalUrl);
    } catch {
      // Storage unreadable — render without the "Sent ✓" line rather than
      // failing the whole popup.
      sent = null;
    }
    render(popupModel({ rawUrl: tab?.url, title: tab?.title, sent }), tab);
  } catch {
    // Couldn't even read the active tab — degrade instead of leaving a blank
    // popup.
    $('detected').textContent = 'Extension error — reopen the popup';
  }
}

function render(model, tab) {
  $('page-title').textContent = model.title;
  $('detected').textContent = model.detected;
  $('detected').classList.toggle('dim', !model.sendable);
  const btn = $('send');
  btn.hidden = !model.sendable;
  btn.textContent = model.buttonLabel ?? '';
  $('sent-state').hidden = model.sentLine === null;
  $('sent-state').classList.remove('error');
  $('sent-state').textContent = model.sentLine ?? '';
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const out = await api().runtime.sendMessage(
        { type: 'djcb:send', url: tab.url, tabId: tab.id });
      if (out?.dispatched) {
        $('sent-state').classList.remove('error');
        $('sent-state').textContent = sentLine(Date.now());
        $('sent-state').hidden = false;
      } else {
        $('sent-state').classList.add('error');
        $('sent-state').textContent = 'Couldn\'t send — see "CrateBuilder didn\'t open?"';
        $('sent-state').hidden = false;
      }
    } catch {
      $('sent-state').classList.add('error');
      $('sent-state').textContent = 'Couldn\'t send — see "CrateBuilder didn\'t open?"';
      $('sent-state').hidden = false;
    } finally {
      btn.disabled = false;
    }
  };
}

async function showHistory() {
  const list = $('history-list');
  list.replaceChildren();
  const now = Date.now();
  for (const entry of await history()) {
    const li = document.createElement('li');
    const url = document.createElement('span');
    url.className = 'hist-url';
    url.textContent = entry.url;
    const when = document.createElement('span');
    when.className = 'hist-when';
    when.textContent = sentLine(entry.sentAt, now);
    li.append(url, when);
    list.append(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing sent yet.';
    list.append(li);
  }
  $('view-main').hidden = true;
  $('view-history').hidden = false;
}

$('help-link').onclick = () => api().tabs.create({ url: HELP_URL });
$('history-link').onclick = showHistory;
$('back-link').onclick = () => {
  $('view-history').hidden = true;
  $('view-main').hidden = false;
};
$('clear-link').onclick = async () => { await clearAll(); showHistory(); };

init();
