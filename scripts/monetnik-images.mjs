#!/usr/bin/env node
// scripts/monetnik-images.mjs
// Скачивание изображений монет с www.monetnik.ru по каталогу data/coins.csv.
// Источник карточек: https://www.monetnik.ru/monety/rossii/...
// Поиск по сайту:    https://www.monetnik.ru/search/?q=...
//
// Что делает:
//   - Читает data/coins.csv.
//   - Для каждой монеты, у которой не хватает obverse/reverse в public/images/coins/,
//     ищет карточку товара на монетнике и качает два первых изображения галереи.
//   - По умолчанию: из двух картинок первая = реверс, вторая = аверс
//     (совпадает с нашей витриной: на карточке каталога показываем реверс).
//     Эвристику можно отключить флагом --swap-sides (тогда первая = аверс).
//
// Использование:
//   node scripts/monetnik-images.mjs                     # все монеты без картинок
//   node scripts/monetnik-images.mjs --slug 10r-2011-belgorod
//   node scripts/monetnik-images.mjs --year 1992
//   node scripts/monetnik-images.mjs --limit 20          # первые 20 для проверки
//   node scripts/monetnik-images.mjs --dry-run           # ничего не сохраняет, только логирует
//   node scripts/monetnik-images.mjs --force             # перезаписать существующие
//   node scripts/monetnik-images.mjs --swap-sides        # если порядок в галерее другой

import { readFile, writeFile, mkdir, access, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'coins.csv');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'coins');
const CACHE_DIR = path.join(ROOT, 'tmp', 'monetnik-cache');

const BASE = 'https://www.monetnik.ru';
const SEARCH_URL = (q) => `${BASE}/search/?q=${encodeURIComponent(q)}`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// --------------------------- cli -----------------------------
function parseArgs(argv) {
  const a = {
    slug: null, year: null, limit: 0,
    dryRun: false, force: false, swapSides: false, verbose: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--slug') a.slug = argv[++i];
    else if (v === '--year') a.year = Number(argv[++i]);
    else if (v === '--limit') a.limit = Number(argv[++i]);
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--force') a.force = true;
    else if (v === '--swap-sides') a.swapSides = true;
    else if (v === '--verbose' || v === '-v') a.verbose = true;
  }
  return a;
}

// --------------------------- fetch helpers -----------------------------
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

async function downloadBinary(url, outFile, force) {
  if (!force && (await fileExists(outFile))) return 'exists';
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE } });
  if (!res.ok) return `http_${res.status}`;
  await mkdir(path.dirname(outFile), { recursive: true });
  await pipeline(res.body, createWriteStream(outFile));
  await sleep(150);
  return 'ok';
}

// --------------------------- CSV reader -----------------------------
// Минимальный CSV-парсер с поддержкой экранированных кавычек и запятых в полях.
function parseCsv(raw) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\n' || ch === '\r') {
      if (field.length || row.length) { row.push(field); rows.push(row); }
      row = []; field = '';
      if (ch === '\r' && raw[i + 1] === '\n') i += 2; else i += 1;
      continue;
    }
    field += ch; i += 1;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function readCoins() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(raw).filter((r) => r.length > 1);
  const head = rows.shift();
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  return rows.map((r) => ({
    slug: r[idx['slug']],
    name: r[idx['название']],
    denomination: Number(r[idx['номинал']]),
    year: Number(r[idx['год']])
  })).filter((c) => c.slug);
}

// --------------------------- поиск карточки на монетнике -----------------------------
function buildQuery(coin) {
  // Монетник индексирует заголовки вида "10 рублей 2011 СПМД Белгород (ГВС)".
  // Берём номинал + год + первое содержательное слово названия.
  const firstWord = (coin.name || '')
    .replace(/[«»"'()]/g, ' ')
    .split(/[\s,–—-]+/)
    .filter(Boolean)[0] || '';
  return `${coin.denomination} рублей ${coin.year} ${firstWord}`.trim();
}

// Из HTML списка выдачи достаём ссылки на карточки российских монет.
function extractProductLinks(html) {
  const re = /href="(https?:\/\/(?:www\.)?monetnik\.ru\/monety\/rossii\/[a-z0-9\-\/]+-\d+\/)"/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return [...set];
}

// Оценка релевантности кандидата: ссылка должна содержать год и номинал.
function scoreCandidate(url, coin) {
  let s = 0;
  if (url.includes(`-${coin.year}-`)) s += 10;
  if (url.includes(`/jubilejnye/`)) s += 3;
  if (url.match(new RegExp(`${coin.denomination}-rubl`))) s += 2;
  return s;
}

async function findProductUrl(coin, opts) {
  const q = buildQuery(coin);
  if (opts.verbose) console.log(`  ? search: ${q}`);
  const html = await fetchCached(SEARCH_URL(q));
  const links = extractProductLinks(html);
  if (links.length === 0) return null;
  const scored = links
    .map((u) => ({ u, s: scoreCandidate(u, coin) }))
    .sort((a, b) => b.s - a.s);
  if (opts.verbose) scored.slice(0, 3).forEach((x) => console.log(`    ${x.s} ${x.u}`));
  return scored[0].u;
}

// --------------------------- извлечение картинок из карточки -----------------------------
// Монетник отдаёт две основные картинки товара: галерея в блоке с фотографиями.
// Собираем кандидатов в порядке их появления в HTML, фильтруем только /upload/iblock/...
// (CDN магазина), убираем повторяющиеся размеры/миниатюры.
function extractGalleryImages(html) {
  const urls = [];
  const re = /https?:\/\/(?:www\.)?monetnik\.ru\/upload\/iblock\/[^"'\s?]+?\.(?:jpg|jpeg|png|webp)/gi;
  let m;
  while ((m = re.exec(html))) urls.push(m[0]);

  // og:image в приоритете — обычно указывает на основную (первая фотография).
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  const ogUrl = og ? og[1] : null;

  const uniq = [];
  const seen = new Set();
  const push = (u) => {
    if (!u) return;
    // Нормализация: убираем суффиксы размеров вида _resize600x600 если есть.
    const key = u.replace(/_resize\d+x\d+/i, '').replace(/\?.*$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    uniq.push(u);
  };
  push(ogUrl);
  urls.forEach(push);
  return uniq;
}

// --------------------------- main per-coin -----------------------------
async function processCoin(coin, opts) {
  const obvPath = path.join(IMG_DIR, `${coin.slug}-obverse.jpg`);
  const revPath = path.join(IMG_DIR, `${coin.slug}-reverse.jpg`);

  if (!opts.force && (await fileExists(obvPath)) && (await fileExists(revPath))) {
    return { slug: coin.slug, status: 'skip', reason: 'already have both sides' };
  }

  let productUrl;
  try {
    productUrl = await findProductUrl(coin, opts);
  } catch (e) {
    return { slug: coin.slug, status: 'error', reason: `search: ${e.message}` };
  }
  if (!productUrl) return { slug: coin.slug, status: 'miss', reason: 'no product in search' };

  let html;
  try {
    html = await fetchCached(productUrl);
  } catch (e) {
    return { slug: coin.slug, status: 'error', reason: `fetch: ${e.message}` };
  }

  const images = extractGalleryImages(html);
  if (images.length < 2) {
    return { slug: coin.slug, status: 'miss', reason: `gallery=${images.length}`, productUrl };
  }

  // По умолчанию: на монетнике первая картинка — реверс (именной), вторая — аверс.
  // Если вдруг порядок другой — флаг --swap-sides.
  const [first, second] = images;
  const reverseUrl = opts.swapSides ? second : first;
  const obverseUrl = opts.swapSides ? first : second;

  if (opts.dryRun) {
    console.log(`  . ${coin.slug} → ${productUrl}`);
    console.log(`       reverse: ${reverseUrl}`);
    console.log(`       obverse: ${obverseUrl}`);
    return { slug: coin.slug, status: 'dry' };
  }

  const r1 = await downloadBinary(reverseUrl, revPath, opts.force);
  const r2 = await downloadBinary(obverseUrl, obvPath, opts.force);
  return { slug: coin.slug, status: 'ok', reverse: r1, obverse: r2, productUrl };
}

// --------------------------- main -----------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `Monetnik images: slug=${opts.slug ?? '*'} year=${opts.year ?? '*'} ` +
    `limit=${opts.limit || '∞'} dry=${opts.dryRun} force=${opts.force} swap=${opts.swapSides}`
  );
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });

  const all = await readCoins();
  let coins = all;
  if (opts.slug) coins = coins.filter((c) => c.slug === opts.slug);
  if (opts.year) coins = coins.filter((c) => c.year === opts.year);
  if (opts.limit) coins = coins.slice(0, opts.limit);
  console.log(`К обработке: ${coins.length} из ${all.length} монет`);

  const stats = { ok: 0, skip: 0, miss: 0, error: 0, dry: 0 };
  for (const coin of coins) {
    const res = await processCoin(coin, opts);
    stats[res.status] = (stats[res.status] || 0) + 1;
    const tag = {
      ok: '+', skip: '·', miss: '?', error: '!', dry: '.'
    }[res.status] || ' ';
    const extra = res.reason ? ` (${res.reason})` : '';
    console.log(`  ${tag} ${coin.slug}${extra}`);
  }

  console.log(
    `\nГотово. ok=${stats.ok} skip=${stats.skip} miss=${stats.miss} error=${stats.error} dry=${stats.dry}`
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
