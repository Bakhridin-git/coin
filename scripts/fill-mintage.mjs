#!/usr/bin/env node
/**
 * Заполняет поле тираж (тираж) для юбилейных монет с тиражом=0
 * из API Банка России (SOAP CoinsBaseWS).
 *
 * Запуск: node scripts/fill-mintage.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_PATH = path.join(process.cwd(), 'data', 'coins.csv');
const CBR_SOAP = 'https://www.cbr.ru/CoinsBaseWS/CoinsBaseWS.asmx';
const DELAY_MS = 300;

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
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
  return (html || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function soapSearch(name, year) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SearchMonetXML xmlns="http://web.cbr.ru/">
      <SearchPhrase>${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</SearchPhrase>
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

function parseSearchResults(xml) {
  const out = [];
  const re = /<CL>([\s\S]*?)<\/CL>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const cn = block.match(/<CatNumber>([^<]*)<\/CatNumber>/);
    const cname = block.match(/<cname>([\s\S]*?)<\/cname>/);
    const nominal = block.match(/<nominal>([\s\S]*?)<\/nominal>/);
    const dt = block.match(/<DT>([^<]*)<\/DT>/);
    if (cn) out.push({
      CatNumber: stripTags(cn[1]),
      cname: cname ? stripTags(cname[1]) : '',
      nominal: nominal ? stripTags(nominal[1]) : '',
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
  for (const w of words) {
    if (a.includes(w)) score += 3;
  }
  if (words[0] && a.startsWith(words[0].slice(0, 4))) score += 5;
  return score;
}

function buildSearchAttempts(name) {
  const out = new Set();
  out.add(name);
  const noParen = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen !== name) out.add(noParen);
  const noComma = name.split(',')[0].trim();
  if (noComma !== name) out.add(noComma);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 3) out.add(words.slice(-3).join(' '));
  if (words.length >= 2) out.add(words.slice(-2).join(' '));
  return [...out].filter(Boolean);
}

async function fetchMintage(coinName, year) {
  const attempts = buildSearchAttempts(coinName);
  let bestMatch = null;
  let bestScore = 0;

  for (const attempt of attempts) {
    let xml;
    try {
      xml = await soapSearch(attempt, year);
      await sleep(DELAY_MS);
    } catch { continue; }

    const results = parseSearchResults(xml);
    for (const r of results) {
      // Check year from DT field
      const rYear = r.dt ? new Date(r.dt).getFullYear() : null;
      if (rYear && Math.abs(rYear - year) > 1) continue;

      const score = scoreMatch(r.cname, coinName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = r;
      }
    }
    if (bestScore >= 1000) break;
    if (bestScore > 6) break; // good enough
  }

  if (!bestMatch || bestScore < 3) return null;

  // Fetch detail to get mintage
  let detailXml;
  try {
    detailXml = await soapDetail(bestMatch.CatNumber);
    await sleep(DELAY_MS);
  } catch { return null; }

  const mMatch = detailXml.match(/<Mintage>([\s\S]*?)<\/Mintage>/);
  if (!mMatch) return null;
  const mintage = parseInt(mMatch[1].trim(), 10);
  if (!Number.isFinite(mintage) || mintage <= 0) return null;

  return { mintage, catNumber: bestMatch.CatNumber, cname: bestMatch.cname, score: bestScore };
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const header = lines[0];
  const headers = parseCsvLine(header);

  const iSlug = headers.indexOf('slug');
  const iName = headers.indexOf('название');
  const iYear = headers.indexOf('год');
  const iType = headers.indexOf('type');
  const iMintage = headers.indexOf('тираж');

  if ([iSlug, iName, iYear, iType, iMintage].includes(-1)) {
    console.error('Не найдена колонка в CSV');
    process.exit(1);
  }

  const toFill = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    if (cells[iType] !== 'jubilee') continue;
    if (Number(cells[iMintage]) > 0) continue;
    toFill.push({ lineIdx: i, slug: cells[iSlug], name: cells[iName], year: Number(cells[iYear]) });
  }

  console.log(`Монет без тиража: ${toFill.length}`);

  const cells2d = lines.map(l => l.trim() ? parseCsvLine(l) : null);

  let filled = 0;
  let notFound = 0;

  for (let i = 0; i < toFill.length; i++) {
    const { lineIdx, slug, name, year } = toFill[i];
    process.stdout.write(`[${i + 1}/${toFill.length}] ${slug} (${year}) — `);

    const result = await fetchMintage(name, year);
    if (!result) {
      console.log('не найдено');
      notFound++;
      continue;
    }

    const cells = cells2d[lineIdx];
    cells[iMintage] = String(result.mintage);
    cells2d[lineIdx] = cells;
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
