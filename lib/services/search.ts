import { coinMatchesSearchQuery } from '../search-query';
import { formatCoinTitle } from '../format';
import type { Coin } from '../types';
import { getCoins } from './coins';

const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 2;

export interface SearchSuggestionDTO {
  slug: string;
  title: string;
}

function sortForSuggestions(a: Coin, b: Coin): number {
  if (b.year !== a.year) return b.year - a.year;
  return a.name.localeCompare(b.name, 'ru');
}

/**
 * Подсказки для строки поиска — те же правила совпадения, что и `filters.q` в каталоге.
 */
export async function getSearchSuggestions(q: string): Promise<SearchSuggestionDTO[]> {
  const trimmed = q.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const coins = await getCoins();
  const matched = coins.filter((c) => coinMatchesSearchQuery(c, trimmed));
  matched.sort(sortForSuggestions);

  return matched.slice(0, MAX_SUGGESTIONS).map((c) => ({
    slug: c.slug,
    title: formatCoinTitle(c)
  }));
}
