import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Coin, DenominationUnit } from '../types';

async function pickPublicImage(slug: string, side: 'obverse' | 'reverse'): Promise<string> {
  const baseFs = path.join(process.cwd(), 'public', 'images', 'coins');
  const basePublic = `/images/coins/${slug}-${side}`;
  const candidates = [
    { fs: path.join(baseFs, `${slug}-${side}.jpg`), public: `${basePublic}.jpg` },
    { fs: path.join(baseFs, `${slug}-${side}.jpeg`), public: `${basePublic}.jpeg` },
    { fs: path.join(baseFs, `${slug}-${side}.webp`), public: `${basePublic}.webp` },
    { fs: path.join(baseFs, `${slug}-${side}.png`), public: `${basePublic}.png` }
  ];

  for (const c of candidates) {
    try {
      await access(c.fs);
      return c.public;
    } catch {
      // continue
    }
  }

  return '/images/coin-placeholder.svg';
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
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

function toNumber(value: string, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for ${fieldName}: "${value}"`);
  }
  return n;
}

/**
 * Парсит число из CSV, возвращая `null` для пустых клеток. Нужен для цен:
 * PM заполняет не все градации сразу, отсутствующее значение — это «нет данных»,
 * а не «0 рублей».
 */
function toNumberOrNull(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrZero(value: string | undefined): number {
  if (value == null) return 0;
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function parseDenominationUnit(raw: string | undefined): DenominationUnit {
  const v = (raw ?? '').trim();
  return v === 'копейка' || v === 'копейки' || v === 'копеек' || v === 'kop' ? 'копейка' : 'рубль';
}

let cached: Coin[] | null = null;
let cachedMtimeMs = 0;

export async function getCoins(): Promise<Coin[]> {
  const csvPath = path.join(process.cwd(), 'data', 'coins.csv');
  const st = await stat(csvPath);
  if (cached && st.mtimeMs === cachedMtimeMs) return cached;

  const raw = await readFile(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return [];

  const cols = parseCsvLine(header);
  const req = (name: string) => {
    const i = cols.indexOf(name);
    if (i === -1) throw new Error(`Missing CSV column: ${name}`);
    return i;
  };
  /** Опциональные колонки (новые). Если в CSV их нет — читаем с дефолтами. */
  const opt = (name: string) => cols.indexOf(name);

  const iSlug = req('slug');
  const iName = req('название');
  const iDenom = req('номинал');
  const iYear = req('год');
  const iMint = req('монетный_двор');
  const iEra = req('era');
  const iSub = req('sub_period');
  const iType = req('type');
  const iMat = req('material');
  const iSer = req('series');
  const iMintage = req('тираж');
  const iDiam = req('диаметр_мм');
  const iThick = req('толщина_мм');
  const iWeight = req('вес_г');
  const iEdge = req('гурт');
  const iVf = req('цена_vf20');
  const iEf = req('цена_ef40');
  const iAu = req('цена_au50');
  const iMs63 = req('цена_ms63');
  const iMs65 = req('цена_ms65');
  const iDesc = req('описание');
  const iUnit = opt('единица_номинала');
  const iVariant = opt('разновидность');

  const result: Coin[] = lines.map((line) => {
    const cells = parseCsvLine(line);

    const coin: Coin = {
      slug: cells[iSlug] ?? '',
      name: cells[iName] ?? '',
      denomination: toNumber(cells[iDenom] ?? '', 'номинал'),
      denominationUnit: parseDenominationUnit(iUnit >= 0 ? cells[iUnit] : undefined),
      year: toNumber(cells[iYear] ?? '', 'год'),
      mint: cells[iMint] ?? '',
      era: (cells[iEra] ?? 'rf') as Coin['era'],
      subPeriod: cells[iSub] ?? '',
      type: (cells[iType] ?? 'jubilee') as Coin['type'],
      material: (cells[iMat] ?? 'galvanic') as Coin['material'],
      series: cells[iSer] ?? '',
      variant: (iVariant >= 0 ? cells[iVariant] : '') ?? '',
      mintage: toNumberOrZero(cells[iMintage]),
      diameterMm: toNumberOrZero(cells[iDiam]),
      thicknessMm: toNumberOrZero(cells[iThick]),
      weightG: toNumberOrZero(cells[iWeight]),
      edge: cells[iEdge] ?? '',
      prices: {
        vf20: toNumberOrNull(cells[iVf]),
        ef40: toNumberOrNull(cells[iEf]),
        au50: toNumberOrNull(cells[iAu]),
        ms63: toNumberOrNull(cells[iMs63]),
        ms65: toNumberOrNull(cells[iMs65])
      },
      images: {
        obverse: '',
        reverse: ''
      },
      description: cells[iDesc] ?? ''
    };

    return coin;
  });

  const withImages = await Promise.all(
    result.map(async (c) => ({
      ...c,
      images: {
        obverse: await pickPublicImage(c.slug, 'obverse'),
        reverse: await pickPublicImage(c.slug, 'reverse')
      }
    }))
  );

  cached = withImages;
  cachedMtimeMs = st.mtimeMs;
  return withImages;
}

export async function getCoinBySlug(slug: string): Promise<Coin | null> {
  const coins = await getCoins();
  return coins.find((c) => c.slug === slug) ?? null;
}

