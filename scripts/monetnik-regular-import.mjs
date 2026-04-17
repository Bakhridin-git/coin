#!/usr/bin/env node
// scripts/monetnik-regular-import.mjs
// Импорт регулярного чекана России 1991–2026 в data/coins.csv.
// Источник: www.monetnik.ru, разделы
//   /monety/rossii/hodyachka/do-denominacii/   (1991 ГКЧП + 1992–1993)
//   /monety/rossii/hodyachka/posle-1997/       (с 1997 по н.в.)
//
// Только рублёвые номиналы (1, 2, 5, 10, 20, 50, 100 рублей). Копейки
// не импортируются — в текущей модели Coin.denomination хранится в рублях
// целым числом, копейки требуют отдельного решения по типу/отображению.
//
// Из URL карточки товара вида
//   /hodyachka/posle-1997/2-rublya-1999-mmd-733288/
// извлекаем: номинал, год, монетный двор. Наборы/редкости/пробные/«случайные»
// отфильтровываются по slug'у. Дедупликация по (номинал, год, двор).
//
// Тиражи по умолчанию = 0 (в карточке нужно было бы парсить отдельно,
// дополнительные ~200 HTTP-запросов). Включить: --with-mintage.
//
// Использование:
//   node scripts/monetnik-regular-import.mjs              # полный импорт
//   node scripts/monetnik-regular-import.mjs --dry-run    # только логика, без записи в CSV
//   node scripts/monetnik-regular-import.mjs --with-mintage
//   node scripts/monetnik-regular-import.mjs --section posle-1997

import { readFile, writeFile, mkdir, access, appendFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'coins.csv');
const CACHE_DIR = path.join(ROOT, 'tmp', 'monetnik-regular-cache');

const BASE = 'https://www.monetnik.ru';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SECTIONS = [
  { slug: 'do-denominacii', url: `${BASE}/monety/rossii/hodyachka/do-denominacii/` },
  { slug: 'posle-1997',     url: `${BASE}/monety/rossii/hodyachka/posle-1997/` }
];

// --------------------------- cli -----------------------------
function parseArgs(argv) {
  const a = { dryRun: false, withMintage: false, section: null, maxPages: 40, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--dry-run') a.dryRun = true;
    else if (v === '--with-mintage') a.withMintage = true;
    else if (v === '--section') a.section = argv[++i];
    else if (v === '--max-pages') a.maxPages = Number(argv[++i]);
    else if (v === '--verbose' || v === '-v') a.verbose = true;
  }
  return a;
}

// --------------------------- fetch -----------------------------
async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheFileFor(url) {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9._\-]+/gi, '_');
  return path.join(CACHE_DIR, `${safe.slice(0, 180)}.html`);
}

async function fetchCached(url) {
  const cache = cacheFileFor(url);
  if (await fileExists(cache)) return readFile(cache, 'utf8');
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const html = await res.text();
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, html, 'utf8');
  await sleep(300);
  return html;
}

// --------------------------- pagination -----------------------------
// На страницах листинга у monetnik обычно используется параметр ?PAGEN_1=N.
// Идём страница за страницей, пока не перестанут появляться новые ссылки на товары.
async function fetchSectionLinks(section, opts) {
  const links = new Set();
  for (let page = 1; page <= opts.maxPages; page += 1) {
    const url = page === 1 ? section.url : `${section.url}?PAGEN_1=${page}`;
    let html;
    try { html = await fetchCached(url); }
    catch (e) {
      if (opts.verbose) console.log(`    page ${page}: ${e.message}`);
      break;
    }
    const re = new RegExp(
      `href="(https?://(?:www\\.)?monetnik\\.ru/monety/rossii/hodyachka/${section.slug}/[^"\\s]+?-\\d+/)"`,
      'gi'
    );
    let m;
    let found = 0;
    while ((m = re.exec(html))) {
      if (!links.has(m[1])) { links.add(m[1]); found += 1; }
    }
    if (opts.verbose) console.log(`    page ${page}: +${found} новых (всего ${links.size})`);
    if (found === 0) break;
  }
  return [...links];
}

// --------------------------- url parsing -----------------------------
// Из slug'а товара извлекаем номинал/год/двор. Всё, что не вписывается
// в одну каноничную монету (наборы, случайные, редкость, пробные),
// откидываем — для каталога нужна атомарная позиция.
const DENOM_RE = /(?:^|-)(\d+)-(kopejka|kopejki|kopeek|kopeyka|rubl|rublej|rublya|rubley)(?:-|$)/i;
const MINT_RE = /(?:^|-)(mmd|spmd|lmd|m|sp|l)(?:-|$)/i;

// Слова, по которым slug точно не индивидуальная монета.
const EXCLUDE_MARKERS = [
  'nabor', 'polnyj-nabor', 'godovoj', 'godovoy', 'sluchajnyj', 'sluchaynyy',
  'redkost', 'probnye', 'probnaya', 'tip', 'bimetall', 'bimetal',
  'bracket', 'slab', 'buklete', 'podarochnyj', 'kollekcia', 'kollekciya',
  'shtempelnyj', 'ostatki', 'magnitnye', 'magnitnaya', 'gornyj',
  'dvukhrubl', 'trekhrubl' // не встречается, но на всякий
];

function classifyMint(raw) {
  const x = (raw || '').toLowerCase();
  if (x === 'mmd' || x === 'm') return 'ММД';
  if (x === 'spmd' || x === 'sp') return 'СПМД';
  if (x === 'lmd' || x === 'l') return 'ЛМД';
  return '';
}

function denomToRubles(num, unit) {
  const u = unit.toLowerCase();
  if (u.startsWith('kop')) return null;
  return num;
}

// Returns normalized coin metadata or null.
function parseProductUrl(url) {
  const m = url.match(/\/hodyachka\/([a-z0-9\-]+)\/([a-z0-9\-]+)-(\d+)\/$/i);
  if (!m) return null;
  const section = m[1];
  const slug = m[2];

  for (const w of EXCLUDE_MARKERS) {
    if (slug.includes(w)) return null;
  }

  // Год: отдельный 4-значный без -NNNN после (диапазон = набор).
  const yearMatches = [...slug.matchAll(/(?:^|-)(\d{4})(?:-|$)/g)].map((x) => Number(x[1]));
  if (yearMatches.length === 0) return null;
  if (yearMatches.length > 1) return null; // несколько лет — скорее всего сводный товар
  const year = yearMatches[0];
  if (year < 1991 || year > 2030) return null;

  const dm = slug.match(DENOM_RE);
  if (!dm) return null;
  const denomRub = denomToRubles(Number(dm[1]), dm[2]);
  if (denomRub == null) return null; // копейки — пропускаем

  const mm = slug.match(MINT_RE);
  const mint = mm ? classifyMint(mm[1]) : '';

  return { section, slug, year, denomination: denomRub, mint, url };
}

// --------------------------- mintage (optional) -----------------------------
async function fetchMintage(productUrl) {
  let html;
  try { html = await fetchCached(productUrl); } catch { return 0; }
  // В карточке часто есть «Тираж (шт): 20 000 000 шт.».
  const m = html.match(/Тираж\s*\(\s*шт\.?\s*\)\s*:\s*([\d\s.,]+)/i)
    || html.match(/Тираж[^<:]*:\s*([\d\s.,]+)/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// --------------------------- coin shaping -----------------------------
function classifyEra(year) {
  if (year === 1991) return 'ussr';
  return 'rf';
}
function classifySubPeriod(year) {
  if (year <= 1991) return '1961-1991';
  if (year <= 1996) return '1992-1993';
  return '1997-present';
}
// Материал регулярной ходячки по году+номиналу (по данным каталога Семенова / Wikipedia).
function classifyMaterial(denom, year) {
  // 1991 ГКЧП
  if (year === 1991) {
    if (denom === 10) return 'galvanic';   // сталь плак. латунью (10 руб биметалла не было)
    if (denom === 5 || denom === 1) return 'cupronickel'; // мельхиор
    return 'cupronickel';
  }
  // 1992
  if (year === 1992) {
    if (denom === 1 || denom === 5) return 'galvanic';   // сталь, плак. латунью
    if (denom === 10 || denom === 20) return 'cupronickel';
    if (denom === 50 || denom === 100) return 'bimetal';
    return 'cupronickel';
  }
  // 1993
  if (year === 1993) {
    if (denom === 10 || denom === 20) return 'cupronickel'; // сталь, плак. мельхиором
    if (denom === 50) return 'gvs';                         // алюминиевая бронза (латунь)
    if (denom === 100) return 'cupronickel';
    return 'cupronickel';
  }
  // 1997+
  if (denom === 10) return 'galvanic'; // сталь плак/гальв. латунью, с 2009
  if (denom === 5) return year < 2009 ? 'cupronickel' : 'galvanic';
  if (denom === 2 || denom === 1) return year < 2009 ? 'cupronickel' : 'galvanic';
  return 'galvanic';
}
function denomName(denom, year) {
  // Простейшее русское название ходячки: "{номинал} рублей {год} {двор}".
  // Название оставляем коротким: только «N рублей», остальное сложится из полей.
  const form = (n) => {
    const abs = Math.abs(n);
    if (abs % 10 === 1 && abs % 100 !== 11) return 'рубль';
    if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return 'рубля';
    return 'рублей';
  };
  return `${denom} ${form(denom)}`;
}
function mintToSlug(mint) {
  if (mint === 'ММД') return 'mmd';
  if (mint === 'СПМД') return 'spmd';
  if (mint === 'ЛМД') return 'lmd';
  return 'unk';
}
function buildSlug(c) {
  return `${c.denomination}r-${c.year}-${mintToSlug(c.mint)}`;
}

// --------------------------- CSV -----------------------------
const CSV_HEADER = [
  'slug','название','номинал','год','монетный_двор','era','sub_period','type','material','series',
  'тираж','диаметр_мм','толщина_мм','вес_г','гурт',
  'цена_vf20','цена_ef40','цена_au50','цена_ms63','цена_ms65','описание'
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
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `Regular coins import: section=${opts.section ?? '*'} dry=${opts.dryRun} ` +
    `mintage=${opts.withMintage} maxPages=${opts.maxPages}`
  );
  await mkdir(CACHE_DIR, { recursive: true });

  const sections = opts.section
    ? SECTIONS.filter((s) => s.slug === opts.section)
    : SECTIONS;

  // 1) Собираем все ссылки на товары.
  const allLinks = [];
  for (const s of sections) {
    console.log(`\n[${s.slug}] листинг…`);
    const links = await fetchSectionLinks(s, opts);
    console.log(`[${s.slug}] товаров найдено: ${links.length}`);
    allLinks.push(...links);
  }

  // 2) Парсим URL и дедуплицируем по (номинал, год, двор).
  const byKey = new Map();
  let dropped = 0;
  for (const url of allLinks) {
    const c = parseProductUrl(url);
    if (!c) { dropped += 1; continue; }
    const key = `${c.denomination}r-${c.year}-${c.mint || 'unk'}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  console.log(
    `\nФильтрация: оставлено ${byKey.size} уникальных позиций, ` +
    `отброшено ${dropped} (копейки/наборы/редкости).`
  );

  // 3) Формируем строки. Идемпотентно — пропускаем уже существующие slug.
  const existing = await readExistingSlugs();
  const rows = [];
  const skipped = [];
  for (const c of byKey.values()) {
    if (!c.mint) continue; // без двора — подозрительно, лучше не добавлять
    const slug = buildSlug(c);
    if (existing.has(slug)) { skipped.push(slug); continue; }

    let mintage = 0;
    if (opts.withMintage) {
      mintage = await fetchMintage(c.url);
    }

    rows.push({
      slug,
      'название': denomName(c.denomination, c.year),
      'номинал': c.denomination,
      'год': c.year,
      'монетный_двор': c.mint,
      era: classifyEra(c.year),
      sub_period: classifySubPeriod(c.year),
      type: 'regular',
      material: classifyMaterial(c.denomination, c.year),
      series: 'regular',
      'тираж': mintage,
      'диаметр_мм': 0, 'толщина_мм': 0, 'вес_г': 0, 'гурт': '',
      'цена_vf20': 0, 'цена_ef40': 0, 'цена_au50': 0, 'цена_ms63': 0, 'цена_ms65': 0,
      'описание': ''
    });
    existing.add(slug);
  }

  // 4) Сортировка для читаемости.
  rows.sort((a, b) => {
    if (a['год'] !== b['год']) return a['год'] - b['год'];
    if (a['номинал'] !== b['номинал']) return a['номинал'] - b['номинал'];
    return (a['монетный_двор'] || '').localeCompare(b['монетный_двор'] || '');
  });

  console.log(`\nК добавлению: ${rows.length}, уже было: ${skipped.length}`);

  if (opts.verbose) {
    for (const r of rows.slice(0, 20)) {
      console.log(`  + ${r.slug}  (${r['название']} ${r['год']} ${r['монетный_двор']}, ${r.material})`);
    }
    if (rows.length > 20) console.log(`  … и ещё ${rows.length - 20}`);
  }

  if (opts.dryRun) {
    console.log('\nDry-run: файл не менялся.');
    return;
  }

  if (rows.length > 0) {
    const lines = rows.map(rowToCsv).join('\n') + '\n';
    await appendFile(CSV_PATH, lines, 'utf8');
    console.log(`\nДобавлено в ${path.relative(ROOT, CSV_PATH)}: ${rows.length} строк.`);
  } else {
    console.log('\nНовых монет не найдено.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
