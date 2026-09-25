import test from 'node:test';
import assert from 'node:assert/strict';

import {
  versionFromTag, versionMismatches, firefoxUpdates, FIREFOX_ID,
} from '../scripts/release-meta.mjs';

test('a release tag is v + a three-part version', () => {
  assert.equal(versionFromTag('v0.1.0'), '0.1.0');
  assert.equal(versionFromTag('refs/tags/v1.12.3'), '1.12.3');
  for (const bad of ['0.1.0', 'v0.1', 'v0.1.0-beta', 'vx.y.z', '', undefined]) {
    assert.throws(() => versionFromTag(bad), /tag/, `accepted ${bad}`);
  }
});

test('every manifest has to carry the tagged version', () => {
  const same = { 'package.json': '0.2.0', 'manifest.chrome.json': '0.2.0',
    'manifest.firefox.json': '0.2.0' };
  assert.deepEqual(versionMismatches('0.2.0', same), []);
  assert.deepEqual(
    versionMismatches('0.2.0', { ...same, 'manifest.firefox.json': '0.1.0' }),
    ['manifest.firefox.json has 0.1.0, the tag says 0.2.0'],
  );
});

test('the Firefox update manifest points installed copies at the new .xpi', () => {
  const url = 'https://github.com/o/r/releases/download/v0.2.0/djcratebuilder-firefox-0.2.0.xpi';
  assert.deepEqual(firefoxUpdates('0.2.0', url), {
    addons: { [FIREFOX_ID]: { updates: [{ version: '0.2.0', update_link: url }] } },
  });
});

test('the add-on id matches the Firefox manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(
    new URL('../src/manifest.firefox.json', import.meta.url), 'utf8'));
  assert.equal(manifest.browser_specific_settings.gecko.id, FIREFOX_ID);
});

test('the Firefox manifest asks the latest release for updates', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(
    new URL('../src/manifest.firefox.json', import.meta.url), 'utf8'));
  assert.equal(manifest.browser_specific_settings.gecko.update_url,
    'https://github.com/Sintax/DJ-CrateBuilder-Browser_Extensions/releases/latest/download/updates.json');
});
