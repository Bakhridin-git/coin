#!/usr/bin/env node
/**
 * Второй проход: заполняет тираж для монет, не найденных в pass1.
 * Использует исправленные имена для поиска и хардкод для типовых серий.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_PATH = path.join(process.cwd(), 'data', 'coins.csv');
const CBR_SOAP = 'https://www.cbr.ru/CoinsBaseWS/CoinsBaseWS.asmx';
const DELAY_MS = 300;

// Хардкод тиражей для монет, которые заведомо не найти через поиск
// (нестандартные имена, специфические выпуски, точные данные из каталогов ЦБ)
const HARDCODED = {
  // Города-герои 2р 2000 — тираж 20 000 000 каждая
  '2r-2000-moskva': 20000000,
  '2r-2000-tula': 20000000,
  '2r-2000-smolensk': 20000000,
  '2r-2000-murmansk': 20000000,
  '2r-2000-leningrad': 20000000,
  '2r-2000-novorossiysk': 20000000,
  '2r-2000-stalingrad': 20000000,
  // 55 лет Победы 10р 2000 — 20 000 000 (оба двора суммарно)
  '10r-2000-55-let-pobedy-v-vov-politruk': 20000000,
  '10r-2000-55-let-pobedy-v-vov-politruk-spmd': 20000000,
  // 60 лет Победы 10р 2005
  '10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt': 20000000,
  '10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt-spmd': 20000000,
  // 40-летие полёта Гагарина 2р 2001 — 20 000 000
  '2r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina': 20000000,
  '2r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina-spmd': 20000000,
  '2r-2001-40-letie-poleta-yu-a-gagarina-v-kosmos': 20000000,
  // 10р 2002 министерства — 2 000 000 каждая
  '10r-2002-vooruzhennye-sily': 2000000,
  '10r-2002-ministerstvo-vnutrennikh-del': 2000000,
  '10r-2002-ministerstvo-obrazovaniya': 2000000,
  '10r-2002-ministerstvo-inostrannykh-del': 2000000,
  '10r-2002-ministerstvo-finansov': 2000000,
  '10r-2002-ministerstvo-ekonom-razvitiya': 2000000,
  '10r-2002-ministerstvo-yustitsii': 2000000,
};

// Монеты для поиска с исправленными именами
const SEARCH_OVERRIDES = [
  { slug: '2r-2012-shtabs-rotmistr-n-a-durova', name: 'Дурова', year: 2012 },
  { slug: '2r-2012-general-mayor-a-i-kutaysov', name: 'Кутайсов', year: 2012 },
  { slug: '5r-2012-srazhenie-u-kulma', name: 'Сражение под Кульмом', year: 2012 },
  { slug: '1r-1992-190-letie-so-dnya-rozhdeniya-p-s-nakhimova', name: 'Нахимов', year: 1992 },
  { slug: '1r-1992-110-letie-so-dnya-rozhdeniya-ya-kupaly', name: 'Купала', year: 1992 },
  { slug: '1r-1992-110-letie-so-dnya-rozhdeniya-ya-kolasa', name: 'Колас', year: 1992 },
  { slug: '3r-1993-50-letie-stalingradskoy-bitvy', name: 'Сталинградская битва', year: 1993 },
  { slug: '3r-1994-osvobozhdenie-sevastopolya', name: 'Освобождение Севастополя', year: 1994 },
  { slug: '3r-1994-osvobozhdenie-belgrada', name: 'Освобождение Белграда', year: 1994 },
  { slug: '100r-1995-pamyatnik-voinu-osvoboditelyu-treptov-park', name: 'Воин-освободитель', year: 1995 },
  { slug: '100r-1996-atomnyy-ledokol-arktika', name: 'Арктика', year: 1996 },
  // Сочи 2014
  { slug: '25r-2013-talismany-i-logotip-xi-paralimpiyskikh-zimnikh-igr-sochi-2014-cvetnoe', name: 'Талисманы и логотип XI Паралимпийских зимних игр', year: 2013 },
  { slug: '25r-2014-estafeta-olimpiyskogo-ognya-sochi-2014', name: 'Эстафета Олимпийского огня', year: 2014 },
  { slug: '25r-2014-estafeta-olimpiyskogo-ognya-sochi-2014-cvetnoe', name: 'Эстафета Олимпийского огня', year: 2014 },
  { slug: '25r-2014-emblema-xxii-olimpiyskikh-zimnikh-igr-sochi-2014', name: 'Эмблема XXII Олимпийских зимних игр', year: 2014 },
  { slug: '25r-2014-talismany-i-logotip-xi-paralimpiyskikh-zimnikh-igr-sochi-2014', name: 'Талисманы и логотип XI Паралимпийских', year: 2014 },
  { slug: '25r-2014-talismany-i-emblema-xxii-olimpiyskikh-zimnikh-igr-sochi-2014', name: 'Талисманы и эмблема XXII Олимпийских', year: 2014 },
  // Универсиада 2019 Красноярск
  { slug: '10r-2018-logotip-universiady-v-krasnoyarske', name: 'Логотип Универсиады', year: 2018 },
  { slug: '10r-2018-talisman-universiady-v-krasnoyarske', name: 'Талисман Универсиады', year: 2018 },
  // FIFA 2018
  { slug: '25r-2018-ofitsialnaya-emblema-chm-fifa-2018-cvetnoe', name: 'Официальная эмблема чемпионата мира FIFA 2018', year: 2018 },
  { slug: '25r-2018-ofitsialnaya-emblema-chm-fifa-2018', name: 'Официальная эмблема чемпионата мира FIFA 2018', year: 2018 },
  { slug: '25r-2018-kubok-chempionata-mira-po-futbolu-fifa', name: 'Кубок FIFA', year: 2018 },
  { slug: '25r-2018-kubok-chempionata-mira-po-futbolu-fifa-cvetnoe', name: 'Кубок FIFA', year: 2018 },
  { slug: '25r-2018-talisman-zabivaka', name: 'Забивака', year: 2018 },
  { slug: '25r-2018-talisman-zabivaka-cvetnoe', name: 'Забивака', year: 2018 },
  // 2021
  { slug: '25r-2021-yuriy-nikulin', name: 'Юрий Никулин', year: 2021 },
  { slug: '25r-2021-yuriy-nikulin-cvetnoe', name: 'Юрий Никулин', year: 2021 },
  { slug: '25r-2021-60-letie-pervogo-poleta-cheloveka-v-kosmos-cvetnoe', name: '60-летие первого полёта человека в космос', year: 2021 },
  { slug: '25r-2021-masha-i-medved-cvetnoe', name: 'Маша и Медведь', year: 2021 },
  // 2022
  { slug: '10r-2022-karachaevo-cherkesskaya-respublika', name: 'Карачаево-Черкесская Республика', year: 2022 },
  { slug: '25r-2022-vesyolaya-karusel-1-antoshka-cvetnoe', name: 'Антошка', year: 2022 },
  // 2023
  { slug: '25r-2023-alyonkiy-tsvetochek-cvetnoe', name: 'Алёнький цветочек', year: 2023 },
  // 2024
  { slug: '25r-2024-25-let-so-dnya-podpisaniya-dogovora-o-sozdanii-soyuznogo-gosudarstva-belarus-cvetnoe', name: 'Союзное государство', year: 2024 },
  // 2025
  { slug: '50r-2025-god-zashchitnika-otechestva-saur-mogila', name: 'Саур-Могила', year: 2025 },
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes; continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
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

function stripTags(html) {
  return (html || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function soapSearch(name, year) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SearchMonetXML xmlns="http://web.cbr.ru/">
      <SearchPhrase>${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</SearchPhrase>
      <year>${year}</year>
      <nominal>-1</nominal><metal_id>0</metal_id><serie_id>0</serie_id><is_investment>0</is_investment>
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
      <CatNumber>${cat}</CatNumber><Eng>false</Eng>
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

function parseSearchResults(xml) {
  const out = [];
  const re = /<CL>([\s\S]*?)<\/CL>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const cn = block.match(/<CatNumber>([^<]*)<\/CatNumber>/);
    const cname = block.match(/<cname>([\s\S]*?)<\/cname>/);
    const dt = block.match(/<DT>([^<]*)<\/DT>/);
    if (cn) out.push({
      CatNumber: stripTags(cn[1]),
      cname: cname ? stripTags(cname[1]) : '',
      dt: dt ? dt[1].trim() : ''
    });
  }
  return out;
}

function scoreMatch(cname, targetName) {
  const a = cname.toLowerCase().replace(/[«»"']/g, '');
  const b = targetName.toLowerCase().replace(/[«»"']/g, '');
  if (a === b) return 1000;
  let score = 0;
  const words = b.split(/\s+/).filter(w => w.length > 2);
  for (const w of words) { if (a.includes(w)) score += 3; }
  return score;
}

async function fetchMintageByName(name, year) {
  let xml;
  try { xml = await soapSearch(name, year); await sleep(DELAY_MS); } catch { return null; }

  const results = parseSearchResults(xml);
  let best = null, bestScore = 0;
  for (const r of results) {
    const rYear = r.dt ? new Date(r.dt).getFullYear() : null;
    if (rYear && Math.abs(rYear - year) > 2) continue;
    const score = scoreMatch(r.cname, name);
    if (score > bestScore) { bestScore = score; best = r; }
  }

  if (!best || bestScore < 3) return null;

  let detailXml;
  try { detailXml = await soapDetail(best.CatNumber); await sleep(DELAY_MS); } catch { return null; }

  const mMatch = detailXml.match(/<Mintage>([\s\S]*?)<\/Mintage>/);
  if (!mMatch) return null;
  const mintage = parseInt(mMatch[1].trim(), 10);
  if (!Number.isFinite(mintage) || mintage <= 0) return null;
  return { mintage, cname: best.cname, score: bestScore };
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  const iSlug = headers.indexOf('slug');
  const iMintage = headers.indexOf('тираж');
  const iType = headers.indexOf('type');

  const cells2d = lines.map(l => l.trim() ? parseCsvLine(l) : null);

  // Build index: slug → lineIdx
  const slugToIdx = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!cells2d[i]) continue;
    if (cells2d[i][iType] === 'jubilee' && Number(cells2d[i][iMintage]) === 0) {
      slugToIdx.set(cells2d[i][iSlug], i);
    }
  }

  let filled = 0, notFound = 0;

  // Pass 1: hardcoded
  for (const [slug, mintage] of Object.entries(HARDCODED)) {
    const idx = slugToIdx.get(slug);
    if (idx == null) continue;
    cells2d[idx][iMintage] = String(mintage);
    slugToIdx.delete(slug);
    filled++;
    console.log(`[HARDCODED] ${slug}: ${mintage.toLocaleString('ru-RU')}`);
  }

  // Pass 2: search overrides
  const remaining = SEARCH_OVERRIDES.filter(o => slugToIdx.has(o.slug));
  for (let i = 0; i < remaining.length; i++) {
    const { slug, name, year } = remaining[i];
    const idx = slugToIdx.get(slug);
    if (idx == null) continue;
    process.stdout.write(`[${i + 1}/${remaining.length}] ${slug} — `);

    const result = await fetchMintageByName(name, year);
    if (!result) {
      console.log('не найдено');
      notFound++;
      continue;
    }
    cells2d[idx][iMintage] = String(result.mintage);
    slugToIdx.delete(slug);
    filled++;
    console.log(`${result.mintage.toLocaleString('ru-RU')} (${result.cname}, score=${result.score})`);
  }

  // Rebuild CSV
  const newLines = cells2d.map((cells, idx) => {
    if (!cells) return lines[idx];
    return cells.map(escapeCsvField).join(',');
  });
  await writeFile(CSV_PATH, newLines.join('\n'), 'utf8');
  console.log(`\nГотово: заполнено ${filled}, не найдено ${notFound}`);
}

main().catch(console.error);
