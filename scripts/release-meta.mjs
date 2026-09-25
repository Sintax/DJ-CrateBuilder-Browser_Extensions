/**
 * Release bookkeeping for .github/workflows/release.yml.
 *
 *   node scripts/release-meta.mjs check <tag>
 *     Fails unless package.json and both manifests carry the tag's version.
 *   node scripts/release-meta.mjs updates <tag> <xpi-url>
 *     Prints the Firefox update manifest. It is published as a release asset,
 *     and every installed copy polls it through the manifest's update_url
 *     (…/releases/latest/download/updates.json), so a signed release reaches
 *     existing installs on its own.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const FIREFOX_ID = 'djcratebuilder@sintax.dev';

const VERSIONED = ['package.json', 'src/manifest.chrome.json', 'src/manifest.firefox.json'];

export function versionFromTag(tag) {
  const m = /^(?:refs\/tags\/)?v(\d+\.\d+\.\d+)$/.exec(tag ?? '');
  if (!m) throw new Error(`release tag "${tag}" is not v<major>.<minor>.<patch>`);
  return m[1];
}

/** One line per file whose version differs from the tag's; empty when all agree. */
export function versionMismatches(version, versionsByFile) {
  return Object.entries(versionsByFile)
    .filter(([, v]) => v !== version)
    .map(([file, v]) => `${file} has ${v}, the tag says ${version}`);
}

export function firefoxUpdates(version, xpiUrl) {
  return { addons: { [FIREFOX_ID]: { updates: [{ version, update_link: xpiUrl }] } } };
}

async function main([command, tag, xpiUrl]) {
  const version = versionFromTag(tag);
  if (command === 'check') {
    const root = new URL('../', import.meta.url);
    const versions = {};
    for (const file of VERSIONED) {
      versions[file.split('/').pop()] = JSON.parse(await readFile(new URL(file, root), 'utf8')).version;
    }
    const wrong = versionMismatches(version, versions);
    if (wrong.length) throw new Error(`version mismatch:\n  ${wrong.join('\n  ')}`);
    console.log(`all manifests at ${version}`);
  } else if (command === 'updates' && xpiUrl) {
    console.log(JSON.stringify(firefoxUpdates(version, xpiUrl), null, 2));
  } else {
    throw new Error('usage: release-meta.mjs check <tag> | updates <tag> <xpi-url>');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
