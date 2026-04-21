/**
 * Импорт фото биметалла 10 ₽ (юбилейка) с Monetnik:
 * 1) обход подразделов /bimetall-10-rublej/* с пагинацией;
 * 2) для каждого URL товара — og:title, оценка сохранности (UNC выше прочих);
 * 3) группировка лотов одной монеты, выбор лучшего по рангу;
 * 4) сопоставление со строками coins.csv (jubilee + bimetal + 10 руб);
 * 5) скачивание пары mainViewLot_2x, разделение аверс/реверс (MSE к эталонам), 900×900 JPEG в public.
 *
 * Запуск: node scripts/import-monetnik-bimetal-10r.mjs
 * Тест на 5 монетах: IMPORT_LIMIT=5 node scripts/import-monetnik-bimetal-10r.mjs
 * Только сухой прогон индекса: DRY_RUN=1 node scripts/import-monetnik-bimetal-10r.mjs
 *
 * Только ваши ссылки (обрабатываются исключительно строки из файла; остальные монеты не трогаются):
 *   MONETNIK_EXPLICIT_FILE=путь/к/url.txt node scripts/import-monetnik-bimetal-10r.mjs
 *   Файл: по одному URL в строке, # и пустые строки игнорируются.
 *
 * Полный обход каталога (может перезаписать много монет) — только при явном согласии:
 *   MONETNIK_ALLOW_FULL_CATALOG_CRAWL=1 node scripts/import-monetnik-bimetal-10r.mjs
 *
 * Стороны: по умолчанию monetnik-order (первый URL пары — аверс). Иначе: MONETNIK_SIDE_STRATEGY=mse
 * Перезаписать JPG только для slug из списка: MONETNIK_FORCE_IMPORT=1
 */

import { readFile, writeFile, mkdir, rm, access, constants as fsConstants } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'coins.csv');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'coins');
const TMP = path.join(ROOT, 'assets', 'raw-photos', '_monetnik-bimetal-tmp');
const INDEX_CACHE = path.join(ROOT, 'data', 'monetnik-bimetal-index.json');

const SIZE = 900;
const JPEG_Q = 82;
const REF_SZ = 128;

const UA = 'Mozilla/5.0 (compatible; CoinCatalogBot/1.0)';

/** Развёрнутое сообщение для сетевых сбоев fetch (в т.ч. cause: ENOTFOUND, ETIMEDOUT, …) */
function formatFetchError(e) {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  let c = /** @type {unknown} */ (e.cause);
  let depth = 0;
  while (c instanceof Error && depth < 4) {
    parts.push(c.message);
    c = c.cause;
    depth += 1;
  }
  return parts.join(' → ');
}

/** Чем меньше индекс — тем лучше сохранность для отбора */
const GRADE_RANK = [
  { re: /\bUNC\b/i, rank: 0 },
  { re: /\bBU\b/i, rank: 1 },
  { re: /\bProof\b/i, rank: 2 },
  { re: /\bPR\b/i, rank: 2 },
  { re: /\bAU-UNC\b/i, rank: 3 },
  { re: /\bAU\b/i, rank: 4 },
  { re: /\bXF-AU\b/i, rank: 5 },
  { re: /\bXF\b/i, rank: 6 },
  { re: /\bVF-XF\b/i, rank: 7 },
  { re: /\bVF\b/i, rank: 8 },
  { re: /из оборота/i, rank: 9 },
  { re: /мешковая/i, rank: 10 },
];

const SUBPATHS = [
  '/monety/rossii/jubilejnye/bimetall-10-rublej/',
  '/monety/rossii/jubilejnye/bimetall-10-rublej/rossijskaya-federaciya/',
  '/monety/rossii/jubilejnye/bimetall-10-rublej/drevnie-goroda/',
  '/monety/rossii/jubilejnye/bimetall-10-rublej/ministerstva/',
  '/monety/rossii/jubilejnye/bimetall-10-rublej/drugie/',
];

/** Эталоны аверс/реверс (серия «РФ», современный биметалл 10 ₽) */
const REF_OBV_URL =
  'https://cdn.monetnik.ru/storage/market-lot/35/72/208635/740149_mainViewLot_2x.jpg';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchBuf(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

function extractOgTitle(html) {
  const m = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
}

function gradeRankFromTitle(title) {
  for (const { re, rank } of GRADE_RANK) {
    if (re.test(title)) return rank;
  }
  return 50;
}

function groupKeyFromTitle(title) {
  let s = title;
  for (const { re } of GRADE_RANK) {
    s = s.replace(re, ' ');
  }
  s = s.replace(/стоимостью[^.]*$/i, '').replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}

/**
 * Из HTML страницы категории — абсолютные URL карточек товара (10 рублей биметалл).
 * На сайте чаще относительные href="/monety/..."
 */
function extractProductUrls(html) {
  const base = 'https://www.monetnik.ru';
  const out = new Set();
  const re =
    /href="(\/monety\/rossii\/jubilejnye\/bimetall-10-rublej\/[^"#]+|https:\/\/www\.monetnik\.ru\/monety\/rossii\/jubilejnye\/bimetall-10-rublej\/[^"#]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let path = m[1].split('#')[0];
    const u = path.startsWith('http') ? path : `${base}${path}`;
    if (u.includes('/nabor-')) continue;
    if (!/10-rublej/i.test(u)) continue;
    out.add(u.endsWith('/') ? u : `${u}/`);
  }
  return [...out];
}

async function crawlCategoryIndex() {
  const all = new Set();
  for (const sub of SUBPATHS) {
    for (let page = 1; page <= 80; page++) {
      const url = `${base()}${sub}${page > 1 ? `?page=${page}` : ''}`;
      let html;
      try {
        html = await fetchText(url);
      } catch {
        break;
      }
      const urls = extractProductUrls(html);
      if (urls.length === 0 && page > 1) break;
      for (const u of urls) all.add(u);
      if (page === 1 && urls.length === 0) break;
      await sleep(120);
    }
  }
  return [...all];
}

function base() {
  return 'https://www.monetnik.ru';
}

/**
 * ID карточки в URL (…/10-rublej-2002-mmd-864824/ → 864824). Нужен, чтобы не взять чужой лот с страницы.
 */
function listingIdFromMonetnikProductUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== 'string') return null;
  try {
    const pathname = new URL(pageUrl).pathname.replace(/\/$/, '');
    const seg = pathname.split('/').filter(Boolean).pop() ?? '';
    const m = seg.match(/(\d{4,})$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * С карточки товара — две разные mainViewLot_2x **этого** лота.
 * На странице часто есть снимки соседних объявлений / эталона — без фильтра по ID лота получались две «одинаковые» стороны.
 */
function extractMainViewPairs(html, pageUrl = '') {
  const re =
    /cdn\.monetnik\.ru\/(storage\/market-lot\/[0-9]+\/[0-9]+\/[0-9]+\/[0-9]+_mainViewLot_2x\.jpg)/gi;
  const byLot = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const p = m[1];
    const lotKey = p.replace(/\/[0-9]+_mainViewLot_2x\.jpg$/, '');
    if (!byLot.has(lotKey)) byLot.set(lotKey, []);
    byLot.get(lotKey).push(`https://cdn.monetnik.ru/${p}`);
  }
  const listingId = listingIdFromMonetnikProductUrl(pageUrl);
  /** @type {{ lotKey: string; uniq: string[] }[]} */
  const candidates = [];
  for (const [lotKey, urls] of byLot.entries()) {
    const uniq = [...new Set(urls)].sort();
    if (uniq.length < 2) continue;
    candidates.push({ lotKey, uniq });
  }
  if (candidates.length === 0) return null;

  let pick = null;
  if (listingId) {
    pick = candidates.find((c) => c.lotKey.includes(`/${listingId}`));
    if (!pick) {
      console.warn(
        `[monetnik] лот с ID ${listingId} не найден среди пар (${candidates.length} кандидатов) — берём первую пару`
      );
    }
  }
  if (!pick) pick = candidates[0];
  return [pick.uniq[0], pick.uniq[1]];
}

/**
 * @param {Uint8Array[]} grey
 * @param {Uint8Array} refObvGrey
 */
function obverseReverseIndicesFromGrey(grey, refObvGrey) {
  const d0 = mse(grey[0], refObvGrey);
  const d1 = mse(grey[1], refObvGrey);
  const obverseIdx = d0 <= d1 ? 0 : 1;
  return { obverseIdx, reverseIdx: 1 - obverseIdx };
}

async function toGrey128(buf) {
  const { data } = await sharp(buf).resize(REF_SZ, REF_SZ, { fit: 'cover' }).grayscale().raw().toBuffer({
    resolveWithObject: true,
  });
  return new Uint8Array(data);
}

function mse(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
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
    .jpeg({ quality: JPEG_Q, mozjpeg: true })
    .toBuffer();
}

/** Разбор одной строки CSV (кавычки RFC-style) */
function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let i = 0;
  let inQ = false;
  while (i < line.length) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQ = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ',') {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

function parseCoinsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvRow(lines[0]);
  const iSlug = header.indexOf('slug');
  const iName = header.indexOf('название');
  const iYear = header.indexOf('год');
  const iMint = header.indexOf('монетный_двор');
  const iType = header.indexOf('type');
  const iMat = header.indexOf('material');
  const iNom = header.indexOf('номинал');
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.startsWith('10r-')) continue;
    const parts = parseCsvRow(line);
    if (parts.length <= Math.max(iType, iMat, iNom)) continue;
    const type = parts[iType]?.trim();
    const mat = parts[iMat]?.trim();
    const nom = parts[iNom]?.trim();
    if (type !== 'jubilee' || mat !== 'bimetal' || nom !== '10') continue;
    rows.push({
      slug: parts[iSlug]?.trim() ?? '',
      name: parts[iName]?.trim() ?? '',
      year: parts[iYear]?.trim() ?? '',
      mint: parts[iMint]?.trim() ?? '',
    });
  }
  return rows;
}

const MINT_MAP = {
  ММД: 'ММД',
  СПМД: 'СПМД',
  ЛМД: 'ЛМД',
};

function coinMatchesTitle(coin, titleLower) {
  if (!titleLower.includes(String(coin.year))) return false;
  const mintShort = MINT_MAP[coin.mint];
  if (mintShort && !titleLower.includes(mintShort.toLowerCase())) return false;
  const name = coin.name.toLowerCase().replace(/ё/g, 'е');
  if (name.length < 3) return false;
  /** ключевые слова из названия должны встречаться в заголовке */
  const tokens = name.split(/[^a-zа-я0-9]+/i).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  let hit = 0;
  for (const t of tokens) {
    if (titleLower.includes(t)) hit++;
  }
  return hit >= Math.min(2, tokens.length) || (tokens.length === 1 && hit >= 1);
}

function normalizeProductUrl(u) {
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s.endsWith('/') ? s : `${s}/`;
}

function parseExplicitUrlsFile(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const n = normalizeProductUrl(t);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Несколько строк CSV могут подойти под заголовок (редко). Сужаем по ММД/СПМД в тексте.
 */
function pickCoinForTitle(matches, titleLower) {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const hasMmd = titleLower.includes('ммд');
  const hasSpmd = titleLower.includes('спмд');
  if (hasMmd && !hasSpmd) {
    const m = matches.filter((c) => c.mint === 'ММД');
    if (m.length === 1) return m[0];
  }
  if (hasSpmd && !hasMmd) {
    const m = matches.filter((c) => c.mint === 'СПМД');
    if (m.length === 1) return m[0];
  }
  return matches[0];
}

async function imagePairExists(slug) {
  const ob = path.join(OUT_DIR, `${slug}-obverse.jpg`);
  const rev = path.join(OUT_DIR, `${slug}-reverse.jpg`);
  try {
    await access(ob, fsConstants.F_OK);
    await access(rev, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExplicitUrlListPath() {
  const fromEnv = process.env.MONETNIK_EXPLICIT_FILE?.trim();
  if (!fromEnv) return null;
  return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
}

/**
 * Импорт только по списку URL из файла: без обхода каталога.
 * Пропуск: уже есть obverse+reverse на диске; повтор того же slug в списке.
 */
async function runExplicitUrlImport(coins, dry, limit) {
  const listPath = resolveExplicitUrlListPath();
  if (!listPath) {
    console.error('Укажите MONETNIK_EXPLICIT_FILE=путь к файлу со списком URL (по одному в строке).');
    process.exit(1);
  }
  let raw;
  try {
    raw = await readFile(listPath, 'utf8');
  } catch (e) {
    console.error(`Не удалось прочитать ${listPath}:`, e);
    process.exit(1);
  }
  const urls = parseExplicitUrlsFile(raw);
  const sideStrategy = process.env.MONETNIK_SIDE_STRATEGY?.trim() === 'mse' ? 'mse' : 'monetnik-order';
  const forceImport = process.env.MONETNIK_FORCE_IMPORT === '1';
  console.log(
    `Режим явного списка: ${listPath} → ${urls.length} URL (стороны: ${sideStrategy}${forceImport ? ', принудительная перезапись' : ''})`
  );

  let refObvG = null;
  if (sideStrategy === 'mse') {
    refObvG = await toGrey128(await fetchBuf(REF_OBV_URL));
  }

  const seenSlugs = new Set();
  let done = 0;

  for (const url of urls) {
    if (done >= limit) break;
    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.warn(`skip URL (сеть): ${url} — ${formatFetchError(e)}`);
      await sleep(120);
      continue;
    }
    const title = extractOgTitle(html);
    if (!title) {
      console.warn(`skip URL (нет og:title): ${url}`);
      await sleep(120);
      continue;
    }
    const titleLower = title.toLowerCase();
    const matches = coins.filter((c) => coinMatchesTitle(c, titleLower));
    const coin = pickCoinForTitle(matches, titleLower);
    if (!coin) {
      console.warn(`нет строки в coins.csv для заголовка: ${title.slice(0, 90)}…`);
      await sleep(120);
      continue;
    }
    if (seenSlugs.has(coin.slug)) {
      console.log(`skip (дубликат в списке, slug уже обработан): ${coin.slug}`);
      await sleep(80);
      continue;
    }
    if (!forceImport && (await imagePairExists(coin.slug))) {
      console.log(`skip (файлы уже есть): ${coin.slug}`);
      seenSlugs.add(coin.slug);
      await sleep(80);
      continue;
    }
    if (dry) {
      const rank = gradeRankFromTitle(title);
      console.log(`[dry] ${coin.slug} ← rank ${rank} ${title.slice(0, 85)}…`);
      seenSlugs.add(coin.slug);
      done++;
      await sleep(80);
      continue;
    }
    const pair = extractMainViewPairs(html, url);
    if (!pair) {
      console.warn(`нет пары картинок на странице: ${coin.slug} (${url})`);
      await sleep(120);
      continue;
    }
    const bufs = await Promise.all(pair.map((u) => fetchBuf(u)));
    let obverseIdx;
    let reverseIdx;
    if (sideStrategy === 'mse' && refObvG) {
      const grey = await Promise.all(bufs.map((b) => toGrey128(b)));
      const pr = obverseReverseIndicesFromGrey(grey, refObvG);
      obverseIdx = pr.obverseIdx;
      reverseIdx = pr.reverseIdx;
    } else {
      obverseIdx = 0;
      reverseIdx = 1;
    }
    const obPath = path.join(OUT_DIR, `${coin.slug}-obverse.jpg`);
    const revPath = path.join(OUT_DIR, `${coin.slug}-reverse.jpg`);
    await writeFile(obPath, await processFace(bufs[obverseIdx]));
    await writeFile(revPath, await processFace(bufs[reverseIdx]));
    const rank = gradeRankFromTitle(title);
    console.log(`OK ${coin.slug} (сохр. rank ${rank})`);
    seenSlugs.add(coin.slug);
    done++;
    await sleep(150);
  }

  console.log(`\nГотово (явный список). Изображения: ${OUT_DIR}`);
}

async function main() {
  const dry = process.env.DRY_RUN === '1';
  const limit = process.env.IMPORT_LIMIT ? Number.parseInt(process.env.IMPORT_LIMIT, 10) : Infinity;

  await mkdir(TMP, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const csvText = await readFile(CSV_PATH, 'utf8');
  const coins = parseCoinsCsv(csvText);
  console.log(`Строк в CSV (jubilee bimetal 10r): ${coins.length}`);

  const explicitListPath = resolveExplicitUrlListPath();
  if (explicitListPath) {
    await runExplicitUrlImport(coins, dry, limit);
    await rm(TMP, { recursive: true, force: true });
    return;
  }

  if (process.env.MONETNIK_ALLOW_FULL_CATALOG_CRAWL !== '1') {
    console.error(
      'Импорт по полному каталогу отключён (он перезаписывает много монет сразу).\n' +
        '  • Только ваши ссылки: MONETNIK_EXPLICIT_FILE=файл.txt node scripts/import-monetnik-bimetal-10r.mjs\n' +
        '  • Полный обход: MONETNIK_ALLOW_FULL_CATALOG_CRAWL=1 node scripts/import-monetnik-bimetal-10r.mjs'
    );
    process.exit(1);
  }

  let productUrls;
  const forceCrawl = process.env.REFRESH_INDEX === '1';
  if (!forceCrawl) {
    try {
      const raw = await readFile(INDEX_CACHE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        productUrls = parsed;
        console.log(`Индекс из ${INDEX_CACHE}: ${productUrls.length} URL (REFRESH_INDEX=1 — пересканировать)`);
      }
    } catch {
      /* no file */
    }
  }
  if (!productUrls) {
    productUrls = await crawlCategoryIndex();
    if (productUrls.length > 0) {
      await writeFile(INDEX_CACHE, JSON.stringify(productUrls, null, 0), 'utf8');
    } else {
      console.warn(
        'Пустой индекс: не удалось скачать каталог (сеть?). Повторите позже или положите готовый data/monetnik-bimetal-index.json'
      );
    }
    console.log(`Собрано уникальных карточек: ${productUrls.length}`);
  }

  if (!productUrls?.length) {
    console.error('Нет URL каталога — прервали.');
    process.exit(1);
  }

  /** groupKey -> лучший { url, title, rank } */
  const best = new Map();
  const BATCH = 16;
  let n = 0;
  for (let i = 0; i < productUrls.length; i += BATCH) {
    const slice = productUrls.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((url) =>
        fetchText(url)
          .then((html) => ({ url, html }))
          .catch(() => null)
      )
    );
    for (const r of results) {
      if (!r) continue;
      const title = extractOgTitle(r.html);
      if (!title) continue;
      const rank = gradeRankFromTitle(title);
      const gk = groupKeyFromTitle(title);
      if (!gk.includes('10 рубл')) continue;
      const prev = best.get(gk);
      if (!prev || rank < prev.rank || (rank === prev.rank && title.length < prev.title.length)) {
        best.set(gk, { url: r.url, title, rank });
      }
      n++;
    }
    if (i % (BATCH * 5) === 0) console.log(`  …карточек ${Math.min(i + BATCH, productUrls.length)}/${productUrls.length}`);
    await sleep(60);
  }
  console.log(`Уникальных групп (нормализованных монет): ${best.size}`);

  /** Для каждой монеты из CSV найти группу */
  const matched = [];
  for (const coin of coins) {
    let winner = null;
    for (const [, v] of best) {
      const tl = v.title.toLowerCase();
      if (coinMatchesTitle(coin, tl)) {
        if (!winner || v.rank < winner.rank) winner = { ...v, coin };
      }
    }
    if (winner) matched.push(winner);
  }

  console.log(`Сопоставлено с каталогом: ${matched.length} / ${coins.length}`);

  const sideStrategy = process.env.MONETNIK_SIDE_STRATEGY?.trim() === 'mse' ? 'mse' : 'monetnik-order';
  let refObvG = null;
  if (sideStrategy === 'mse') {
    refObvG = await toGrey128(await fetchBuf(REF_OBV_URL));
  }

  let done = 0;
  for (const m of matched) {
    if (done >= limit) break;
    if (dry) {
      console.log(`[dry] ${m.coin.slug} ← rank ${m.rank} ${m.title.slice(0, 70)}…`);
      done++;
      continue;
    }
    let html;
    try {
      html = await fetchText(m.url);
    } catch (e) {
      console.warn(`skip ${m.coin.slug}: ${formatFetchError(e)}`);
      continue;
    }
    const pair = extractMainViewPairs(html, m.url);
    if (!pair) {
      console.warn(`нет пары картинок: ${m.coin.slug}`);
      continue;
    }
    const bufs = await Promise.all(pair.map((u) => fetchBuf(u)));
    let obverseIdx;
    let reverseIdx;
    if (sideStrategy === 'mse' && refObvG) {
      const grey = await Promise.all(bufs.map((b) => toGrey128(b)));
      const pr = obverseReverseIndicesFromGrey(grey, refObvG);
      obverseIdx = pr.obverseIdx;
      reverseIdx = pr.reverseIdx;
    } else {
      obverseIdx = 0;
      reverseIdx = 1;
    }

    const obPath = path.join(OUT_DIR, `${m.coin.slug}-obverse.jpg`);
    const revPath = path.join(OUT_DIR, `${m.coin.slug}-reverse.jpg`);
    await writeFile(obPath, await processFace(bufs[obverseIdx]));
    await writeFile(revPath, await processFace(bufs[reverseIdx]));
    console.log(`OK ${m.coin.slug} (сохр. rank ${m.rank})`);
    done++;
    await sleep(150);
  }

  await rm(TMP, { recursive: true, force: true });
  console.log(`\nГотово. Изображения: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
