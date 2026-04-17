#!/usr/bin/env node
/**
 * Импорт регулярных монет РФ из Excel-файла, который ведёт PM вручную
 * (прайс-лист по годам/дворам/разновидностям).
 *
 * Источник:  ./Монеты для сайта.xlsx
 * Цель:      ./data/coins.csv  (дописываем новые строки, существующие не трогаем)
 *
 * Поведение:
 *   - парсит xlsx «сыро» (через распаковку zip + простой XML-парсер,
 *     без внешних npm-зависимостей);
 *   - каждая строка XLSX → одна запись Coin (Разновидности = отдельные монеты);
 *   - slug формируется по правилу {ном}{ед}-{год}-{двор}[-{вариант}];
 *   - существующие slug'и (уже есть в coins.csv) не перезаписываются,
 *     чтобы не затирать ручные правки — такие строки пропускаются
 *     и отчитываются отдельно;
 *   - `--dry-run` — ничего не пишет, только печатает отчёт;
 *   - `--verbose` — печатает первые 20 строк для визуального контроля.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

// ---------------------------- CLI -------------------------------------------

const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry-run');
const VERBOSE = ARGS.has('--verbose');
/**
 * `--update` — если slug уже есть в CSV, перезаписать строку новыми данными
 * из XLSX. Без этого флага существующие строки пропускаются (поведение
 * по умолчанию для безопасности — не затираем ручные правки PM).
 */
const UPDATE = ARGS.has('--update');
const XLSX_PATH = 'Монеты для сайта.xlsx';
const CSV_PATH = 'data/coins.csv';

// ---------------------------- XLSX reader -----------------------------------

/**
 * Распаковывает .xlsx (это просто zip) во временный каталог через системный
 * `unzip`. Выбран вместо npm-пакета, чтобы не тащить зависимости.
 */
async function unpackXlsx(xlsxPath) {
  const out = path.resolve('tmp/xlsx-regular');
  await mkdir(out, { recursive: true });
  execSync(`unzip -q -o "${xlsxPath}" -d "${out}"`);
  return out;
}

function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>(?:<t(?:\s[^>]*)?>([^<]*)<\/t>|<r>([\s\S]*?)<\/r>)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] != null) out.push(m[1]);
    else {
      // rich text — собираем все <t> внутри <r>
      const parts = [];
      const rt = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
      let rm;
      while ((rm = rt.exec(m[2]))) parts.push(rm[1]);
      out.push(parts.join(''));
    }
  }
  return out;
}

/** "E6" → { col: 4, row: 6 } (0-based column, 1-based row). */
function refToRC(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) };
}

function parseSheet(xml, shared) {
  const rows = {};
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  // Клетки с содержимым (между `<c ...>...</c>`). Самозакрывающиеся
  // `<c r="X1" .../>` в данных без значения — пропускаем отдельно.
  const cellRe = /<c\s+r="([A-Z]+\d+)"([^/>]*)>([\s\S]*?)<\/c>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const body = rm[1];
    let cm;
    while ((cm = cellRe.exec(body))) {
      const ref = refToRC(cm[1]);
      if (!ref) continue;
      const attrs = cm[2] || '';
      const inner = cm[3];
      const tm = /\st="([^"]+)"/.exec(attrs);
      const type = tm ? tm[1] : 'n';
      let value = '';
      if (type === 's') {
        const v = /<v>(\d+)<\/v>/.exec(inner);
        value = v ? (shared[parseInt(v[1], 10)] ?? '') : '';
      } else if (type === 'str' || type === 'inlineStr') {
        const t = /<t[^>]*>([^<]*)<\/t>/.exec(inner);
        value = t ? t[1] : '';
      } else {
        const v = /<v>([^<]*)<\/v>/.exec(inner);
        value = v ? v[1] : '';
      }
      (rows[ref.row] ||= []);
      rows[ref.row][ref.col] = value;
    }
  }
  return Object.entries(rows)
    .map(([r, v]) => [parseInt(r, 10), v])
    .sort((a, b) => a[0] - b[0]);
}

// ---------------------------- Mapping helpers -------------------------------

const DENOM_RE = /^(\d+)\s*(руб(?:ль|ля|лей)?|коп(?:ейка|ейки|еек)?)/i;

function parseDenom(raw) {
  const m = DENOM_RE.exec(String(raw || '').trim());
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = /руб/i.test(m[2]) ? 'рубль' : 'копейка';
  return { value, unit };
}

/** slug-часть монетного двора. Одиночные буквы и «Без двора» — по ТЗ, не сворачиваем. */
const MINT_SLUG = {
  'ММД': 'mmd',
  'СПМД': 'spmd',
  'ЛМД': 'lmd',
  'М': 'm',
  'СП': 'sp',
  'Л': 'l',
  'Без двора': 'nodvd'
};

/** Единица номинала в slug: «рубль» → r, «копейка» → k. */
const UNIT_SLUG = { рубль: 'r', копейка: 'k' };

/**
 * Нормализация разновидности (Особенность в XLSX):
 *   - приводим к канонической форме («магнит.» → «магнитная» и т.п.);
 *   - пустая строка означает «нет разновидности».
 */
function normalizeVariant(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  // Важно: regex привязан к началу строки, иначе «немагнит.» частично
  // совпадает с «магнит.» и даёт ложный «магнитная».
  if (/^магнитная$|^магнит\.?$/.test(v)) return 'магнитная';
  if (/^немагнитная$|^немагнит\.?$/.test(v)) return 'немагнитная';
  if (/^биметалл/.test(v)) return 'биметалл';
  if (/широк.*кант/.test(v)) return 'широкий кант';
  return v;
}

/** Разновидность → slug-фрагмент. */
const VARIANT_SLUG = {
  'магнитная': 'magnitn',
  'немагнитная': 'nemagnitn',
  'биметалл': 'bimetal',
  'широкий кант': 'shkant'
};

/** Материал по году/разновидности/номиналу. */
function classifyMaterial(year, unit, value, variant) {
  if (variant === 'биметалл') return 'bimetal';
  if (unit === 'копейка') {
    // 1, 5 копеек — латунь на стали (gvs). 10, 50 копеек — латунь (до 2006)
    // или латунь-сталь (после). Все немагнитные до 2006 — 'gvs' (приблизительно).
    // В рамках MVP ставим 'gvs' для всех копеек.
    return 'gvs';
  }
  // 10 рублей с 2009 — сталь с латунным покрытием (gvs).
  if (unit === 'рубль' && value === 10 && year >= 2009) return 'gvs';
  // 10 рублей 1991–1993 — биметалл или галваника (обычно galvanic).
  // 1, 2, 5 рублей — мельхиоровое покрытие на стали / чистый мельхиор.
  return 'cupronickel';
}

function buildSlug({ value, unit, year, mint, variant }) {
  const parts = [`${value}${UNIT_SLUG[unit] ?? ''}`, String(year)];
  const mintSlug = MINT_SLUG[mint] ?? '';
  if (mintSlug) parts.push(mintSlug);
  const varSlug = VARIANT_SLUG[variant] ?? '';
  if (varSlug) parts.push(varSlug);
  return parts.join('-');
}

function subPeriodFor(year) {
  // Два подпериода для era=rf — соответствуют нумизматической хронологии:
  //   pre-reform  — монеты до деноминации 1998 (1991‒1996);
  //   post-reform — после деноминации (1997‒нв).
  if (year <= 1996) return 'pre-reform';
  return 'post-reform';
}

// ---------------------------- CSV helpers -----------------------------------

function parseCsv(raw) {
  const rows = [];
  let i = 0, f = '', row = [], q = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (q) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(f); f = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      if (f.length || row.length) { row.push(f); rows.push(row); }
      row = []; f = '';
      if (ch === '\r' && raw[i + 1] === '\n') i += 2; else i++;
      continue;
    }
    f += ch; i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function csvEsc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------- Main ------------------------------------------

async function main() {
  // 1) Парсим XLSX
  const dir = await unpackXlsx(XLSX_PATH);
  const [sheetXml, sharedXml] = await Promise.all([
    readFile(path.join(dir, 'xl/worksheets/sheet1.xml'), 'utf8'),
    readFile(path.join(dir, 'xl/sharedStrings.xml'), 'utf8')
  ]);
  const shared = parseSharedStrings(sharedXml);
  const sheetRows = parseSheet(sheetXml, shared);

  const [, head] = sheetRows.shift(); // первая строка — заголовки
  const hi = Object.fromEntries(head.map((h, i) => [String(h).trim(), i]));
  const REQUIRED = ['Год', 'Номинал', 'Двор', 'Особенность', 'VF', 'XF', 'AU', 'UNC', 'MS65'];
  for (const k of REQUIRED) if (hi[k] == null) throw new Error(`XLSX: нет колонки «${k}»`);

  // 2) Читаем существующий CSV, чтобы понять какие slug уже заняты
  const rawCsv = await readFile(CSV_PATH, 'utf8');
  const csvRows = parseCsv(rawCsv).filter(r => r.length > 1);
  const csvHead = csvRows.shift();
  const existingSlugs = new Set(csvRows.map(r => r[csvHead.indexOf('slug')]));

  // 3) Маппим каждую строку XLSX в Coin-запись
  const mapped = [];
  const skipped = [];

  for (const [rowNum, cells] of sheetRows) {
    const year = parseInt(String(cells[hi['Год']] || '').trim(), 10);
    const denom = parseDenom(cells[hi['Номинал']]);
    const mintRaw = String(cells[hi['Двор']] || '').trim();
    const variant = normalizeVariant(cells[hi['Особенность']]);

    if (!Number.isFinite(year) || !denom || !mintRaw) {
      skipped.push({ row: rowNum, reason: 'невалидная строка', cells });
      continue;
    }
    const mint = mintRaw === 'Без двора' ? 'Без двора' : mintRaw;
    const slug = buildSlug({
      value: denom.value,
      unit: denom.unit,
      year,
      mint,
      variant
    });

    const vf = numOrEmpty(cells[hi['VF']]);
    const ef = numOrEmpty(cells[hi['XF']]);
    const au = numOrEmpty(cells[hi['AU']]);
    const ms63 = numOrEmpty(cells[hi['UNC']]);
    const ms65 = numOrEmpty(cells[hi['MS65']]);

    mapped.push({
      slug,
      'название': '',
      'номинал': denom.value,
      'единица_номинала': denom.unit,
      'год': year,
      'монетный_двор': mint,
      'era': 'rf',
      'sub_period': subPeriodFor(year),
      'type': 'regular',
      'material': classifyMaterial(year, denom.unit, denom.value, variant),
      'series': '',
      'разновидность': variant,
      'тираж': '',
      'диаметр_мм': '',
      'толщина_мм': '',
      'вес_г': '',
      'гурт': '',
      'цена_vf20': vf,
      'цена_ef40': ef,
      'цена_au50': au,
      'цена_ms63': ms63,
      'цена_ms65': ms65,
      'описание': ''
    });
  }

  // 4) Отфильтровать дубликаты slug внутри импорта (на всякий случай)
  const seen = new Set();
  const dupInImport = [];
  const uniqMapped = [];
  for (const m of mapped) {
    if (seen.has(m.slug)) { dupInImport.push(m.slug); continue; }
    seen.add(m.slug);
    uniqMapped.push(m);
  }

  // 5) Отделить новые от уже имеющихся
  const toAdd = uniqMapped.filter((m) => !existingSlugs.has(m.slug));
  const toUpdate = uniqMapped.filter((m) => existingSlugs.has(m.slug));

  // 6) Отчёт
  console.log('—— XLSX → coins.csv ——');
  console.log(`Строк в XLSX: ${sheetRows.length}`);
  console.log(`Мэплено:      ${mapped.length}`);
  console.log(`Пропущено:    ${skipped.length}`);
  console.log(`Дубликаты slug внутри XLSX: ${dupInImport.length}`);
  console.log(`Уже есть в CSV: ${toUpdate.length}  (${UPDATE ? 'перезапишутся цены' : 'пропущены — используй --update'})`);
  console.log(`К добавлению:   ${toAdd.length}`);
  if (VERBOSE) {
    console.log('\nПервые 20 новых:');
    for (const m of toAdd.slice(0, 20)) {
      console.log(`  + ${m.slug}  (${m['номинал']} ${m['единица_номинала']} ${m['год']} ${m['монетный_двор']}${m['разновидность'] ? ` «${m['разновидность']}»` : ''})`);
    }
    if (skipped.length) {
      console.log('\nПропущенные строки (первые 10):');
      for (const s of skipped.slice(0, 10)) console.log(`  row=${s.row}  ${s.reason}  ${JSON.stringify(s.cells)}`);
    }
    if (dupInImport.length) {
      console.log('\nДубликаты внутри XLSX:', dupInImport);
    }
  }

  if (DRY) {
    console.log('\n(dry-run — ничего не записано)');
    return;
  }

  // 7) Обновляем существующие строки (если --update) и дописываем новые.
  //    Обновляем только поля, которые контролирует XLSX: цены, двор,
  //    разновидность, номинал/год (на случай исправлений PM). Технические
  //    характеристики (материал, вес, диаметр и т.д.) не трогаем — они
  //    заполнены руками/скриптом fill-specs и могли быть уточнены.
  const UPDATABLE_COLS = [
    'монетный_двор',
    'разновидность',
    'номинал',
    'единица_номинала',
    'год',
    'цена_vf20',
    'цена_ef40',
    'цена_au50',
    'цена_ms63',
    'цена_ms65'
  ];

  let updatedCount = 0;
  if (UPDATE) {
    const bySlug = new Map(toUpdate.map((m) => [m.slug, m]));
    for (const row of csvRows) {
      const rowSlug = row[csvHead.indexOf('slug')];
      const next = bySlug.get(rowSlug);
      if (!next) continue;
      for (const col of UPDATABLE_COLS) {
        const ci = csvHead.indexOf(col);
        if (ci === -1) continue;
        const v = next[col];
        if (v !== undefined && v !== '') row[ci] = String(v);
      }
      updatedCount += 1;
    }
  }

  const newLines = toAdd.map((m) => csvHead.map((col) => csvEsc(m[col] ?? '')).join(','));
  const updatedCsvBody = [csvHead, ...csvRows].map((r) => r.map(csvEsc).join(',')).join('\n');
  const newCsv = updatedCsvBody + (newLines.length ? '\n' + newLines.join('\n') : '') + '\n';
  await writeFile(CSV_PATH, newCsv, 'utf8');
  console.log(`\nДобавлено ${toAdd.length} строк, обновлено ${updatedCount} в ${CSV_PATH}`);
}

function numOrEmpty(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  // Excel хранит целые как «50.0» — нормализуем до целого.
  return Number.isInteger(n) ? String(n) : String(n);
}

main().catch((err) => {
  console.error('ERR:', err);
  process.exit(1);
});
