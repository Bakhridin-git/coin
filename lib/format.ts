import type { Coin, DenominationUnit } from './types';

/**
 * Русское склонение для числовых форм. `forms` — [1, 2-4, 5+].
 * Например: `['рубль', 'рубля', 'рублей']` → 1 рубль, 2 рубля, 5 рублей.
 */
export function ruPlural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 > 10 && mod100 < 20) return forms[2];
  if (mod10 > 1 && mod10 < 5) return forms[1];
  if (mod10 === 1) return forms[0];
  return forms[2];
}

const UNIT_FORMS: Record<DenominationUnit, [string, string, string]> = {
  рубль: ['рубль', 'рубля', 'рублей'],
  копейка: ['копейка', 'копейки', 'копеек']
};

/** «1 рубль», «10 рублей», «50 копеек». */
export function formatDenomination(
  value: number,
  unit: DenominationUnit
): string {
  return `${value} ${ruPlural(value, UNIT_FORMS[unit])}`;
}

/**
 * Полный заголовок карточки/страницы монеты:
 *   «10 рублей 2011 ММД Белгород»
 *   «1 рубль 1992 ЛМД (немагнитная)»
 *   «10 копеек 1997 СП»
 */
export function formatCoinTitle(coin: Coin): string {
  const parts: string[] = [formatDenomination(coin.denomination, coin.denominationUnit), String(coin.year)];
  if (coin.mint) parts.push(coin.mint);
  if (coin.name) parts.push(coin.name);
  const base = parts.join(' ');
  return coin.variant ? `${base} (${coin.variant})` : base;
}

/** Цена с разделителями тысяч и рублём. `null` → «—». */
export function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `${price.toLocaleString('ru-RU')} ₽`;
}
