/**
 * Pure view-model for the toolbar popup (SPEC §5.1): everything popup.js
 * renders, computed with no DOM and no browser APIs so it's testable.
 */
import { classify, describe, isSendable } from './classifier.js';
import { buttonLabelFor, sentLine } from './ui-text.js';

export function popupModel({ rawUrl, title, sent = null, now = Date.now() }) {
  const c = classify(rawUrl);
  if (!isSendable(c)) {
    return {
      sendable: false,
      title: title ?? '',
      detected: 'Not a supported YouTube or SoundCloud page',
      buttonLabel: null,
      sentLine: null,
      payload: null,
    };
  }
  return {
    sendable: true,
    title: title ?? '',
    detected: describe(c),
    buttonLabel: buttonLabelFor(c),
    sentLine: sent ? sentLine(sent.sentAt, now) : null,
    payload: { kind: c.kind, url: c.canonicalUrl, platform: c.platform },
  };
}
