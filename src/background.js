/**
 * Background service worker (Chrome) / event page (Firefox).
 *
 * Owns: context-menu registration and clicks (SPEC §5.2), toolbar icon
 * colored/gray state per tab (SPEC §5.1), and message handling from the popup
 * and content script. All sends go through lib/transport.js — never build a
 * djcrate:// string here.
 */

// TODO(build-order 4): toolbar icon state — classify tab URL on
//   tabs.onUpdated / onActivated, set colored vs gray icon.
// TODO(build-order 6): context menus — two entries (page + link), shown only
//   when classify() says sendable; click → transport.send + sent-memory.
// TODO(build-order 7): message routing for the in-page button.

// import { classify, isSendable } from './lib/classifier.js';
// import { send } from './lib/transport.js';
