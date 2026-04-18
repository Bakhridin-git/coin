/**
 * Читает PNG/JPEG из «Необработанные фото», центрированно обрезает квадрат,
 * приводит к 900×900, сохраняет JPEG в «Обработанные».
 *
 * Имена: data/photo-mapping.csv
 *   • формат A: index,out_stem → файл {out_stem}.jpg
 *   • формат B: index,slug,side → файл {slug}-{side}.jpg
 * Без маппинга: 001.jpg, 002.jpg, …
 *
 * Запуск: npm run photos:process
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INPUT_DIR = path.join(ROOT, 'Необработанные фото');
const OUTPUT_DIR = path.join(ROOT, 'Обработанные');
const MAPPING_PATH = path.join(ROOT, 'data', 'photo-mapping.csv');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.csv');

const SIZE = 900;
const JPEG_QUALITY = 82;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * @returns {Map<number, { mode: 'stem'; stem: string } | { mode: 'slug'; slug: string; side: string }>}
 */
function parseMapping(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const header = lines[0].split(',').map((h) => h.trim());
  const idxIndex = header.indexOf('index');
  const stemIdx = header.indexOf('out_stem');
  const slugIdx = header.indexOf('slug');
  const sideIdx = header.indexOf('side');

  /** @type {Map<number, { mode: 'stem'; stem: string } | { mode: 'slug'; slug: string; side: string }>} */
  const map = new Map();

  if (idxIndex < 0) return map;

  if (stemIdx >= 0) {
    for (let i = 1; i < lines.length; i++) {
      const parts = splitCsvLine(lines[i]);
      const index = Number.parseInt(parts[idxIndex], 10);
      if (!Number.isFinite(index)) continue;
      const stem = parts[stemIdx]?.trim();
      if (stem) map.set(index, { mode: 'stem', stem });
    }
    return map;
  }

  if (slugIdx >= 0 && sideIdx >= 0) {
    for (let i = 1; i < lines.length; i++) {
      const parts = splitCsvLine(lines[i]);
      const index = Number.parseInt(parts[idxIndex], 10);
      if (!Number.isFinite(index)) continue;
      const slug = parts[slugIdx]?.trim();
      const side = parts[sideIdx]?.trim();
      if (slug && side) map.set(index, { mode: 'slug', slug, side });
    }
  }
  return map;
}

/** Minimal CSV split (no quoted commas inside fields for mapping file). */
function splitCsvLine(line) {
  return line.split(',').map((c) => c.trim());
}

async function loadMapping() {
  try {
    const text = await readFile(MAPPING_PATH, 'utf8');
    return parseMapping(text);
  } catch {
    return new Map();
  }
}

function mappedToFilename(mapped) {
  if (mapped.mode === 'stem') return `${mapped.stem}.jpg`;
  return `${mapped.slug}-${mapped.side}.jpg`;
}

function mappedToLogFields(mapped) {
  if (mapped.mode === 'stem') return { slug: mapped.stem, side: '' };
  return { slug: mapped.slug, side: mapped.side };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const mapping = await loadMapping();

  const names = (await readdir(INPUT_DIR))
    .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'ru'));

  if (names.length === 0) {
    console.error(`Нет изображений в: ${INPUT_DIR}`);
    process.exit(1);
  }

  const rows = ['index,source_file,output_file,slug,side'];

  let index = 0;
  for (const name of names) {
    index += 1;
    const inputPath = path.join(INPUT_DIR, name);
    const meta = await sharp(inputPath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) {
      console.warn(`Пропуск (нет размеров): ${name}`);
      continue;
    }

    const sideLen = Math.min(w, h);
    const left = Math.floor((w - sideLen) / 2);
    const top = Math.floor((h - sideLen) / 2);

    const mapped = mapping.get(index);
    let outName;
    let slugOut = '';
    let sideOut = '';
    if (mapped) {
      outName = mappedToFilename(mapped);
      const log = mappedToLogFields(mapped);
      slugOut = log.slug;
      sideOut = log.side;
    } else {
      outName = `${String(index).padStart(3, '0')}.jpg`;
    }

    const outputPath = path.join(OUTPUT_DIR, outName);

    await sharp(inputPath)
      .extract({ left, top, width: sideLen, height: sideLen })
      .resize(SIZE, SIZE, { fit: 'fill' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outputPath);

    rows.push(
      `${index},"${name.replace(/"/g, '""')}","${outName}","${slugOut}","${sideOut}"`
    );
    console.log(`${index}/${names.length} ${name} → ${outName}`);
  }

  await writeFile(MANIFEST_PATH, rows.join('\n'), 'utf8');
  console.log(`\nГотово: ${OUTPUT_DIR}`);
  console.log(`Манифест: ${MANIFEST_PATH}`);
  if (mapping.size === 0) {
    console.log(
      '\nПодпись: задайте data/photo-mapping.csv (index,out_stem или index,slug,side) и перезапустите npm run photos:process'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
