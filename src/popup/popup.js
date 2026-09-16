/**
 * Toolbar popup (SPEC §5.1). Renders popupModel() for the active tab; the
 * send button routes through the background's djcb:send so recording can't
 * be skipped. Popup-before-send is deliberate: the user sees what they're
 * about to send before the browser's external-protocol dialog.
 */
import { popupModel } from '../lib/popup-model.js';
import { history, clearAll } from '../lib/sent-memory.js';
import { sentLine } from '../lib/ui-text.js';

const HELP_URL =
  'https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/blob/main/docs/help/didnt-open.md';

const $ = (id) => document.getElementById(id);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = await chrome.runtime.sendMessage(
    { type: 'djcb:page-state', url: tab?.url ?? '' });
  const model = popupModel({
    rawUrl: tab?.url, title: tab?.title, sent: state?.sent ?? null });
  render(model, tab);
}

function render(model, tab) {
  $('page-title').textContent = model.title;
  $('detected').textContent = model.detected;
  $('detected').classList.toggle('dim', !model.sendable);
  const btn = $('send');
  btn.hidden = !model.sendable;
  btn.textContent = model.buttonLabel ?? '';
  $('sent-state').hidden = model.sentLine === null;
  $('sent-state').textContent = model.sentLine ?? '';
  btn.onclick = async () => {
    btn.disabled = true;
    const out = await chrome.runtime.sendMessage(
      { type: 'djcb:send', url: tab.url, tabId: tab.id });
    if (out?.dispatched) {
      $('sent-state').textContent = 'Sent ✓ · just now';
      $('sent-state').hidden = false;
    }
    btn.disabled = false;
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

$('help-link').onclick = () => chrome.tabs.create({ url: HELP_URL });
$('history-link').onclick = showHistory;
$('back-link').onclick = () => {
  $('view-history').hidden = true;
  $('view-main').hidden = false;
};
$('clear-link').onclick = async () => { await clearAll(); showHistory(); };

init();
