/**
 * Assemble per-browser builds into dist/<browser>/ and zip them.
 *
 * Usage:  node scripts/build.mjs [chrome|firefox]     (no arg = both)
 *
 * One source tree, two manifests: src/manifest.<browser>.json is copied to
 * dist/<browser>/manifest.json and everything else in src/ is copied as-is
 * (minus the other browser's manifest), plus install/<browser>.txt as
 * INSTALL.txt. The Chrome build is loaded unpacked
 * straight from dist/chrome/; the Firefox zip goes off for self-host signing.
 */
import { cp, mkdir, rm, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const installText = path.join(root, 'install');
const dist = path.join(root, 'dist');

const BROWSERS = ['chrome', 'firefox'];
const wanted = process.argv[2] ? [process.argv[2]] : BROWSERS;
for (const b of wanted) {
  if (!BROWSERS.includes(b)) {
    console.error(`unknown browser "${b}" — expected chrome or firefox`);
    process.exit(1);
  }
}

function zip(folder, outFile) {
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path "${folder}\\*" -DestinationPath "${outFile}" -Force`,
    ]);
  } else {
    execFileSync('zip', ['-qr', outFile, '.'], { cwd: folder });
  }
}

for (const browser of wanted) {
  const out = path.join(dist, browser);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(src, out, {
    recursive: true,
    filter: (p) => !path.basename(p).startsWith('manifest.') || p.endsWith(`manifest.${browser}.json`),
  });
  await rename(path.join(out, `manifest.${browser}.json`), path.join(out, 'manifest.json'));
  // Plain-text install steps, so whoever unzips the build has them to hand.
  await cp(path.join(installText, `${browser}.txt`), path.join(out, 'INSTALL.txt'));

  const zipPath = path.join(dist, `djcratebuilder-${browser}.zip`);
  await rm(zipPath, { force: true });
  zip(out, zipPath);
  console.log(`${browser}: dist/${browser}/ + ${path.basename(zipPath)}`);
}
