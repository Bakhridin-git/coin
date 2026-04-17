import type { Coin } from './types';
import { getCanonicalSeries } from './series';

/**
 * Поиск с толерантностью к опечаткам и сокращениям. Запрос токенизируется
 * по буквам/цифрам, каждый токен приводится к каноничной форме (синонимы
 * единиц: «р», «руб», «рубль», «₽» → «рубль»; то же для копеек) и ищется
 * в haystack монеты. Чтобы монета матчилась, КАЖДЫЙ токен запроса должен
 * найти совпадение — это порядок-независимый AND, привычный пользователю.
 *
 * Вынесено в отдельный модуль, чтобы `lib/services/search` и Route Handler
 * не тянули весь `catalog.ts` (иначе возможны ошибки Webpack при смешении графов).
 */

const UNIT_SYNONYMS: Record<string, string> = {
  р: 'рубль', руб: 'рубль', рубль: 'рубль', рубля: 'рубль', рубле: 'рубль', рублей: 'рубль',
  rub: 'рубль', rur: 'рубль',
  к: 'копейка', коп: 'копейка', копейка: 'копейка',
  копеек: 'копейка', копейки: 'копейка', копейке: 'копейка'
};

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

function tokenize(s: string): string[] {
  const raw = normalizeText(s).match(/[a-zа-я0-9]+/g) ?? [];
  const out: string[] = [];
  for (const token of raw) {
    const numFirst = token.match(/^(\d+)([a-zа-я]+)$/);
    if (numFirst) {
      const [, num, word] = numFirst;
      out.push(num!);
      out.push(UNIT_SYNONYMS[word!] ?? word!);
      continue;
    }
    const wordFirst = token.match(/^([a-zа-я]+)(\d+)$/);
    if (wordFirst) {
      const [, word, num] = wordFirst;
      out.push(num!);
      out.push(UNIT_SYNONYMS[word!] ?? word!);
      continue;
    }
    out.push(UNIT_SYNONYMS[token] ?? token);
  }
  return out;
}

function levenshteinAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    diff += 1;
    if (diff > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) {
      i++;
    } else {
      j++;
    }
  }
  if (i < a.length || j < b.length) diff += 1;
  return diff <= 1;
}

function tokenMatches(needle: string, hay: string[]): boolean {
  const isNumeric = /^\d+$/.test(needle);
  for (const h of hay) {
    if (h === needle) return true;
    if (isNumeric) continue;
    if (needle.length >= 3 && h.length >= needle.length && h.includes(needle)) return true;
    if (needle.length >= 4 && h.length >= 4 && levenshteinAtMostOne(needle, h)) return true;
  }
  return false;
}

function buildHaystack(coin: Coin): string[] {
  const parts: string[] = [];
  parts.push(...tokenize(coin.name));
  parts.push(...tokenize(coin.slug));
  parts.push(String(coin.denomination));
  parts.push(String(coin.year));
  if (coin.mint) parts.push(...tokenize(coin.mint));
  parts.push(coin.denominationUnit);
  const series = getCanonicalSeries(coin);
  if (series) {
    parts.push(...tokenize(series.label));
    parts.push(...tokenize(series.slug));
  }
  return parts;
}

/** Внутреннее совпадение с `filters.q` (использует `catalog.applyFilters`). */
export function matchesQuery(coin: Coin, q: string): boolean {
  if (!q || !q.trim()) return true;
  const needles = tokenize(q);
  if (needles.length === 0) return true;
  const hay = buildHaystack(coin);
  return needles.every((n) => tokenMatches(n, hay));
}

/** Публичный алиас для API подсказок и сервисов. */
export function coinMatchesSearchQuery(coin: Coin, q: string): boolean {
  return matchesQuery(coin, q);
}
