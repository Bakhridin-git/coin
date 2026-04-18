#!/usr/bin/env node
/**
 * Заполняет колонки описание_аверс и описание_реверс в data/coins.csv
 * из официальных источников Банка России:
 * - памятные / инвестиционные: SOAP CoinsBaseWS (GetMonetDetailInfoXML)
 * - монеты обращения (номиналы 1–10 руб., 1–50 коп.): страницы cash_circulation/coins/*
 * - монеты 1992–1993 гг. номиналом 20/50/100 руб. без отдельной HTML-страницы на cbr.ru:
 *   статические тексты в LEGACY_1992_RUB (по образцу формулировок каталога ЦБ).
 *
 * Запуск (нужна сеть): node scripts/fill-cbr-obv-rev.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_PATH = path.join(process.cwd(), 'data', 'coins.csv');
const CBR_SOAP = 'https://www.cbr.ru/CoinsBaseWS/CoinsBaseWS.asmx';

const LEGACY_1992_RUB = {
  /** 20 ₽, мельхиор (1992–1993, все разновидности по монетному двору) */
  cupronickel_20: {
    obverse:
      'в центре — эмблема Банка России (двуглавый орёл с опущенными крыльями); вверху по окружности — надпись «БАНК РОССИИ»; внизу — обозначение номинала в две строки «ДВАДЦАТЬ РУБЛЕЙ» и год чеканки; справа внизу — товарный знак монетного двора-изготовителя.',
    reverse:
      'в центре крупная цифра «20» и слово «РУБЛЕЙ»; по нижнему полю диска и справа — стилизованный растительный орнамент в виде изогнутой ветви.'
  },
  /** 50 ₽, биметалл (латунное кольцо, мельхиоровый центр) */
  bimetal_50: {
    obverse:
      'на наружном кольце по окружности — надписи «БАНК РОССИИ» и год чеканки; на внутреннем диске — эмблема Банка России (двуглавый орёл с опущенными крыльями); под орлом — товарный знак монетного двора-изготовителя.',
    reverse:
      'на наружном кольце — декоративный орнамент; на внутреннем диске — крупное число «50» и слово «РУБЛЕЙ».'
  },
  /** 50 ₽, мельхиор (1993) */
  cupronickel_50: {
    obverse:
      'в центре — эмблема Банка России (двуглавый орёл с опущенными крыльями); вверху по окружности — надпись «БАНК РОССИИ»; внизу — обозначение номинала «ПЯТЬДЕСЯТ РУБЛЕЙ» и год чеканки; справа внизу — товарный знак монетного двора-изготовителя.',
    reverse:
      'в центре крупная цифра «50» и слово «РУБЛЕЙ»; по нижнему полю диска и справа — стилизованный растительный орнамент в виде изогнутой ветви.'
  },
  /** 100 ₽, биметалл (1992) */
  bimetal_100: {
    obverse:
      'на наружном кольце по окружности — надписи «БАНК РОССИИ», год чеканки «1992»; на внутреннем диске — эмблема Банка России (двуглавый орёл с опущенными крыльями); под орлом — товарный знак монетного двора-изготовителя.',
    reverse:
      'на наружном кольце — декоративный орнамент; на внутреннем диске — крупное число «100» и слово «РУБЛЕЙ».'
  },
  /** 100 ₽, мельхиор (1993) */
  cupronickel_100: {
    obverse:
      'в центре — эмблема Банка России (двуглавый орёл с опущенными крыльями); вверху по окружности — надпись «БАНК РОССИИ»; внизу — обозначение номинала «СТО РУБЛЕЙ» и год чеканки; справа внизу — товарный знак монетного двора-изготовителя.',
    reverse:
      'в центре крупная цифра «100» и слово «РУБЛЕЙ»; по нижнему полю диска и справа — стилизованный растительный орнамент в виде изогнутой ветви.'
  }
};

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

function escapeCsvField(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(html) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|li|h3)>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ');
}

function ulToProse(ulHtml) {
  const items = [...ulHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => stripTags(m[1]).trim());
  return items.join(' ');
}

/** Берёт контент после маркера: первый <ul>… или первый <p>… */
function extractAfterAversMarker(fragment) {
  const ul = fragment.match(/<ul[\s\S]*?<\/ul>/i);
  if (ul) return ulToProse(ul[0]);
  const p = fragment.match(/<p>([\s\S]*?)<\/p>/i);
  if (p) return stripTags(p[1]);
  return '';
}

function findNth(html, needle, n1Based) {
  let pos = -1;
  for (let i = 0; i < n1Based; i += 1) {
    pos = html.indexOf(needle, pos + 1);
    if (pos < 0) return -1;
  }
  return pos;
}

/** Первая пара Аверс+Реверс на странице (образца 1997 г.) */
function extractFirstAversReversPair(html) {
  const a1 = html.indexOf('<h3>Аверс</h3>');
  const r1 = html.indexOf('<h3>Реверс</h3>', a1);
  if (a1 < 0 || r1 < 0) return null;
  const avFrag = html.slice(a1 + 14, r1);
  const obverse = extractAfterAversMarker(avFrag).trim();
  /** длина `<h3>Реверс</h3>` в JS — 15 символов */
  const tail = html.slice(r1 + 15);
  let reverse = '';
  const ulR = tail.match(/^\s*<ul[\s\S]*?<\/ul>/i);
  if (ulR) reverse = ulToProse(ulR[0]);
  else {
    const pR = tail.match(/^\s*<p>([\s\S]*?)<\/p>/i);
    if (pR) reverse = stripTags(pR[1]);
  }
  reverse = reverse.trim();
  if (!obverse || !reverse) return null;
  return { obverse, reverse };
}

/** n-я секция «Аверс» без пары с Реверсом в том же блоке (2002 / 2016 и т.д.) */
function extractNthAversOnly(html, n1Based) {
  const pos = findNth(html, '<h3>Аверс</h3>', n1Based);
  if (pos < 0) return '';
  const start = pos + 14;
  const slice = html.slice(start);
  const stop = slice.search(/<h2\s|<div class="title-container">|<h3>Реверс<\/h3>/i);
  const frag = stop >= 0 ? slice.slice(0, stop) : slice;
  return extractAfterAversMarker(frag).trim();
}

/**
 * @param {string} html
 * @param {number} year
 */
function circulationTextsFromPage(html, subpath, year) {
  const base = extractFirstAversReversPair(html);
  if (!base) return null;

  if (['1rub', '2rub', '5rub'].includes(subpath)) {
    if (year <= 2001) return base;
    const obv2002 = extractNthAversOnly(html, 2);
    const obv2016 = extractNthAversOnly(html, 3);
    if (year >= 2016 && obv2016) return { obverse: obv2016, reverse: base.reverse };
    if (year >= 2002 && obv2002) return { obverse: obv2002, reverse: base.reverse };
    return base;
  }

  if (subpath === '10rub') {
    if (year >= 2016) {
      const obv2016 = extractNthAversOnly(html, 2);
      if (obv2016) return { obverse: obv2016, reverse: base.reverse };
    }
    return base;
  }

  return base;
}

/** @type {Record<string, string>} */
const PATH_BY_DENOM = {
  '1:копейка': '1k',
  '5:копейка': '5k',
  '10:копейка': '10k',
  '50:копейка': '50k',
  '1:рубль': '1rub',
  '2:рубль': '2rub',
  '5:рубль': '5rub',
  '10:рубль': '10rub'
};

function nominalPhraseFromApi(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function nominalPhraseExpected(n, unit) {
  if (unit === 'копейка') {
    const map = { 1: '1 копейка', 5: '5 копеек', 10: '10 копеек', 50: '50 копеек' };
    return (map[n] || '').toLowerCase();
  }
  const nx = n % 100;
  const m = n % 10;
  let tail = 'рублей';
  if (nx < 11 || nx > 14) {
    if (m === 1) tail = 'рубль';
    else if (m >= 2 && m <= 4) tail = 'рубля';
  }
  return `${n} ${tail}`.toLowerCase();
}

function materialMatchScore(coinMat, metalStr) {
  const m = (metalStr || '').toLowerCase();
  const mat = (coinMat || '').toLowerCase();
  if (mat === 'galvanic' && (m.includes('сталь') || m.includes('гальва'))) return 3;
  if (mat === 'cupronickel' && (m.includes('мельхиор') || m.includes('медно-никел') || m.includes('никел'))) return 3;
  if (mat === 'gvs' && (m.includes('латун') || m.includes('томпак') || m.includes('сталь'))) return 2;
  if (mat === 'bimetal' && (m.includes('латун') && m.includes('никель'))) return 3;
  return 0;
}

async function soapSearchMonet(name, year) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SearchMonetXML xmlns="http://web.cbr.ru/">
      <SearchPhrase>${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</SearchPhrase>
      <year>${year}</year>
      <nominal>-1</nominal>
      <metal_id>0</metal_id>
      <serie_id>0</serie_id>
      <is_investment>0</is_investment>
    </SearchMonetXML>
  </soap:Body>
</soap:Envelope>`;
  const res = await fetch(CBR_SOAP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://web.cbr.ru/SearchMonetXML"' },
    body
  });
  return res.text();
}

async function soapDetail(cat) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetMonetDetailInfoXML xmlns="http://web.cbr.ru/">
      <CatNumber>${cat}</CatNumber>
      <Eng>false</Eng>
    </GetMonetDetailInfoXML>
  </soap:Body>
</soap:Envelope>`;
  const res = await fetch(CBR_SOAP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://web.cbr.ru/GetMonetDetailInfoXML"' },
    body
  });
  return res.text();
}

function parseSearchCl(xml) {
  const out = [];
  const re = /<CL>([\s\S]*?)<\/CL>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const cn = block.match(/<CatNumber>([^<]*)<\/CatNumber>/);
    const cname = block.match(/<cname>([\s\S]*?)<\/cname>/);
    const nominal = block.match(/<nominal>([\s\S]*?)<\/nominal>/);
    const metal = block.match(/<metal>([\s\S]*?)<\/metal>/);
    const dt = block.match(/<DT>([^<]*)<\/DT>/);
    if (cn)
      out.push({
        CatNumber: stripTags(cn[1]),
        cname: cname ? stripTags(cname[1]) : '',
        nominal: nominal ? stripTags(nominal[1]) : '',
        metal: metal ? stripTags(metal[1]) : '',
        /** ISO-дата выпуска из базы ЦБ */
        dt: dt ? stripTags(dt[1]) : ''
      });
  }
  return out;
}

function parseDetail(xml) {
  const av = xml.match(/<Avers>([\s\S]*?)<\/Avers>/);
  const rev = xml.match(/<Revers>([\s\S]*?)<\/Revers>/);
  if (!av || !rev || av[1] == null || rev[1] == null) return null;
  return {
    obverse: stripTags(String(av[1])).trim(),
    reverse: stripTags(String(rev[1])).trim()
  };
}

function stripNobr(s) {
  return s.replace(/<nobr>/gi, '').replace(/<\/nobr>/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} coin
 * @param {string} idxName
 * @param {number} idxYear
 * @param {number} idxDenom
 * @param {string} idxUnit
 * @param {string} idxMat
 */
function yearFromCbrDt(dtStr) {
  if (!dtStr) return null;
  const y = new Date(dtStr).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function buildSearchAttempts(fullName) {
  const name = stripNobr(fullName.trim());
  const out = new Set();
  out.add(name);
  const noParen = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen) out.add(noParen);
  const noComma = name.split(',')[0].trim();
  if (noComma) out.add(noComma);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 3) out.add(words.slice(-3).join(' '));
  if (words.length >= 2) out.add(words.slice(-2).join(' '));
  if (words.length >= 1) out.add(words[words.length - 1]);
  return [...out].filter(Boolean);
}

/** Оценка совпадения кириллического названия монеты с карточкой cname в базе ЦБ */
function scoreNameMatch(cname, targetName) {
  const a = stripNobr(cname)
    .toLowerCase()
    .replace(/«|»|'|"/g, '');
  const b = stripNobr(targetName)
    .toLowerCase()
    .replace(/«|»|'|"/g, '');
  if (a === b) return 1000;
  let score = 0;
  const words = b.split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    if (a.includes(w)) score += 3;
  }
  const first = words[0];
  if (first && a.startsWith(first.slice(0, 4))) score += 5;
  return score;
}

async function fetchJubileeSides(coin, idxName, idxYear, idxDenom, idxUnit, idxMat) {
  const name = stripNobr((coin[idxName] || '').trim());
  const year = Number(coin[idxYear]);
  const denom = Number(coin[idxDenom]);
  const unit = (coin[idxUnit] || 'рубль').trim();
  const mat = (coin[idxMat] || '').trim();
  const want = nominalPhraseExpected(denom, unit);
  const attempts = buildSearchAttempts(name);

  let merged = [];

  for (const phrase of attempts) {
    await new Promise((r) => setTimeout(r, 80));
    const xml = await soapSearchMonet(phrase, year);
    const list = parseSearchCl(xml).filter((c) => {
      const y = yearFromCbrDt(c.dt);
      return y == null || y === year;
    });
    if (list.length) {
      merged = list;
      break;
    }
  }

  if (merged.length === 0) {
    await new Promise((r) => setTimeout(r, 80));
    const xmlWide = await soapSearchMonet(name, 0);
    merged = parseSearchCl(xmlWide).filter((c) => {
      const y = yearFromCbrDt(c.dt);
      return y === year;
    });
  }

  if (merged.length === 0) {
    await new Promise((r) => setTimeout(r, 80));
    const xmlYear = await soapSearchMonet('', year);
    merged = parseSearchCl(xmlYear);
  }

  let cand = merged.filter((c) => nominalPhraseFromApi(c.nominal) === want);
  if (cand.length === 0) cand = merged;
  if (cand.length > 1) {
    cand = [...cand].sort((a, b) => materialMatchScore(mat, b.metal) - materialMatchScore(mat, a.metal));
    const bestM = materialMatchScore(mat, cand[0].metal);
    if (bestM > 0) cand = cand.filter((c) => materialMatchScore(mat, c.metal) === bestM);
  }
  if (cand.length === 0) return null;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');
  const exact = cand.find((c) => norm(c.cname) === norm(name));
  const ranked = [...cand].sort((a, b) => {
    const sb = scoreNameMatch(b.cname || '', name);
    const sa = scoreNameMatch(a.cname || '', name);
    if (sb !== sa) return sb - sa;
    if (exact) return 0;
    return (b.cname || '').length - (a.cname || '').length;
  });
  const pick = exact || ranked[0];
  const detailXml = await soapDetail(pick.CatNumber);
  const det = parseDetail(detailXml);
  const o = det?.obverse?.trim() ?? '';
  const v = det?.reverse?.trim() ?? '';
  if (!det || o.length < 15 || v.length < 15) return null;
  return { obverse: o, reverse: v };
}

function legacy1992Sides(coin, idxMat, idxDenom) {
  const mat = (coin[idxMat] || '').trim();
  const denom = Number(coin[idxDenom]);
  if (denom === 20 && mat === 'cupronickel') return LEGACY_1992_RUB.cupronickel_20;
  if (denom === 50 && mat === 'bimetal') return LEGACY_1992_RUB.bimetal_50;
  if (denom === 50 && mat === 'cupronickel') return LEGACY_1992_RUB.cupronickel_50;
  if (denom === 100 && mat === 'bimetal') return LEGACY_1992_RUB.bimetal_100;
  if (denom === 100 && mat === 'cupronickel') return LEGACY_1992_RUB.cupronickel_100;
  return null;
}

/** @type {Map<string, string>} */
const circulationHtmlCache = new Map();

async function ensureCirculationPage(subpath) {
  if (circulationHtmlCache.has(subpath)) return circulationHtmlCache.get(subpath);
  const url = `https://www.cbr.ru/cash_circulation/coins/${subpath}/`;
  const r = await fetch(url);
  const t = await r.text();
  circulationHtmlCache.set(subpath, t);
  return t;
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((x) => x.length > 0);
  const headerLine = lines[0];
  const cols = parseCsvLine(headerLine);
  const idxSlug = cols.indexOf('slug');
  const idxType = cols.indexOf('type');
  const idxName = cols.indexOf('название');
  const idxYear = cols.indexOf('год');
  const idxDenom = cols.indexOf('номинал');
  const idxUnit = cols.indexOf('единица_номинала');
  const idxMat = cols.indexOf('material');
  const idxOb = cols.indexOf('описание_аверс');
  const idxRev = cols.indexOf('описание_реверс');
  if (idxOb < 0 || idxRev < 0) throw new Error('CSV: нет колонок описание_аверс / описание_реверс');

  let filledJ = 0;
  let filledR = 0;
  let filledL = 0;
  let failJ = 0;

  const outRows = [headerLine];

  for (let li = 1; li < lines.length; li += 1) {
    const cells = parseCsvLine(lines[li]);
    if (cells.length !== cols.length) {
      console.error(`Строка ${li}: ожидалось ${cols.length} колонок, получено ${cells.length}`);
      outRows.push(lines[li]);
      continue;
    }
    const ob = (cells[idxOb] || '').trim();
    const rev = (cells[idxRev] || '').trim();
    if (ob && rev) {
      outRows.push(lines[li]);
      continue;
    }

    const type = (cells[idxType] || '').trim();
    const year = Number(cells[idxYear]);
    const denom = Number(cells[idxDenom]);
    const unit = (cells[idxUnit] || 'рубль').trim();

    try {
      if (type === 'jubilee') {
        await new Promise((r) => setTimeout(r, 120));
        const sides = await fetchJubileeSides(cells, idxName, idxYear, idxDenom, idxUnit, idxMat);
        const obOk = typeof sides?.obverse === 'string' && sides.obverse.trim().length > 0;
        const revOk = typeof sides?.reverse === 'string' && sides.reverse.trim().length > 0;
        if (sides && obOk && revOk) {
          cells[idxOb] = sides.obverse;
          cells[idxRev] = sides.reverse;
          filledJ += 1;
        } else {
          failJ += 1;
          if (sides && (!obOk || !revOk)) {
            console.warn('Пустой Avers/Revers в ответе API:', cells[idxSlug]);
          } else {
            console.warn('Нет данных CoinsBaseWS:', cells[idxSlug], cells[idxName], year);
          }
        }
      } else if (type === 'regular') {
        const key = `${denom}:${unit}`;
        const subpath = PATH_BY_DENOM[key];
        if (subpath && year >= 1991) {
          const html = await ensureCirculationPage(subpath);
          const sides = circulationTextsFromPage(html, subpath, year);
          if (
            sides &&
            typeof sides.obverse === 'string' &&
            typeof sides.reverse === 'string' &&
            sides.obverse.trim() &&
            sides.reverse.trim()
          ) {
            cells[idxOb] = sides.obverse;
            cells[idxRev] = sides.reverse;
            filledR += 1;
          }
        } else if (unit === 'рубль' && (year === 1992 || year === 1993) && [20, 50, 100].includes(denom)) {
          const leg = legacy1992Sides(cells, idxMat, idxDenom);
          if (leg && leg.obverse.trim() && leg.reverse.trim()) {
            cells[idxOb] = leg.obverse;
            cells[idxRev] = leg.reverse;
            filledL += 1;
          }
        }
      }
    } catch (e) {
      console.error('Ошибка строки', cells[idxSlug], e);
    }

    outRows.push(cols.map((_, i) => escapeCsvField(cells[i])).join(','));
  }

  await writeFile(CSV_PATH, outRows.join('\n') + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        filledJubileeSoap: filledJ,
        filledCirculationHtml: filledR,
        filledLegacy1992_1993: filledL,
        jubileeSoapFailed: failJ
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
