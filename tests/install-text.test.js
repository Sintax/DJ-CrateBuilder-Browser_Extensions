import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('the Chrome instructions cover every step of a by-hand install', async () => {
  const text = await read('install/chrome.txt');
  for (const step of ['Browser integration', 'chrome://extensions', 'edge://extensions',
    'brave://extensions', 'opera://extensions', 'Developer mode', 'Load unpacked',
    'manifest.json', 'reload']) {
    assert.ok(text.includes(step), `missing: ${step}`);
  }
});

test('the Firefox instructions send people to the signed .xpi', async () => {
  const text = await read('install/firefox.txt');
  for (const step of ['Browser integration', '.xpi', 'about:debugging']) {
    assert.ok(text.includes(step), `missing: ${step}`);
  }
});

test('each build carries its browser\'s instructions as INSTALL.txt', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  for (const browser of ['chrome', 'firefox']) {
    assert.equal(await read(`dist/${browser}/INSTALL.txt`), await read(`install/${browser}.txt`));
  }
});
