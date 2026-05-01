/**
 * Одноразово: добавляет в data/photo-file-map.csv строки для сырья
 * «Российская (советская) мультипликация» из assets/raw-photos.
 * Запуск: node scripts/append-multipi-photo-map.mjs
 */
import { readdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw-photos');
const FILE_MAP = path.join(ROOT, 'data', 'photo-file-map.csv');

/** Длинные названия первыми — однозначный префикс. */
const ENTRIES = [
  ['Весёлая карусель № 1 Антошка', '25r-2022-veselaya-karusel-1', '25r-2022-vesyolaya-karusel-1-antoshka-cvetnoe'],
  ['Иван Царевич и Серый Волк', '25r-2022-ivan-tsarevich-i-seryy-volk', '25r-2022-ivan-tsarevich-i-seryy-volk-cvetnoe'],
  ['Бременские музыканты', '25r-2019-bremenskie-muzykanty', '25r-2019-bremenskie-muzykanty-cvetnoe'],
  ['Крокодил Гена', '25r-2020-krokodil-gena', '25r-2020-krokodil-gena-cvetnoe'],
  ['Маша и Медведь', '25r-2021-masha-i-medved', '25r-2021-masha-i-medved-cvetnoe'],
  ['Дед Мороз и лето', '25r-2019-ded-moroz-i-leto', '25r-2019-ded-moroz-i-leto-cvetnoe'],
  ['Ёжик в тумане', '25r-2024-ezhik-v-tumane', '25r-2024-yozhik-v-tumane-cvetnoe'],
  ['Алёнький цветочек', '25r-2023-alenkiy-tsvetochek', '25r-2023-alyonkiy-tsvetochek-cvetnoe'],
  ['Ну, погоди!', '25r-2018-nu-pogodi', '25r-2018-nu-pogodi-cvetnoe'],
  ['Три богатыря', '25r-2017-tri-bogatyrya', '25r-2017-tri-bogatyrya-v-spetsialnom-ispolnenii'],
  ['Винни-Пух', '25r-2017-vinni-pukh', '25r-2017-vinni-pukh-mmd'],
  ['Смешарики', '25r-2023-smeshariki', '25r-2023-smeshariki-cvetnoe'],
  ['Барбоскины', '25r-2020-barboskiny', '25r-2020-barboskiny-cvetnoe'],
  ['Фиксики', '25r-2025-fiksiki', '25r-2025-fiksiki-cvetnoe'],
  ['Умка', '25r-2021-umka', '25r-2021-umka-cvetnoe'],
];

function escapeCsvField(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * NFC + и + U+0306 → й (как на диске в «Серый»). Без NFKC: он меняет «№» на «No»
 * и рвёт префикс «Весёлая карусель № 1…».
 */
function normKey(s) {
  return s.normalize('NFC').replace(/\u0438\u0306/g, '\u0439');
}

function matchEntry(normName) {
  const nk = normKey(normName);
  for (const [title, baseSlug, colorSlug] of ENTRIES) {
    const prefix = `${normKey(title)} `;
    if (nk.startsWith(prefix)) return { baseSlug, colorSlug, rest: nk.slice(prefix.length) };
  }
  return null;
}

function parseLine(rest) {
  const isColor = /цветная|цвентная/i.test(rest);
  /** \b в JS не работает для кириллицы — только префикс после названия. */
  const obv = rest.startsWith('аверс');
  const rev = rest.startsWith('реверс') || rest.startsWith('раверс');
  return { isColor, obv, rev };
}

async function main() {
  const existing = await readFile(FILE_MAP, 'utf8');
  const names = (await readdir(RAW))
    .filter((n) => /\.(avif|png|jpe?g|webp)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const linesToAdd = [];
  for (const name of names) {
    const norm = normKey(name);
    const m = matchEntry(norm);
    if (!m) continue;
    const { rest } = m;
    const { isColor, obv, rev } = parseLine(rest);
    if ((obv && rev) || (!obv && !rev)) {
      console.warn(`Пропуск (неясная сторона): ${name}`);
      continue;
    }
    const slug = isColor ? m.colorSlug : m.baseSlug;
    const stem = `${slug}-${obv ? 'obverse' : 'reverse'}`;
    const row = `${escapeCsvField(name)},${stem}`;
    if (existing.includes(`${name},`) || existing.includes(`"${name.replace(/"/g, '""')}",`)) {
      console.log(`Уже в карте: ${name}`);
      continue;
    }
    linesToAdd.push(row);
  }

  if (linesToAdd.length === 0) {
    console.log('Нечего добавлять.');
    return;
  }
  await appendFile(FILE_MAP, `\n${linesToAdd.join('\n')}`, 'utf8');
  console.log(`Добавлено строк: ${linesToAdd.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
