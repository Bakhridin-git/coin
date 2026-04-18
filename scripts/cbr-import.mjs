#!/usr/bin/env node
// scripts/cbr-import.mjs
// Импорт памятных монет Банка России по годам в data/coins.csv.
// Источник: https://www.cbr.ru/cash_circulation/memorable_coins/coins_base/
//
// Использование:
//   node scripts/cbr-import.mjs --from 1992 --to 1992
//   node scripts/cbr-import.mjs --year 1992
//   node scripts/cbr-import.mjs --from 1992 --to 2026 --no-images   (только csv)
//   node scripts/cbr-import.mjs --enrich-csv --from 1992 --to 2026   (дозаполнить аверс/реверс/тираж из ЦБ)
//   node scripts/cbr-import.mjs --enrich-csv --mintage-only --from 1992 --to 2026  (только тираж для нулей)
//   node scripts/cbr-import.mjs --enrich-csv --force --from 2010 --to 2010  (перезаписать поля)
//
// Идемпотентен: существующие slug'и в data/coins.csv не перезаписываются.
// HTML-страницы кешируются в tmp/cbr-cache/ (повторный запуск — offline).

import { readFile, writeFile, mkdir, access, appendFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, 'tmp', 'cbr-cache');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'coins');
const CSV_PATH = path.join(ROOT, 'data', 'coins.csv');

const BASE = 'https://www.cbr.ru';
const LIST_URL = (year) =>
  `${BASE}/cash_circulation/memorable_coins/coins_base/?UniDbQuery.Posted=True&UniDbQuery.year=${year}`;
const COIN_URL = (cat) =>
  `${BASE}/cash_circulation/memorable_coins/coins_base/ShowCoins/?cat_num=${cat}`;
const IMG_URL = (cat, side) =>
  `${BASE}/legacy/PhotoStore/img/${cat}${side === 'reverse' ? 'r' : ''}.jpg`;

const UA = 'Mozilla/5.0 (numizmatrf-importer) Node';

// --------------------------- cli -----------------------------
function parseArgs(argv) {
  const a = { from: null, to: null, images: true, enrich: false, force: false, mintageOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--year') a.from = a.to = Number(argv[++i]);
    else if (v === '--from') a.from = Number(argv[++i]);
    else if (v === '--to') a.to = Number(argv[++i]);
    else if (v === '--no-images') a.images = false;
    else if (v === '--enrich-csv') a.enrich = true;
    else if (v === '--force') a.force = true;
    else if (v === '--mintage-only') a.mintageOnly = true;
  }
  if (!a.from) a.from = 1992;
  if (!a.to) a.to = a.from;
  if (a.from > a.to) throw new Error(`--from ${a.from} > --to ${a.to}`);
  return a;
}

// --------------------------- fetch helpers -----------------------------
async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCached(url, cacheFile) {
  if (await fileExists(cacheFile)) {
    return readFile(cacheFile, 'utf8');
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const html = await res.text();
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, html, 'utf8');
  await sleep(250);
  return html;
}

async function downloadBinary(url, outFile) {
  if (await fileExists(outFile)) return true;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return false;
  await mkdir(path.dirname(outFile), { recursive: true });
  await pipeline(res.body, createWriteStream(outFile));
  await sleep(150);
  return true;
}

// --------------------------- translit -----------------------------
const TR = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',
  ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
};
function translit(input) {
  return input.toLowerCase().split('').map((ch) => TR[ch] ?? ch).join('');
}
function toSlug(s) {
  return translit(s)
    .replace(/[«»"'‘’"".,!?()\[\]:;/\\]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// --------------------------- parser: список по году -----------------------------
// Страница года содержит <tr>'ы с ссылкой ShowCoins/?cat_num=XXXX и заголовками
// секций-серий перед группами. Парсим последовательно по порядку DOM.
function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Список монет по году из CBR. Структура страницы:
 *   <div class="database-coins _list-wrap">
 *     <div class="coins-list table-tr-link">
 *       [<div class="database-coins_series-name">Серия</div>]  // для групп с серией
 *       <table class="data">
 *         <tbody>
 *           <tr data-tr-link="ShowCoins/?cat_num=XXXX">
 *             <td class="coins-list_item_image">...</td>
 *             <td class="coins-list_item_face-value">1 рубль</td>
 *             <td class="coins-list_item_name">Наименование</td>
 *             <td class="coins-list_item_metall">мельхиор</td>
 *             <td class="coins-list_item_number">5009-0001</td>
 *             <td class="coins-list_item_date">10.06.1992</td>
 *           </tr>
 *           ...
 *         </tbody>
 *       </table>
 *     </div>
 *     <div class="coins-list table-tr-link">...</div>  // следующая серия
 *   </div>
 *
 * @param {string} html
 * @returns {{catNum:string, denomination:string, name:string, material:string, series:string, releaseDate:string}[]}
 */
function parseYearList(html) {
  const rows = [];
  const listStart = html.indexOf('database-coins _list-wrap');
  if (listStart === -1) return rows;
  // Ограничим область до закрывающего footer.
  const endMarker = html.indexOf('Страница была полезной', listStart);
  const region = html.slice(listStart, endMarker > -1 ? endMarker : html.length);

  const groupRe = /<div\s+class="coins-list\s+table-tr-link">([\s\S]*?)(?=<div\s+class="coins-list\s+table-tr-link">|$)/g;
  let g;
  while ((g = groupRe.exec(region))) {
    const group = g[1];

    const seriesMatch = group.match(/<div\s+class="database-coins_series-name">([\s\S]*?)<\/div>/);
    const series = seriesMatch ? stripTags(decodeHtml(seriesMatch[1])) : 'Без серии';

    const trRe = /<tr\s+data-tr-link="ShowCoins\/\?cat_num=([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
    let t;
    while ((t = trRe.exec(group))) {
      const catNum = t[1];
      const trHtml = t[2];
      const pick = (cls) => {
        const m = trHtml.match(new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`));
        return m ? stripTags(decodeHtml(m[1])) : '';
      };
      rows.push({
        catNum,
        denomination: pick('coins-list_item_face-value'),
        name: pick('coins-list_item_name'),
        material: pick('coins-list_item_metall'),
        series,
        releaseDate: pick('coins-list_item_date')
      });
    }
  }
  return rows;
}

// --------------------------- parser: карточка монеты -----------------------------
// Все параметры выведены подряд одной строкой в формате "Метка значение Метка значение ...".
// Собираем большой alternation-regex всех меток и разбиваем строку на (label, value).
const FIELD_LABELS = [
  'Каталожный номер',
  'Дата выпуска',
  'Номинал',
  'Качество',
  'Сплав',
  'Металл, проба',
  'Металл',
  'Масса общая, г',
  'Содержание химически чистого металла не менее, г',
  'Диаметр, мм',
  'Толщина, мм',
  'Тираж, шт.',
  'Аверс',
  'Реверс',
  'Авторы',
  'Страница была полезной'
];
function parseCoinPage(html) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = stripTags(decodeHtml(clean));

  // Первое вхождение — блок характеристик монеты. lastIndexOf ломал разбор:
  // в «Историко-тематической справке» снова встречается «Каталожный номер», и
  // поля Аверс/Реверс оказывались вне body.
  const start = text.indexOf('Каталожный номер');
  const end = text.indexOf('Страница была полезной');
  const body = text.slice(start, end > -1 ? end : text.length);

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelAlt = FIELD_LABELS.map(escape).join('|');
  const tokenRe = new RegExp(`(${labelAlt})\\s+([\\s\\S]*?)(?=\\s+(?:${labelAlt})|$)`, 'g');

  const fields = {};
  let m;
  while ((m = tokenRe.exec(body))) {
    fields[m[1]] = (m[2] || '').trim();
  }

  // "Авторы" содержит вложенные подметки: "Художник: …", "Чеканка: …", "Оформление гурта: …".
  const authors = fields['Авторы'] || '';
  const subMatch = (label) => {
    const re = new RegExp(`${escape(label)}\\s*:?\\s*([\\s\\S]*?)(?=\\s+(?:Художник(?:\\s+и\\s+скульптор)?:|Скульптор:|Чеканка:|Оформление гурта:)|\\s*$)`);
    const mm = authors.match(re);
    if (!mm) return '';
    let v = mm[1].trim();
    // Гурт/чеканка — короткие фразы. После них на CBR идёт свободный исторический
    // текст. Обрежем на первой «. » перед сменой предложения (заглавная буква/цифра).
    const cut = v.search(/\.\s+(?=[A-ZА-ЯЁ0-9])/);
    if (cut !== -1) v = v.slice(0, cut + 1);
    return v.replace(/\.\s*$/, '').trim();
  };

  const mintText = subMatch('Чеканка');
  const edgeText = subMatch('Оформление гурта');

  return {
    catNum: fields['Каталожный номер'] || '',
    nominal: fields['Номинал'] || '',
    quality: fields['Качество'] || '',
    alloy: fields['Сплав'] || fields['Металл, проба'] || fields['Металл'] || '',
    massG: fields['Масса общая, г'] || '',
    diameterMm: fields['Диаметр, мм'] || '',
    thicknessMm: fields['Толщина, мм'] || '',
    mintage: fields['Тираж, шт.'] || '',
    obverseDesc: fields['Аверс'] || '',
    reverseDesc: fields['Реверс'] || '',
    mint: mintText,
    edge: edgeText
  };
}

// --------------------------- mapping -----------------------------
// Драгметаллы (серебро/золото/платина/палладий) в каталог не добавляем:
// их размещение и ценообразование принципиально отличаются от недрагоценных монет.
function isPreciousMetal(alloy) {
  const a = (alloy || '').toLowerCase();
  return /серебр|золото|платин|палладий/.test(a);
}

function mapMint(text) {
  if (/спмд|санкт-петербург/i.test(text)) return 'СПМД';
  if (/лмд|ленинград/i.test(text)) return 'ЛМД';
  if (/ммд|моско/i.test(text)) return 'ММД';
  return '';
}
function mapMaterial(alloy) {
  const a = alloy.toLowerCase();
  if (/золото/.test(a) && /серебр/.test(a)) return 'bimetal';
  if (/золото/.test(a)) return 'gold';
  if (/серебр|палладий|платин/.test(a)) return 'silver';
  if (/мельхиор|нейзильбер/.test(a) && /(латунь|медь.*никель)/.test(a)) return 'bimetal';
  if (/сталь.*гальван|гальван/.test(a)) return 'galvanic';
  if (/мельхиор|медно.*никел|медь.*никель|нейзильбер/.test(a)) return 'cupronickel';
  if (/латунь/.test(a)) return 'gvs';
  return 'cupronickel';
}
function mapType(catNum, seriesText) {
  // По кат.номерам ЦБ: 3213/3214/5216/5217 — драг.инвест; 5009-59/5514/5111 — памятные.
  // Мы считаем всё с этой страницы "jubilee" для упрощения.
  if (/инвест/i.test(seriesText)) return 'jubilee';
  return 'jubilee';
}
function mapSubPeriod(year) {
  if (year < 1992) return '1961-1991';
  if (year < 1998) return '1992-1993';
  return 'post-reform';
}
/** @returns {{ value: number, unit: 'рубль' | 'копейка' }} */
function parseDenomination(text) {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  if (t.includes('червонец')) return { value: 10, unit: 'рубль' };
  const m = t.match(/([\d\s]+)\s*(руб|коп)/);
  if (!m) return { value: 0, unit: 'рубль' };
  const n = Number(m[1].replace(/\s+/g, ''));
  const unit = m[2].startsWith('коп') ? 'копейка' : 'рубль';
  return { value: Number.isFinite(n) ? n : 0, unit };
}
function makeSlugFromDenom(denom, yr, name) {
  const part = toSlug(name);
  if (denom.unit === 'копейка') return `${denom.value}k-${yr}-${part}`;
  return `${denom.value}r-${yr}-${part}`;
}
function buildAboutText(name, yr, detail) {
  const m = parseMintage(detail.mintage);
  const tail = (detail.reverseDesc || detail.obverseDesc || '').trim();
  const bits = [];
  if (m > 0) bits.push(`Тираж по данным Банка России — ${m.toLocaleString('ru-RU')} шт.`);
  if (tail) bits.push(tail);
  if (bits.length === 0) return '';
  return bits.join(' ');
}
function parseYear(releaseDate, fallbackYear) {
  const m = releaseDate.match(/(\d{4})/);
  return m ? Number(m[1]) : fallbackYear;
}
function parseNumber(s) {
  if (!s) return 0;
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return 0;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function parseMintage(s) {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// --------------------------- CSV -----------------------------
const CSV_HEADER = [
  'slug',
  'название',
  'номинал',
  'единица_номинала',
  'год',
  'монетный_двор',
  'era',
  'sub_period',
  'type',
  'material',
  'series',
  'разновидность',
  'тираж',
  'диаметр_мм',
  'толщина_мм',
  'вес_г',
  'гурт',
  'цена_vf20',
  'цена_ef40',
  'цена_au50',
  'цена_ms63',
  'цена_ms65',
  'описание',
  'описание_аверс',
  'описание_реверс'
];
function escCsv(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowToCsv(r) {
  return CSV_HEADER.map((h) => escCsv(r[h])).join(',');
}
async function readExistingSlugs() {
  if (!(await fileExists(CSV_PATH))) {
    await mkdir(path.dirname(CSV_PATH), { recursive: true });
    await writeFile(CSV_PATH, CSV_HEADER.join(',') + '\n', 'utf8');
    return new Set();
  }
  const raw = await readFile(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  lines.shift();
  return new Set(lines.map((l) => l.split(',')[0]));
}

// --------------------------- main -----------------------------
async function importYear(year, opts) {
  console.log(`[${year}] загружаю список…`);
  const listHtml = await fetchCached(LIST_URL(year), path.join(CACHE_DIR, `list-${year}.html`));
  const items = parseYearList(listHtml);
  console.log(`[${year}] найдено монет: ${items.length}`);
  if (items.length === 0) return [];

  const slugs = await readExistingSlugs();
  const out = [];

  let skippedPrecious = 0;
  for (const it of items) {
    if (isPreciousMetal(it.material)) {
      skippedPrecious += 1;
      continue;
    }
    const denomination = parseDenomination(it.denomination);
    const yr = parseYear(it.releaseDate, year);
    const slug = makeSlugFromDenom(denomination, yr, it.name);
    if (slugs.has(slug)) {
      console.log(`  · skip ${slug} (уже есть)`);
      continue;
    }

    let detail = null;
    try {
      const coinHtml = await fetchCached(COIN_URL(it.catNum), path.join(CACHE_DIR, `coin-${it.catNum}.html`));
      detail = parseCoinPage(coinHtml);
    } catch (e) {
      console.warn(`  · ошибка карточки ${it.catNum}: ${e.message}`);
      continue;
    }
    if (isPreciousMetal(detail.alloy)) {
      skippedPrecious += 1;
      continue;
    }

    if (opts.images) {
      for (const side of ['obverse', 'reverse']) {
        const out1 = path.join(IMG_DIR, `${slug}-${side}.jpg`);
        const ok = await downloadBinary(IMG_URL(it.catNum, side), out1);
        if (!ok) console.warn(`  · ${slug} ${side}: image not found`);
      }
    }

    const row = {
      slug,
      'название': it.name,
      'номинал': denomination.value,
      'единица_номинала': denomination.unit === 'копейка' ? 'копейка' : 'рубль',
      'год': yr,
      'монетный_двор': mapMint(detail.mint),
      era: yr < 1992 ? 'ussr' : 'rf',
      sub_period: mapSubPeriod(yr),
      type: mapType(it.catNum, it.series),
      material: mapMaterial(detail.alloy || it.material),
      series: toSlug(it.series) || 'bez-serii',
      'разновидность': '',
      'тираж': parseMintage(detail.mintage),
      'диаметр_мм': parseNumber(detail.diameterMm),
      'толщина_мм': parseNumber(detail.thicknessMm),
      'вес_г': parseNumber(detail.massG),
      'гурт': detail.edge || '',
      'цена_vf20': 0, 'цена_ef40': 0, 'цена_au50': 0, 'цена_ms63': 0, 'цена_ms65': 0,
      'описание': buildAboutText(it.name, yr, detail),
      'описание_аверс': (detail.obverseDesc || '').trim(),
      'описание_реверс': (detail.reverseDesc || '').trim()
    };
    out.push(row);
    slugs.add(slug);
    console.log(`  + ${slug}`);
  }

  if (out.length > 0) {
    const lines = out.map(rowToCsv).join('\n') + '\n';
    await appendFile(CSV_PATH, lines, 'utf8');
    console.log(`[${year}] добавлено ${out.length} монет в CSV (драгметаллов пропущено: ${skippedPrecious})`);
  } else {
    console.log(`[${year}] ничего не добавлено (драгметаллов пропущено: ${skippedPrecious})`);
  }
  return out;
}

/** Парсер CSV с кавычками — как в fill-descriptions.mjs */
function parseCsv(raw) {
  const rows = [];
  let i = 0;
  let f = '';
  let row = [];
  let q = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (q) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          f += '"';
          i += 2;
          continue;
        }
        q = false;
        i++;
        continue;
      }
      f += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      q = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(f);
      f = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (f.length || row.length) {
        row.push(f);
        rows.push(row);
      }
      row = [];
      f = '';
      if (ch === '\r' && raw[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    f += ch;
    i++;
  }
  if (f.length || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

function serializeCsv(rows) {
  return rows.map((row) => row.map(escCsv).join(',')).join('\n') + '\n';
}

/**
 * Дозаполняет `описание_аверс`, `описание_реверс`, при необходимости `описание`,
 * пустые `тираж` / характеристики для юбилейных монет, slug которых совпадает с каталогом ЦБ.
 */
async function enrichCsv(args) {
  const mintageOnly = Boolean(args.mintageOnly);
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    console.warn('CSV пуст или без строк данных.');
    return;
  }
  const header = rows[0];
  const ix = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`В CSV нет колонки: ${name}`);
    return i;
  };
  const slugI = ix('slug');
  const typeI = ix('type');
  const iObv = ix('описание_аверс');
  const iRev = ix('описание_реверс');
  const iDesc = ix('описание');
  const iMint = ix('тираж');
  const iDiam = ix('диаметр_мм');
  const iThick = ix('толщина_мм');
  const iWeight = ix('вес_г');
  const iEdge = ix('гурт');
  const iMd = ix('монетный_двор');

  const bySlug = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    bySlug.set(rows[i][slugI], i);
  }

  await mkdir(CACHE_DIR, { recursive: true });
  let updated = 0;

  for (let y = args.from; y <= args.to; y += 1) {
    console.log(`[enrich ${y}] список ЦБ…`);
    const listHtml = await fetchCached(LIST_URL(y), path.join(CACHE_DIR, `list-${y}.html`));
    const items = parseYearList(listHtml);
    for (const it of items) {
      if (isPreciousMetal(it.material)) continue;
      const denomination = parseDenomination(it.denomination);
      const yr = parseYear(it.releaseDate, y);
      const slug = makeSlugFromDenom(denomination, yr, it.name);
      const rowIndex = bySlug.get(slug);
      if (rowIndex === undefined) continue;
      const row = rows[rowIndex];
      if ((row[typeI] || '') !== 'jubilee') continue;

      const needObv = !mintageOnly && (args.force || !(row[iObv] || '').trim());
      const needRev = !mintageOnly && (args.force || !(row[iRev] || '').trim());
      const needDesc = !mintageOnly && (args.force || !(row[iDesc] || '').trim());
      const curMint = parseNumber(row[iMint]);
      const needMint = args.force || curMint === 0;

      if (!needObv && !needRev && !needDesc && !needMint) continue;

      let detail;
      try {
        const coinHtml = await fetchCached(COIN_URL(it.catNum), path.join(CACHE_DIR, `coin-${it.catNum}.html`));
        detail = parseCoinPage(coinHtml);
      } catch (e) {
        console.warn(`  · ${slug}: ${e.message}`);
        continue;
      }
      if (isPreciousMetal(detail.alloy)) continue;

      if (needObv) row[iObv] = (detail.obverseDesc || '').trim();
      if (needRev) row[iRev] = (detail.reverseDesc || '').trim();
      if (needDesc) {
        const built = buildAboutText(it.name, yr, detail);
        if (built) row[iDesc] = built;
      }
      if (needMint) {
        const m = parseMintage(detail.mintage);
        if (m > 0) row[iMint] = String(m);
      }
      if (!mintageOnly) {
        const mm = mapMint(detail.mint);
        if (mm && (!(row[iMd] || '').trim() || args.force)) row[iMd] = mm;
      }

      if (!mintageOnly) {
        const dM = parseNumber(detail.diameterMm);
        const tM = parseNumber(detail.thicknessMm);
        const wM = parseNumber(detail.massG);
        if (dM > 0 && (parseNumber(row[iDiam]) === 0 || args.force)) row[iDiam] = String(dM);
        if (tM > 0 && (parseNumber(row[iThick]) === 0 || args.force)) row[iThick] = String(tM);
        if (wM > 0 && (parseNumber(row[iWeight]) === 0 || args.force)) row[iWeight] = String(wM);
        if ((detail.edge || '').trim() && (!(row[iEdge] || '').trim() || args.force)) row[iEdge] = detail.edge.trim();
      }

      updated += 1;
      console.log(`  + enrich ${slug}${mintageOnly ? ' (тираж)' : ''}`);
    }
  }

  await writeFile(CSV_PATH, serializeCsv(rows), 'utf8');
  console.log(`\nОбогащение завершено. Обновлено записей: ${updated}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`CBR import: ${args.from}–${args.to}, images=${args.images}, enrich=${args.enrich}`);
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });

  if (args.enrich) {
    if (!args.from) args.from = 1992;
    if (!args.to) args.to = 2026;
    await enrichCsv(args);
    return;
  }

  let total = 0;
  for (let y = args.from; y <= args.to; y += 1) {
    const rows = await importYear(y, args);
    total += rows.length;
  }
  console.log(`\nГотово. Всего добавлено: ${total}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
