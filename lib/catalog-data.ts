import { cache } from 'react';
import { buildCategoryTree, totalCoinCount, type CategoryNode } from './categoryTree';
import { getCoins } from './services/coins';
import type { Coin } from './types';

export type CatalogTreePayload = {
  coins: Coin[];
  tree: CategoryNode[];
  total: number;
};

/**
 * Один проход по CSV + построение дерева категорий на запрос.
 * React.cache дедуплицирует вызов между layout и страницами каталога
 * в одном RSC-рендере (раньше дерево собиралось дважды).
 */
export const getCatalogTreeData = cache(async (): Promise<CatalogTreePayload> => {
  try {
    const coins = await getCoins();
    const tree = buildCategoryTree(coins);
    const total = totalCoinCount(tree);
    return { coins, tree, total };
  } catch (e) {
    console.error('[getCatalogTreeData] каталог недоступен, отдаём пустые данные:', e);
    return { coins: [], tree: [], total: 0 };
  }
});
