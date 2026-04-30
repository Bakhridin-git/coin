import { CatalogPageClient, type CatalogScope } from '../components/CatalogPageClient';
import { getCatalogTreeData } from '../lib/catalog-data';
import {
  applyFilters,
  denominationOptions,
  facetCounts,
  parseFilters,
  parsePageParam,
  yearOptions
} from '../lib/catalog';
import { CATALOG_PAGE_SIZE } from '../lib/constants';
import './catalog.css';
import './filter-bar.css';

const HOME_SCOPE: CatalogScope = {
  basePath: '/',
  activePeriodSlug: null,
  title: 'Коллекционные юбилейные и регулярные монеты',
  breadcrumb: [{ label: 'Главная', href: '/' }, { label: 'Все монеты' }]
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { coins, tree, total } = await getCatalogTreeData();
  const sp = await searchParams;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v[0] != null) usp.set(k, v[0]);
    } else {
      usp.set(k, v);
    }
  }

  const filters = parseFilters(usp);
  const visible = applyFilters(coins, filters);
  const counts = facetCounts(coins, filters);
  const denominations = denominationOptions(coins);
  const years = yearOptions(coins);

  const pageFromUrl = parsePageParam(usp);
  const totalPages = Math.max(1, Math.ceil(Math.max(1, visible.length) / CATALOG_PAGE_SIZE));
  const effectivePage = Math.min(Math.max(1, pageFromUrl), totalPages);
  const startIdx = (effectivePage - 1) * CATALOG_PAGE_SIZE;
  const pagedCoins = visible.slice(startIdx, startIdx + CATALOG_PAGE_SIZE);

  return (
    <div className="catalog-scope">
      <CatalogPageClient
        pagedCoins={pagedCoins}
        totalVisible={visible.length}
        totalAll={coins.length}
        totalPages={totalPages}
        effectivePage={effectivePage}
        counts={counts}
        denominations={denominations}
        years={years}
        scope={HOME_SCOPE}
        categoryTree={tree}
        categoryTotal={total}
      />
    </div>
  );
}
