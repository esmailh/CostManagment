import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'public', 'favicon.svg');
const outDir = resolve(root, 'public', 'icons');
const androidRes = resolve(root, 'android', 'app', 'src', 'main', 'res');

await mkdir(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  await sharp(src).resize(size, size).png().toFile(resolve(outDir, name));
  console.log(`generated icons/${name} (${size}x${size})`);
}

const androidTargets = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

// Legacy launchers use the full artwork. Adaptive launchers use a generously
// padded foreground so Android's circle, squircle and rounded-square masks all
// preserve the wallet and coin.
for (const [density, launcherSize, foregroundSize] of androidTargets) {
  const densityDir = resolve(androidRes, `mipmap-${density}`);
  await mkdir(densityDir, { recursive: true });

  const launcher = sharp(src).resize(launcherSize, launcherSize).png();
  await launcher.clone().toFile(resolve(densityDir, 'ic_launcher.png'));
  await launcher.clone().toFile(resolve(densityDir, 'ic_launcher_round.png'));

  const artworkSize = Math.round(foregroundSize * 0.66);
  const padding = Math.floor((foregroundSize - artworkSize) / 2);
  const foreground = await sharp(src)
    .resize(artworkSize, artworkSize)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: foregroundSize,
      height: foregroundSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: padding, top: padding }])
    .png()
    .toFile(resolve(densityDir, 'ic_launcher_foreground.png'));

  console.log(`generated Android ${density} launcher assets`);
}

console.log('Done.');
