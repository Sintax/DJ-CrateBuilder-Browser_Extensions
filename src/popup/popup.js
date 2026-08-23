/**
 * Toolbar popup — the surface that proves the loop (SPEC §5.1).
 *
 * Shows what was detected on the active tab and one send button:
 * "Add channel to Watch List" / "Download this track". Popup-before-send is
 * deliberate: the user always sees what they're about to send before the
 * browser's external-protocol dialog appears.
 */

// TODO(build-order 4): query active tab, classify(), render, wire the send
//   button through lib/transport.js, then record via lib/sent-memory.js.
// TODO(build-order 5): sent-state line + "Sent history" view.

// import { classify, describe, isSendable } from '../lib/classifier.js';
// import { send } from '../lib/transport.js';
