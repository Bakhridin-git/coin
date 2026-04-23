/**
 * Читает PNG/JPEG/WebP/AVIF из каталога исходников, центрированно обрезает квадрат,
 * приводит к 900×900, сохраняет JPEG в каталог результата (по умолчанию public/images/coins).
 *
 * Имена выходных файлов:
 *   • data/photo-file-map.csv — колонки filename,out_stem → {out_stem}.jpg (точное имя файла-исходника)
 *   • авто: 10r-…-obverse_*.jpg / 10r-…-reverse_*.jpg → {slug}-obverse.jpg и т.д.
 *   • data/photo-mapping.csv — по индексу (index,out_stem или index,slug,side) для снимков по порядку сортировки
 *
 * По умолчанию: assets/raw-photos → public/images/coins
 * Переопределение: PHOTOS_INPUT, PHOTOS_OUTPUT (пути от корня репозитория)
 *
 * Запуск: npm run photos:process
 */

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const INPUT_DIR = process.env.PHOTOS_INPUT
  ? path.join(ROOT, process.env.PHOTOS_INPUT)
  : path.join(ROOT, 'assets', 'raw-photos');
const OUTPUT_DIR = process.env.PHOTOS_OUTPUT
  ? path.join(ROOT, process.env.PHOTOS_OUTPUT)
  : path.join(ROOT, 'public', 'images', 'coins');
const MAPPING_PATH = process.env.PHOTO_MAPPING
  ? path.join(ROOT, process.env.PHOTO_MAPPING)
  : path.join(ROOT, 'data', 'photo-mapping.csv');
const FILE_MAP_PATH = process.env.PHOTO_FILE_MAP
  ? path.join(ROOT, process.env.PHOTO_FILE_MAP)
  : path.join(ROOT, 'data', 'photo-file-map.csv');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'photo-process-manifest.csv');

const SIZE = 900;
const JPEG_QUALITY = 82;

/** Не перезаписывать уже лежащие в public JPEG (новые партии только дополняют). Перезапись: PHOTOS_OVERWRITE=1 */
const SKIP_EXISTING_OUTPUT = process.env.PHOTOS_OVERWRITE !== '1';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

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

/**
 * filename,out_stem — out_stem без .jpg (полное имя вида 10r-…-obverse).
 * @returns {Map<string, string>}
 */
function parseFileMap(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  /** @type {Map<string, string>} */
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    let filename = line.slice(0, comma).trim();
    let stem = line.slice(comma + 1).trim();
    if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1).replace(/""/g, '"');
    if (stem.startsWith('"') && stem.endsWith('"')) stem = stem.slice(1, -1).replace(/""/g, '"');
    if (filename && stem) map.set(filename, stem);
  }
  return map;
}

/**
 * 10r-…-obverse_… / 10r-…-reverse.… → полный stem для .jpg
 * @param {string} basename
 * @returns {string | null}
 */
function autoStemFromCoinFilename(basename) {
  const base = basename.replace(/\.[^.]+$/i, '');
  const obv = base.lastIndexOf('-obverse');
  const rev = base.lastIndexOf('-reverse');
  if (obv !== -1 && rev !== -1) {
    const useObv = obv > rev;
    return useObv ? base.slice(0, obv + '-obverse'.length) : base.slice(0, rev + '-reverse'.length);
  }
  if (obv !== -1) return base.slice(0, obv + '-obverse'.length);
  if (rev !== -1) return base.slice(0, rev + '-reverse'.length);
  return null;
}

async function loadMapping() {
  try {
    const text = await readFile(MAPPING_PATH, 'utf8');
    return parseMapping(text);
  } catch {
    return new Map();
  }
}

async function loadFileMap() {
  try {
    const text = await readFile(FILE_MAP_PATH, 'utf8');
    return parseFileMap(text);
  } catch {
    return new Map();
  }
}

function mappedToLogFields(mapped) {
  if (mapped.mode === 'stem') return { slug: mapped.stem, side: '' };
  return { slug: mapped.slug, side: mapped.side };
}

/**
 * @param {{ mode: 'stem'; stem: string } | { mode: 'slug'; slug: string; side: string }} mapped
 * @returns {string}
 */
function stemFromMapped(mapped) {
  if (mapped.mode === 'stem') return mapped.stem;
  return `${mapped.slug}-${mapped.side}`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const mapping = await loadMapping();
  const fileMap = await loadFileMap();

  const names = (await readdir(INPUT_DIR))
    .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'ru'));

  if (names.length === 0) {
    console.error(`Нет изображений в: ${INPUT_DIR}`);
    process.exit(1);
  }

  const rows = ['index,source_file,output_file,slug,side'];
  const skipped = [];

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

    let stem;
    let slugOut = '';
    let sideOut = '';
    const fromFile = fileMap.get(name);
    const fromAuto = autoStemFromCoinFilename(name);
    const fromIndex = mapping.get(index);

    if (fromFile) {
      stem = fromFile;
      slugOut = stem;
    } else if (fromAuto) {
      stem = fromAuto;
      slugOut = stem;
    } else if (fromIndex) {
      stem = stemFromMapped(fromIndex);
      const log = mappedToLogFields(fromIndex);
      slugOut = log.slug;
      sideOut = log.side;
    } else {
      skipped.push(name);
      continue;
    }

    const outName = `${stem}.jpg`;
    const outputPath = path.join(OUTPUT_DIR, outName);

    if (SKIP_EXISTING_OUTPUT) {
      try {
        await access(outputPath);
        console.log(`Пропуск (файл уже есть): ${outName} ← ${name}`);
        continue;
      } catch {
        /* write */
      }
    }

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
  if (skipped.length > 0) {
    console.log(`\nПропущено (нет строки в ${path.basename(FILE_MAP_PATH)}, не распознано имя и нет index в photo-mapping): ${skipped.length} файл(ов)`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (mapping.size === 0 && fileMap.size === 0) {
    console.log(
      `\nПодсказка: задайте data/photo-file-map.csv или имена вида 10r-…-obverse_… / …-reverse_…, либо data/photo-mapping.csv`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
