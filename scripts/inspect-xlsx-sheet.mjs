/**
 * One-off: read Монеты для сайта.xlsx sheet1, print row fields.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const XLSX = path.join(ROOT, 'Монеты для сайта.xlsx');

function parseSharedStrings(xml) {
  const texts = [];
  const chunks = xml.split(/<si>/).slice(1);
  for (const ch of chunks) {
    const block = ch.split('</si>')[0];
    texts.push(block.replace(/<[^>]+>/g, ''));
  }
  return texts;
}

function cellRefCol(ref) {
  const m = ref.match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

function colToIndex(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n - 1;
}

async function main() {
  const xml = execFileSync('unzip', ['-p', XLSX, 'xl/worksheets/sheet1.xml'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  const ssXml = execFileSync('unzip', ['-p', XLSX, 'xl/sharedStrings.xml'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  const strings = parseSharedStrings(ssXml);

  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  /** @type {Map<number, Map<string, string | number>>} */
  const rows = new Map();
  let m;
  while ((m = rowRe.exec(xml)) !== null) {
    const r = Number(m[1]);
    const body = m[2];
    const cellRe = /<c r="([A-Z]+)(\d+)"[^>]*>(?:[^<]*<v>([^<]*)<\/v>)?/g;
    let cm;
    const map = new Map();
    while ((cm = cellRe.exec(body)) !== null) {
      const col = cm[1];
      const v = cm[2];
      if (v === undefined) continue;
      const num = Number(v);
      map.set(col, Number.isFinite(num) && String(num) === v ? num : v);
    }
    rows.set(r, map);
  }

  const header = rows.get(1);
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const resolve = (val) => {
    if (val == null) return '';
    const idx = Number(val);
    if (Number.isFinite(idx) && String(idx) === String(val)) return strings[idx] ?? val;
    return val;
  };

  console.log('Headers:', cols.map((c) => resolve(header?.get(c))).join(' | '));

  const out = [];
  for (let r = 2; r <= 250; r++) {
    const row = rows.get(r);
    if (!row) continue;
    const name = resolve(row.get('G'));
    const series = resolve(row.get('F'));
    const year = row.get('A');
    if (String(series).includes('Красная книга') || String(name).includes('тигр')) {
      out.push({ r, year, name, series, nom: resolve(row.get('B')) });
    }
  }
  console.log('\nRows mentioning Красная книга or тигр (sample):');
  out.slice(0, 40).forEach((x) => console.log(x.r, x.year, x.nom, '|', x.name));

  // dump rows 96-130 by row number from sheet (if exist)
  console.log('\nRows 96-115 (G=Название):');
  for (let r = 96; r <= 115; r++) {
    const row = rows.get(r);
    if (!row) continue;
    console.log(r, resolve(row.get('G')), '| F:', resolve(row.get('F')));
  }
}

main().catch(console.error);
