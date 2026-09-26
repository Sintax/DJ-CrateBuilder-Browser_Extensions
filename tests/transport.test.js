import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeChrome } from './helpers/fake-chrome.js';
import { buildUri, send } from '../src/lib/transport.js';

test('buildUri builds the v1 URI with an encoded url', () => {
  assert.equal(
    buildUri({ kind: 'channel', url: 'https://soundcloud.com/someartist' }),
    'djcrate://add?v=1&kind=channel&url=https%3A%2F%2Fsoundcloud.com%2Fsomeartist',
  );
  // ? and = inside the URL must themselves be encoded (contract §1)
  assert.equal(
    buildUri({ kind: 'track', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ',
  );
});

test('buildUri rejects bad payloads', () => {
  assert.throws(() => buildUri({ kind: 'playlist', url: 'https://x.com' }), TypeError);
  assert.throws(() => buildUri({ kind: 'channel', url: 'http://insecure.com' }), TypeError);
  assert.throws(() => buildUri({ kind: 'channel', url: 42 }), TypeError);
  assert.throws(() => buildUri({}), TypeError);
});

test('send navigates the given tab to the built URI', async () => {
  const fake = installFakeChrome();
  try {
    const out = await send(
      { kind: 'track', url: 'https://soundcloud.com/a/b' }, { tabId: 7 });
    assert.deepEqual(out, { dispatched: true });
    assert.deepEqual(fake.calls.tabsUpdate, [
      [7, { url: 'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb' }],
    ]);
  } finally {
    fake.uninstall();
  }
});

test('send without a tabId targets the active tab (no-id overload)', async () => {
  const fake = installFakeChrome();
  try {
    await send({ kind: 'channel', url: 'https://soundcloud.com/a' });
    assert.equal(fake.calls.tabsUpdate.length, 1);
    assert.equal(fake.calls.tabsUpdate[0].length, 1); // props only, no tabId
  } finally {
    fake.uninstall();
  }
});

test('buildUri appends the right-click choice when there is one', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const base = 'djcrate://add?v=1&kind=track&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ';
  assert.equal(buildUri({ kind: 'track', url, then: 'batch' }), `${base}&then=batch`);
  assert.equal(buildUri({ kind: 'track', url, then: 'download' }), `${base}&then=download`);
  assert.equal(buildUri({ kind: 'track', url, then: undefined }), base);
});

test('buildUri refuses a choice the contract does not define', () => {
  assert.throws(() => buildUri({ kind: 'track', url: 'https://soundcloud.com/a/b', then: 'play' }), TypeError);
});
