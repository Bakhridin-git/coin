import type { Coin, CoinMaterial, CoinType, DenominationUnit } from './types';
import { PARAM } from './constants';
import { getCanonicalSeries } from './series';
import { matchesQuery } from './search-query';

export { PARAM };

/**
 * Ключ номинала для фильтра — пара (значение, единица). Нужен потому что
 * «10 рублей» и «10 копеек» — это разные монеты, а одного числа в URL
 * для их различения недостаточно.
 */
export interface DenominationKey {
  value: number;
  unit: DenominationUnit;
}

/**
 * Сериализация `DenominationKey` для URL и ключей объектов с подсчётами.
 * Формат: `{number}{r|k}`, например `"10r"` или `"50k"`.
 */
export function denomKeyToString(key: DenominationKey): string {
  return `${key.value}${key.unit === 'копейка' ? 'k' : 'r'}`;
}

/**
 * Парсер обратной функции. Для совместимости со старыми ссылками строка
 * без суффикса (`"10"`) интерпретируется как рубль.
 */
export function parseDenomKey(raw: string | null | undefined): DenominationKey | null {
  if (!raw) return null;
  const m = /^(\d+)([kr])?$/i.exec(raw.trim());
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit: DenominationUnit = m[2]?.toLowerCase() === 'k' ? 'копейка' : 'рубль';
  return { value, unit };
}

/**
 * Catalog filters / sorting live in URL query params. Everything in this file
 * is pure: it reads/writes URLSearchParams and applies filters to a coin list.
 * UI components call these helpers and don't own state.
 */

export const SORT_IDS = [
  'popular',
  'new',
  'newBottom',
  'cheapFirst',
  'expensiveFirst',
  'yearAsc',
  'yearDesc'
] as const;

export type SortId = (typeof SORT_IDS)[number];

export const DEFAULT_SORT: SortId = 'popular';

export const SORT_LABELS: Record<SortId, string> = {
  popular: 'По популярности',
  new: 'Новинки',
  newBottom: 'Новые снизу',
  cheapFirst: 'Сначала дешевые',
  expensiveFirst: 'Сначала дорогие',
  yearAsc: 'Год: по возрастанию',
  yearDesc: 'Год: по убыванию'
};

export const COIN_TYPE_OPTIONS: ReadonlyArray<{ id: CoinType; label: string }> = [
  { id: 'jubilee', label: 'Юбилейные' },
  { id: 'regular', label: 'Регулярные' },
  { id: 'sets', label: 'Наборы' },
  { id: 'regional', label: 'Региональные' }
];

export const COIN_MATERIAL_OPTIONS: ReadonlyArray<{ id: CoinMaterial; label: string }> = [
  { id: 'galvanic', label: 'Гальваника' },
  { id: 'bimetal', label: 'Биметалл' },
  { id: 'silver', label: 'Серебро' },
  { id: 'gold', label: 'Золото' },
  { id: 'cupronickel', label: 'Медно-никелевый сплав' },
  { id: 'gvs', label: 'Сталь/гальваника' }
];

/**
 * Обозначения монетных дворов. В порядке убывания распространённости:
 * сначала полные маркировки РФ, затем одиночные буквы СССР/переходного
 * периода (встречаются у регулярных монет 1991–1993), затем редкий
 * вариант «Без двора» у отдельных копеечных выпусков.
 */
export const MINT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'ММД', label: 'ММД' },
  { id: 'СПМД', label: 'СПМД' },
  { id: 'М', label: 'М' },
  { id: 'Л', label: 'Л' },
  { id: 'СП', label: 'СП' },
  { id: 'Без двора', label: 'Без двора' }
];

export interface CatalogFilters {
  q: string;
  types: CoinType[];
  materials: CoinMaterial[];
  mints: string[];
  /** Canonical series slug (см. lib/series.ts). `null` — без фильтра по серии. */
  series: string | null;
  /**
   * Slug подпериода (см. lib/periods.ts → SubPeriod). Пока используется только
   * для `type=regular` в эре `rf` (`pre-reform` / `post-reform`). `null` — без
   * фильтра. Значение сопоставляется с полем `subPeriod` у монеты.
   */
  subPeriod: string | null;
  /**
   * Выбранные номиналы (значение + единица). Пустой массив — без фильтра.
   * В URL — через запятую, как `type`/`material`: `"10r,50k"`.
   */
  denominations: DenominationKey[];
  /** Inclusive lower bound for year. `null` means "no lower bound". */
  yearFrom: number | null;
  /** Inclusive upper bound for year. `null` means "no upper bound". */
  yearTo: number | null;
  sort: SortId;
}

function parseIntOrNull(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isCoinType(v: string): v is CoinType {
  return v === 'regular' || v === 'jubilee' || v === 'sets' || v === 'regional';
}

function isCoinMaterial(v: string): v is CoinMaterial {
  return (
    v === 'bimetal' ||
    v === 'gvs' ||
    v === 'silver' ||
    v === 'gold' ||
    v === 'cupronickel' ||
    v === 'galvanic'
  );
}

function isSortId(v: string): v is SortId {
  return (SORT_IDS as readonly string[]).includes(v);
}

function parseDenominationList(raw: string | null): DenominationKey[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: DenominationKey[] = [];
  for (const part of splitCsv(raw)) {
    const d = parseDenomKey(part);
    if (!d) continue;
    const k = denomKeyToString(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const rawSort = params.get(PARAM.sort);
  const rawSeries = params.get(PARAM.series);
  const rawSub = params.get(PARAM.sub);
  return {
    q: params.get(PARAM.q) ?? '',
    types: splitCsv(params.get(PARAM.type)).filter(isCoinType),
    materials: splitCsv(params.get(PARAM.material)).filter(isCoinMaterial),
    mints: splitCsv(params.get(PARAM.mint)),
    series: rawSeries && rawSeries.trim() ? rawSeries.trim() : null,
    subPeriod: rawSub && rawSub.trim() ? rawSub.trim() : null,
    denominations: parseDenominationList(params.get(PARAM.denomination)),
    yearFrom: parseIntOrNull(params.get(PARAM.yearFrom)),
    yearTo: parseIntOrNull(params.get(PARAM.yearTo)),
    sort: rawSort && isSortId(rawSort) ? rawSort : DEFAULT_SORT
  };
}

/**
 * Turns filters into a URLSearchParams-ready map. Empty values are dropped so
 * the URL stays tidy.
 */
export function serializeFilters(filters: CatalogFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.q.trim()) out[PARAM.q] = filters.q.trim();
  if (filters.types.length) out[PARAM.type] = filters.types.join(',');
  if (filters.materials.length) out[PARAM.material] = filters.materials.join(',');
  if (filters.mints.length) out[PARAM.mint] = filters.mints.join(',');
  if (filters.series) out[PARAM.series] = filters.series;
  if (filters.subPeriod) out[PARAM.sub] = filters.subPeriod;
  if (filters.denominations.length)
    out[PARAM.denomination] = filters.denominations.map(denomKeyToString).join(',');
  if (filters.yearFrom != null) out[PARAM.yearFrom] = String(filters.yearFrom);
  if (filters.yearTo != null) out[PARAM.yearTo] = String(filters.yearTo);
  if (filters.sort !== DEFAULT_SORT) out[PARAM.sort] = filters.sort;
  return out;
}

/**
 * Собирает query для каталога. `page` в URL только если > 1 (первая страница без параметра).
 */
export function buildSearchString(filters: CatalogFilters, page: number = 1): string {
  const entries = Object.entries(serializeFilters(filters));
  if (page > 1) entries.push([PARAM.page, String(page)]);
  if (entries.length === 0) return '';
  const usp = new URLSearchParams(entries);
  return `?${usp.toString()}`;
}

/** Номер страницы из query (`page`), минимум 1. */
export function parsePageParam(params: URLSearchParams): number {
  const raw = params.get(PARAM.page);
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function applyFilters(coins: Coin[], filters: CatalogFilters): Coin[] {
  const filtered = coins.filter((coin) => {
    if (!matchesQuery(coin, filters.q)) return false;
    if (filters.types.length && !filters.types.includes(coin.type)) return false;
    if (filters.materials.length && !filters.materials.includes(coin.material)) return false;
    if (filters.mints.length && !filters.mints.includes(coin.mint)) return false;
    if (filters.series && getCanonicalSeries(coin)?.slug !== filters.series) return false;
    if (filters.subPeriod && coin.subPeriod !== filters.subPeriod) return false;
    if (filters.denominations.length) {
      const coinKey = denomKeyToString({
        value: coin.denomination,
        unit: coin.denominationUnit
      });
      if (!filters.denominations.some((d) => denomKeyToString(d) === coinKey)) return false;
    }
    if (filters.yearFrom != null && coin.year < filters.yearFrom) return false;
    if (filters.yearTo != null && coin.year > filters.yearTo) return false;
    return true;
  });

  return applySort(filtered, filters.sort);
}


export function applySort(coins: Coin[], sort: SortId): Coin[] {
  const arr = [...coins];
  switch (sort) {
    case 'new':
    case 'yearDesc':
      return arr.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'ru'));
    case 'newBottom':
    case 'yearAsc':
      return arr.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name, 'ru'));
    case 'cheapFirst':
      return arr.sort((a, b) => {
        const pa = a.prices.ms63;
        const pb = b.prices.ms63;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
    case 'expensiveFirst':
      return arr.sort((a, b) => {
        const pa = a.prices.ms63;
        const pb = b.prices.ms63;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      });
    case 'popular':
    default:
      return arr;
  }
}

export interface FilterCounts {
  type: Record<CoinType, number>;
  material: Record<CoinMaterial, number>;
  mint: Record<string, number>;
  /** Ключ — строковое представление `DenominationKey` (`"10r"`, `"50k"`). */
  denomination: Record<string, number>;
}

function _count(coins: Coin[]): FilterCounts {
  const counts: FilterCounts = {
    type: { regular: 0, jubilee: 0, sets: 0, regional: 0 },
    material: { bimetal: 0, gvs: 0, silver: 0, gold: 0, cupronickel: 0, galvanic: 0 },
    mint: {},
    denomination: {}
  };
  for (const c of coins) {
    counts.type[c.type]++;
    counts.material[c.material]++;
    counts.mint[c.mint] = (counts.mint[c.mint] ?? 0) + 1;
    const dkey = denomKeyToString({ value: c.denomination, unit: c.denominationUnit });
    counts.denomination[dkey] = (counts.denomination[dkey] ?? 0) + 1;
  }
  return counts;
}

export function countByFilter(coins: Coin[]): FilterCounts {
  return _count(coins);
}

/**
 * Faceted counts: each dimension is counted against coins filtered by all
 * OTHER active dimensions. This way selecting a type still shows available
 * materials/mints/denominations within that type, and multi-select within a
 * dimension (e.g. two materials) keeps showing all options for that dimension.
 */
export function facetCounts(coins: Coin[], filters: CatalogFilters): FilterCounts {
  const without = (omit: Partial<CatalogFilters>) =>
    applyFilters(coins, { ...filters, sort: 'popular', ...omit });

  const forType     = without({ types: [] });
  const forMaterial = without({ materials: [] });
  const forMint     = without({ mints: [] });
  const forDenom    = without({ denominations: [] });

  return {
    type:         _count(forType).type,
    material:     _count(forMaterial).material,
    mint:         _count(forMint).mint,
    denomination: _count(forDenom).denomination,
  };
}

/** Number of filter categories currently non-default. Used for the badge. */
export function activeFilterCount(filters: CatalogFilters): number {
  let n = 0;
  if (filters.types.length) n++;
  if (filters.materials.length) n++;
  if (filters.mints.length) n++;
  if (filters.series) n++;
  if (filters.subPeriod) n++;
  if (filters.denominations.length) n++;
  if (filters.yearFrom != null || filters.yearTo != null) n++;
  return n;
}

/**
 * Уникальные номиналы для фильтра. Копейки идут первыми (по возрастанию),
 * за ними — рубли. Такой порядок совпадает с ожиданиями пользователя:
 * сначала младшие номиналы, потом старшие.
 */
export function denominationOptions(coins: Coin[]): DenominationKey[] {
  const seen = new Map<string, DenominationKey>();
  for (const c of coins) {
    const key: DenominationKey = { value: c.denomination, unit: c.denominationUnit };
    const s = denomKeyToString(key);
    if (!seen.has(s)) seen.set(s, key);
  }
  return Array.from(seen.values()).sort((a, b) => {
    if (a.unit !== b.unit) return a.unit === 'копейка' ? -1 : 1;
    return a.value - b.value;
  });
}

/** Sorted unique list of years present in the dataset. */
export function yearOptions(coins: Coin[]): number[] {
  return Array.from(new Set(coins.map((c) => c.year))).sort((a, b) => a - b);
}
