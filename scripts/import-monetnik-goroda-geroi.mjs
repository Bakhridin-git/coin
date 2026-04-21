/**
 * Импорт: Monetnik mainViewLot_2x → public/images/coins/{slug}-{side}.jpg
 * Аверс/реверс: первый URL в паре — аверс, второй — реверс (как на Монетнике по возрастанию id файла).
 * Ранее использовался MSE к эталонам — давал неверные стороны.
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'assets', 'raw-photos', '_import-monetnik-gg');
const OUT = path.join(ROOT, 'public', 'images', 'coins');

const SIZE = 900;
const JPEG_QUALITY = 82;

/** @type {Array<{ slug: string; urls: [string, string] }>} */
const LOTS = [
  {
    slug: '2r-2000-novorossiysk',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/66/40/739966/2615717_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/66/40/739966/2615718_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-tula',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/62/65/739962/2615699_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/62/65/739962/2615700_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-murmansk',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/30/62/704830/2502769_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/30/62/704830/2502770_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-stalingrad',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/06/53/862006/3040856_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/06/53/862006/3040857_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2017-gorod-geroy-kerch',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/86/60/52986/164536_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/86/60/52986/164541_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2017-gorod-geroy-sevastopol',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/87/34/52987/164539_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/87/34/52987/164540_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-leningrad',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/05/07/862005/3040852_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/05/07/862005/3040853_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-moskva',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/02/74/148602/480084_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/02/74/148602/480085_mainViewLot_2x.jpg',
    ],
  },
  {
    slug: '2r-2000-smolensk',
    urls: [
      'https://cdn.monetnik.ru/storage/market-lot/15/27/704815/2502725_mainViewLot_2x.jpg',
      'https://cdn.monetnik.ru/storage/market-lot/15/27/704815/2502726_mainViewLot_2x.jpg',
    ],
  },
];

async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function processFace(buf) {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const side = Math.min(w, h);
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);
  return sharp(buf)
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { fit: 'fill' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function main() {
  await mkdir(TMP, { recursive: true });
  await mkdir(OUT, { recursive: true });

  for (const lot of LOTS) {
    const bufs = await Promise.all(lot.urls.map((u) => fetchBuf(u)));
    const obPath = path.join(OUT, `${lot.slug}-obverse.jpg`);
    const revPath = path.join(OUT, `${lot.slug}-reverse.jpg`);
    await writeFile(obPath, await processFace(bufs[0]));
    await writeFile(revPath, await processFace(bufs[1]));
    console.log(`${lot.slug}: urls[0]=obverse urls[1]=reverse → OK`);
  }

  await rm(TMP, { recursive: true, force: true });
  console.log(`\nГотово: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
