import test from 'node:test';
import assert from 'node:assert/strict';

import { buttonLabelFor, menuTitleFor, sentLine } from '../src/lib/ui-text.js';

test('button labels (SPEC §5.1 copy, verbatim)', () => {
  assert.equal(buttonLabelFor({ kind: 'channel' }), 'Add channel to Watch List');
  assert.equal(buttonLabelFor({ kind: 'track' }), 'Download this track');
  assert.equal(buttonLabelFor({ kind: 'unsupported' }), null);
});

test('context-menu titles (SPEC §5.2 copy, verbatim)', () => {
  assert.equal(menuTitleFor({ kind: 'channel' }), 'Send channel to DJ-CrateBuilder');
  assert.equal(menuTitleFor({ kind: 'track' }), 'Send track to DJ-CrateBuilder');
  assert.equal(menuTitleFor({ kind: 'unsupported' }), null);
});

test('sentLine buckets relative time and always says Sent, never Added', () => {
  const now = 10 * 24 * 60 * 60 * 1000;
  assert.equal(sentLine(now - 5 * 1000, now), 'Sent ✓ · just now');
  assert.equal(sentLine(now - 90 * 1000, now), 'Sent ✓ · 1 minute ago');
  assert.equal(sentLine(now - 30 * 60 * 1000, now), 'Sent ✓ · 30 minutes ago');
  assert.equal(sentLine(now - 3 * 60 * 60 * 1000, now), 'Sent ✓ · 3 hours ago');
  assert.equal(sentLine(now - 2 * 24 * 60 * 60 * 1000, now), 'Sent ✓ · 2 days ago');
  assert.ok(!sentLine(now - 1000, now).includes('Added'));
});
