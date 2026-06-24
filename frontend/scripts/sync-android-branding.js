import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'images', 'logo_gd.png');
const resDir = join(root, 'android', 'app', 'src', 'main', 'res');
const splashDest = join(resDir, 'drawable-nodpi', 'splash_logo.png');
const BRAND_BG = { r: 38, g: 50, b: 56, alpha: 255 }; // #263238

/** Mismo ratio que .logo-box en portal.css (14px / 90px) */
const LOGO_RADIUS_RATIO = 14 / 90;

const LAUNCHER_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

function roundedMaskSvg(size, radius) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );
}

async function roundedLogo(size) {
  const radius = Math.max(2, Math.round(size * LOGO_RADIUS_RATIO));
  const resized = await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(resized)
    .composite([{ input: roundedMaskSvg(size, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function iconOnBrandBg(canvasSize, logoSize) {
  const logoBuf = await roundedLogo(logoSize);
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logoBuf, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function writeLauncherIcon(folder, size) {
  const outDir = join(resDir, folder);
  mkdirSync(outDir, { recursive: true });
  const logoSize = Math.round(size * 0.82);
  const iconBuf = await iconOnBrandBg(size, logoSize);

  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(iconBuf).toFile(join(outDir, name));
  }
}

mkdirSync(dirname(splashDest), { recursive: true });
const splashLogoPx = 480;
await sharp(await roundedLogo(splashLogoPx)).toFile(splashDest);

for (const [folder, size] of Object.entries(LAUNCHER_SIZES)) {
  await writeLauncherIcon(folder, size);
}

console.log('sync-android-branding: splash + iconos con esquinas redondeadas (14/90)');
