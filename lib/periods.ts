import type { CoinEra, CoinType } from './types';

/**
 * Top-level periods drive the main navigation. Every period maps 1:1 to a
 * CoinEra value. Ordered the way they appear in the nav.
 */
export interface Period {
  slug: string;
  era: CoinEra;
  /** Short label for tabs / breadcrumbs. */
  label: string;
  shortLabel: string;
  /** Used in phrases like "Монеты {genitiveLabel}". */
  genitiveLabel: string;
  /** Long form shown as the page H1. Falls back to label when omitted. */
  h1?: string;
  /**
   * Page H1 overrides when a single `type` filter is active.
   * Example: RF + type=regular → "Монеты современной России регулярного чекана".
   * Breadcrumb/nav keep the short label; only the big catalog heading changes.
   */
  typeH1?: Partial<Record<CoinType, string>>;
  /**
   * Подпериоды — второй уровень для конкретного типа монет (пока только
   * `regular`). Каждый подпериод задаёт slug (значение `subPeriod` в CSV),
   * заголовок в меню и H1 для страницы каталога.
   */
  subPeriods?: Partial<Record<CoinType, readonly SubPeriod[]>>;
}

export interface SubPeriod {
  /** Соответствует полю `sub_period` в CSV. */
  slug: string;
  /** Лейбл в меню и чипе фильтра. */
  label: string;
  /** H1 страницы каталога при активном подпериоде. */
  h1: string;
}

export const PERIODS: readonly Period[] = [
  {
    slug: 'rf',
    era: 'rf',
    label: 'Российская Федерация',
    shortLabel: 'РФ',
    genitiveLabel: 'Российской Федерации',
    h1: 'Коллекционные монеты России',
    typeH1: {
      regular: 'Монеты современной России регулярного чекана'
    },
    subPeriods: {
      regular: [
        {
          slug: 'pre-reform',
          label: 'до реформы (1992–1993)',
          h1: 'Регулярные монеты России до деноминации 1998 года'
        },
        {
          slug: 'post-reform',
          label: 'после реформы (1997–нв)',
          h1: 'Регулярные монеты России после деноминации 1998 года'
        }
      ]
    }
  },
  {
    slug: 'ussr',
    era: 'ussr',
    label: 'СССР и РСФСР',
    shortLabel: 'СССР',
    genitiveLabel: 'СССР и РСФСР'
  },
  {
    slug: 'empire',
    era: 'empire',
    label: 'Российская Империя',
    shortLabel: 'Империя',
    genitiveLabel: 'Российской Империи'
  },
  {
    slug: 'ancient',
    era: 'ancient',
    label: 'Древняя Русь',
    shortLabel: 'Древняя Русь',
    genitiveLabel: 'Древней Руси'
  }
] as const;

export function getPeriodBySlug(slug: string): Period | undefined {
  return PERIODS.find((p) => p.slug === slug);
}

export function getPeriodByEra(era: CoinEra): Period | undefined {
  return PERIODS.find((p) => p.era === era);
}

export function getSubPeriod(
  era: CoinEra,
  type: CoinType,
  slug: string | null | undefined
): SubPeriod | undefined {
  if (!slug) return undefined;
  const list = getPeriodByEra(era)?.subPeriods?.[type];
  return list?.find((s) => s.slug === slug);
}
