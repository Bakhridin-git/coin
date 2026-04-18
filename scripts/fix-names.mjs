#!/usr/bin/env node
/**
 * Сравнивает названия монет на сайте с официальными названиями ЦБ
 * и обновляет CSV для совпадений с высоким score.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_PATH = path.join(process.cwd(), 'data', 'coins.csv');
const CBR_SOAP = 'https://www.cbr.ru/CoinsBaseWS/CoinsBaseWS.asmx';
const DELAY_MS = 350;

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

function normalize(s) {
  return s.toLowerCase()
    .replace(/[«»"'„"]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const a = normalize(cname);
  const b = normalize(targetName);
  if (a === b) return 1000;
  // Check if site name is contained in CBR name
  if (a.includes(b)) return 50;
  let score = 0;
  const words = b.split(/\s+/).filter(w => w.length > 2);
  for (const w of words) { if (a.includes(w)) score += 3; }
  if (words[0] && a.startsWith(words[0].slice(0, 4))) score += 5;
  return score;
}

async function findCbrName(name, year) {
  let xml;
  try { xml = await soapSearch(name, year); await sleep(DELAY_MS); } catch { return null; }
  const results = parseSearchResults(xml);
  let best = null, bestScore = 0;
  for (const r of results) {
    const rYear = r.dt ? new Date(r.dt).getFullYear() : null;
    if (rYear && Math.abs(rYear - year) > 1) continue;
    const score = scoreMatch(r.cname, name);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  if (!best || bestScore < 6) return null;
  return { cname: best.cname, score: bestScore };
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  const iSlug = headers.indexOf('slug');
  const iName = headers.indexOf('название');
  const iYear = headers.indexOf('год');
  const iType = headers.indexOf('type');

  const cells2d = lines.map(l => l.trim() ? parseCsvLine(l) : null);

  const jubilee = [];
  for (let i = 1; i < lines.length; i++) {
    if (!cells2d[i]) continue;
    if (cells2d[i][iType] !== 'jubilee') continue;
    jubilee.push({ lineIdx: i, slug: cells2d[i][iSlug], name: cells2d[i][iName], year: Number(cells2d[i][iYear]) });
  }

  console.log(`Всего юбилейных: ${jubilee.length}`);

  const changes = [];
  let same = 0, diff = 0, notFound = 0;

  for (let i = 0; i < jubilee.length; i++) {
    const { lineIdx, slug, name, year } = jubilee[i];
    process.stdout.write(`[${i + 1}/${jubilee.length}] ${slug} — `);

    const result = await findCbrName(name, year);
    if (!result) {
      console.log('не найдено');
      notFound++;
      continue;
    }

    const normSite = normalize(name);
    const normCbr = normalize(result.cname);

    if (normSite === normCbr) {
      console.log(`OK`);
      same++;
      continue;
    }

    console.log(`РАЗНИЦА (score=${result.score})\n  сайт: ${name}\n  ЦБ:   ${result.cname}`);
    diff++;
    changes.push({ lineIdx, slug, oldName: name, newName: result.cname, score: result.score });
  }

  console.log(`\nИтого: совпало=${same}, расхождений=${diff}, не найдено=${notFound}`);

  if (changes.length === 0) {
    console.log('Нет изменений для применения.');
    return;
  }

  // Apply changes — only score >= 9 to avoid false positives
  const toApply = changes.filter(c => c.score >= 9);
  console.log(`\nПрименяем ${toApply.length} из ${changes.length} (score >= 9):`);
  for (const c of toApply) {
    console.log(`  ${c.slug}: "${c.oldName}" → "${c.newName}"`);
    cells2d[c.lineIdx][iName] = c.newName;
  }

  const skipped = changes.filter(c => c.score < 9);
  if (skipped.length > 0) {
    console.log(`\nПропущено (score < 9, требуют ручной проверки):`);
    for (const c of skipped) {
      console.log(`  [score=${c.score}] ${c.slug}\n    сайт: ${c.oldName}\n    ЦБ:   ${c.newName}`);
    }
  }

  const newLines = cells2d.map((cells, idx) => {
    if (!cells) return lines[idx];
    return cells.map(escapeCsvField).join(',');
  });
  await writeFile(CSV_PATH, newLines.join('\n'), 'utf8');
  console.log(`\nCSV обновлён. Изменено ${toApply.length} названий.`);
}

main().catch(console.error);
