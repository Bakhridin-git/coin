/**
 * Переименовывает файлы в assets/raw-photos:
 * «{название из coins.csv} — аверс|реверс.{расширение}»
 *
 * Источники соответствий: data/photo-file-map.csv (filename → out_stem),
 * плюс авто: имена вида 10r-…-obverse_* / …-reverse_* (Monetnik).
 *
 * Файлы без привязки: «Неподписанный снимок — {время из имени}.png» или «Лот 740148 — …».
 *
 * По умолчанию переименовываются только файлы из data/photo-file-map.csv, MANUAL_RU_TITLE
 * и имена, начинающиеся с «Неподписанный» (чтобы не трогать чужие лоты и скриншоты).
 * Полная папка: node scripts/rename-raw-photos-ru.mjs --all
 *
 * Запуск: node scripts/rename-raw-photos-ru.mjs
 */

import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw-photos');
const COINS_CSV = path.join(ROOT, 'data', 'coins.csv');
const FILE_MAP = path.join(ROOT, 'data', 'photo-file-map.csv');

/** Полное русское имя без slug (редкие случаи: типовой аверс без реверса на снимке). */
const MANUAL_RU_TITLE = new Map([
  [
    'Неподписанный снимок — 14.58.04.png',
    'Типовой аверс памятных 10 ₽ 2002 (реверс на снимке не показан)'
  ],
  [
    'Типовой аверс памятных 10 ₽ 2002 (реверс на снимке не показан).png',
    'Типовой аверс памятных 10 ₽ 2002 (реверс на снимке не показан)'
  ]
]);

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

/** @param {string} line */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** @returns {Map<string, string>} slug → название */
async function loadCoinNames() {
  const raw = await readFile(COINS_CSV, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const iSlug = header.indexOf('slug');
  const iName = header.indexOf('название');
  if (iSlug < 0 || iName < 0) throw new Error('coins.csv: нужны колонки slug и название');
  /** @type {Map<string, string>} */
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const slug = cells[iSlug]?.trim();
    const name = cells[iName]?.trim();
    if (slug) map.set(slug, name || slug);
  }
  return map;
}

/** @returns {Map<string, string>} basename → out_stem */
async function loadFileMap() {
  try {
    const text = await readFile(FILE_MAP, 'utf8');
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
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
  } catch {
    return new Map();
  }
}

/**
 * Совпадение с картой для дубликатов «… — аверс (2).png», если в CSV есть только «… — аверс.png».
 * @param {string} basename
 * @param {Map<string, string>} fileMap
 * @returns {string | null}
 */
function stemFromFileMapWithDuplicateSuffix(basename, fileMap) {
  const direct = fileMap.get(basename);
  if (direct) return direct;
  const fromAuto = autoStemFromCoinFilename(basename);
  if (fromAuto) return fromAuto;
  const ext = path.extname(basename);
  const base = basename.slice(0, -ext.length);
  const stripped = base.replace(/ \(\d+\)$/, '');
  if (stripped === base) return null;
  return fileMap.get(stripped + ext) ?? autoStemFromCoinFilename(stripped + ext);
}

/** @param {string} basename */
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

/** @param {string} stem */
function stemToSlugAndSide(stem) {
  if (stem.endsWith('-obverse')) {
    return { slug: stem.slice(0, -'-obverse'.length), side: 'obverse' };
  }
  if (stem.endsWith('-reverse')) {
    return { slug: stem.slice(0, -'-reverse'.length), side: 'reverse' };
  }
  return null;
}

/** @param {string} s */
function sanitizeFileBase(s) {
  const t = s
    .replace(/[\\/:*?"<>|]/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
  return t || 'без названия';
}

/** @param {string} basename */
function unmappedLabel(basename) {
  if (basename.startsWith('740148')) {
    return null;
  }
  const m = basename.match(/в\s+(\d{1,2}\.\d{1,2}\.\d{1,2})/);
  if (m) {
    return `Неподписанный снимок — ${m[1]}`;
  }
  return `Неподписанный — ${basename.replace(/\.[^.]+$/, '')}`;
}

function sideRu(side) {
  return side === 'obverse' ? 'аверс' : 'реверс';
}

/** @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Порядок в группе дубликатов: «… — аверс.png» → 1, «… — аверс (2).png» → 2, …
 * @param {string} basename
 * @param {string} targetBase
 * @param {string} ext
 */
function duplicateRank(basename, targetBase, ext) {
  if (basename === `${targetBase}${ext}`) return 1;
  const re = new RegExp(
    `^${escapeRegExp(targetBase)} \\((\\d+)\\)${escapeRegExp(ext)}$`
  );
  const m = basename.match(re);
  if (m) return Number.parseInt(m[1], 10);
  return 1_000_000;
}

/**
 * @param {string} basename
 * @param {boolean} processAll
 * @param {Map<string, string>} fileMap
 */
function shouldProcessBasename(basename, processAll, fileMap) {
  if (processAll) return true;
  if (fileMap.has(basename)) return true;
  if (MANUAL_RU_TITLE.has(basename)) return true;
  if (basename.startsWith('Неподписанный')) return true;
  return false;
}

/**
 * @param {Map<string, string>} original
 * @param {{ from: string; to: string; stem: string }[]} plan
 */
function mergeFileMapAfterRenames(original, plan) {
  const m = new Map(original);
  for (const p of plan) {
    if (p.from === p.to) continue;
    const stem =
      (p.stem && String(p.stem).length > 0 ? p.stem : null) ??
      m.get(p.from) ??
      stemFromFileMapWithDuplicateSuffix(p.from, m) ??
      autoStemFromCoinFilename(p.from);
    m.delete(p.from);
    if (stem) m.set(p.to, stem);
  }
  return m;
}

async function main() {
  const processAll = process.argv.includes('--all');
  const names = await loadCoinNames();
  const fileMap = await loadFileMap();
  const dirFiles = (await readdir(RAW))
    .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'ru'));

  /** @type {{ from: string; targetBase: string; ext: string; stem: string }[]} */
  const candidates = [];

  for (const basename of dirFiles) {
    if (!shouldProcessBasename(basename, processAll, fileMap)) continue;
    const manualTitle = MANUAL_RU_TITLE.get(basename);
    const stem = stemFromFileMapWithDuplicateSuffix(basename, fileMap);
    let targetBase;
    let stemOut = stem ?? '';

    if (manualTitle) {
      targetBase = sanitizeFileBase(manualTitle);
      stemOut = '';
    } else if (stem) {
      const parsed = stemToSlugAndSide(stem);
      if (parsed) {
        const title = names.get(parsed.slug) ?? parsed.slug;
        targetBase = `${sanitizeFileBase(title)} — ${sideRu(parsed.side)}`;
      } else {
        targetBase = sanitizeFileBase(stem);
      }
    } else if (basename.startsWith('740148')) {
      const order = ['740148_big.avif', '740148_big.jpg', '740148_mainViewLot_2x.jpg'];
      const idx = order.indexOf(basename);
      const n = idx >= 0 ? idx + 1 : 1;
      targetBase = sanitizeFileBase(`Лот Monetnik 740148 — вариант ${n}`);
    } else {
      const u = unmappedLabel(basename);
      targetBase = u ? sanitizeFileBase(u) : sanitizeFileBase(basename);
    }

    const ext = path.extname(basename);
    candidates.push({ from: basename, targetBase, ext, stem: stemOut });
  }

  /** @type {Map<string, { from: string; targetBase: string; ext: string; stem: string }[]>} */
  const byKey = new Map();
  for (const c of candidates) {
    const key = `${c.targetBase}\0${c.ext}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(c);
  }

  /** @type {{ from: string; to: string; stem: string }[]} */
  const plan = [];

  for (const group of byKey.values()) {
    const { targetBase, ext } = group[0];
    group.sort((a, b) => {
      const ra = duplicateRank(a.from, a.targetBase, a.ext);
      const rb = duplicateRank(b.from, b.targetBase, b.ext);
      if (ra !== rb) return ra - rb;
      return a.from.localeCompare(b.from, 'ru');
    });
    for (let j = 0; j < group.length; j += 1) {
      const finalName =
        j === 0 ? `${targetBase}${ext}` : `${targetBase} (${j + 1})${ext}`;
      plan.push({ from: group[j].from, to: finalName, stem: group[j].stem });
    }
  }

  plan.sort((a, b) => a.from.localeCompare(b.from, 'ru'));

  /** Двухфазное переименование, чтобы не затереть */
  const tmpPrefix = '.__tmp_ru_';
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.from === p.to) continue;
    await rename(path.join(RAW, p.from), path.join(RAW, `${tmpPrefix}${i}${path.extname(p.from)}`));
  }
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (p.from === p.to) continue;
    await rename(path.join(RAW, `${tmpPrefix}${i}${path.extname(p.from)}`), path.join(RAW, p.to));
  }

  const mergedMap = mergeFileMapAfterRenames(fileMap, plan);
  const newRows = ['filename,out_stem'];
  for (const [fn, stem] of [...mergedMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'ru')
  )) {
    newRows.push(`"${fn.replace(/"/g, '""')}",${stem}`);
  }
  await writeFile(FILE_MAP, newRows.join('\n') + '\n', 'utf8');

  console.log(`Переименовано в: ${RAW}${processAll ? ' (--all)' : ''}`);
  for (const p of plan) {
    if (p.from !== p.to) console.log(`  ${p.from} → ${p.to}`);
  }
  console.log(`\nОбновлён ${path.relative(ROOT, FILE_MAP)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
