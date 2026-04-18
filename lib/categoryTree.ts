import type { Coin, CoinType } from './types';
import { PARAM } from './constants';
import { PERIODS, type Period } from './periods';
import { ALL_SERIES, getCanonicalSeries } from './series';

/**
 * Hierarchical catalog tree, used by the left sidebar on desktop and the
 * hamburger drawer on mobile. Three levels: era → type → series (для юбилейных).
 * Every leaf points at a pre-filtered catalog URL.
 */
export interface CategoryNode {
  /** Stable key for React lists. */
  id: string;
  label: string;
  /** Target URL — the whole row navigates here. */
  href: string;
  count: number;
  children?: CategoryNode[];
}

const TYPE_ORDER: ReadonlyArray<{ id: CoinType; label: string }> = [
  { id: 'jubilee', label: 'Юбилейные и памятные' },
  { id: 'regular', label: 'Регулярные' },
  { id: 'sets', label: 'Наборы' },
  { id: 'regional', label: 'Региональные' }
];

function buildSubPeriodChildren(
  period: Period,
  type: CoinType,
  coinsOfType: Coin[]
): CategoryNode[] {
  const subs = period.subPeriods?.[type];
  if (!subs) return [];
  return subs.flatMap((sp) => {
    const n = coinsOfType.filter((c) => c.subPeriod === sp.slug).length;
    if (n === 0) return [];
    return [{
      id: `${period.slug}-${type}-${sp.slug}`,
      label: sp.label,
      href: `/period/${period.slug}?${PARAM.type}=${type}&${PARAM.sub}=${sp.slug}`,
      count: n
    }];
  });
}

function buildSeriesChildren(
  periodSlug: string,
  jubileeCoins: Coin[]
): CategoryNode[] {
  // Считаем монеты по каноническим сериям. Пустые серии в дерево не попадают —
  // пользователю нет смысла кликать на узел со счётчиком 0.
  const counts = new Map<string, number>();
  for (const coin of jubileeCoins) {
    const s = getCanonicalSeries(coin);
    if (!s) continue;
    counts.set(s.slug, (counts.get(s.slug) ?? 0) + 1);
  }
  return ALL_SERIES
    .flatMap((s) => {
      const n = counts.get(s.slug) ?? 0;
      if (n === 0) return [];
      return [{
        id: `${periodSlug}-jubilee-${s.slug}`,
        label: s.label,
        href: `/period/${periodSlug}?${PARAM.type}=jubilee&${PARAM.series}=${s.slug}`,
        count: n
      }];
    })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

export function buildCategoryTree(coins: Coin[]): CategoryNode[] {
  return PERIODS.map((period) => {
    const eraCoins = coins.filter((c) => c.era === period.era);

    const typeChildren: CategoryNode[] = TYPE_ORDER.flatMap(({ id, label }) => {
      const ofType = eraCoins.filter((c) => c.type === id);
      if (ofType.length === 0) return [];

      const node: CategoryNode = {
        id: `${period.slug}-${id}`,
        label,
        href: `/period/${period.slug}?${PARAM.type}=${id}`,
        count: ofType.length
      };

      // Третий уровень: для юбилейных — канонические серии, для регулярных —
      // подпериоды, описанные в lib/periods.ts (до/после деноминации 1998).
      if (id === 'jubilee') {
        const series = buildSeriesChildren(period.slug, ofType);
        if (series.length > 0) node.children = series;
      } else if (id === 'regular') {
        const subs = buildSubPeriodChildren(period, 'regular', ofType);
        if (subs.length > 0) node.children = subs;
      }

      return [node];
    });

    return {
      id: period.slug,
      label: `Монеты ${period.genitiveLabel}`,
      href: `/period/${period.slug}`,
      count: eraCoins.length,
      children: typeChildren.length > 0 ? typeChildren : undefined
    };
  });
}

/** Total coin count across all eras. Used for the "Все монеты" row. */
export function totalCoinCount(tree: CategoryNode[]): number {
  return tree.reduce((sum, node) => sum + node.count, 0);
}
