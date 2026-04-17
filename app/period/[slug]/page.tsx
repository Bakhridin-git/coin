import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CatalogPage, type CatalogScope } from '../../../components/CatalogPage';
import { getCatalogTreeData } from '../../../lib/catalog-data';
import { getPeriodBySlug, getSubPeriod, PERIODS } from '../../../lib/periods';
import { getSeriesBySlug } from '../../../lib/series';
import type { CoinType } from '../../../lib/types';
import '../../catalog.css';
import '../../filter-bar.css';

const COIN_TYPES: readonly CoinType[] = ['jubilee', 'regular', 'sets', 'regional'];

/**
 * When the URL has exactly one `type` value, we allow the Period to override
 * the H1 (e.g. /period/rf?type=regular → "Монеты современной России
 * регулярного чекана"). Multiple types or extra filters fall back to the
 * generic period H1 — the heading becomes ambiguous otherwise.
 */
function pickSingleType(raw: string | string[] | undefined): CoinType | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : null) : raw;
  if (!value || value.includes(',')) return null;
  return (COIN_TYPES as readonly string[]).includes(value) ? (value as CoinType) : null;
}

export function generateStaticParams() {
  return PERIODS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const period = getPeriodBySlug(slug);
  if (!period) return { title: 'Раздел не найден — Нумизмат РФ' };
  return {
    title: `${period.label} — каталог монет | Нумизмат РФ`,
    description: `Монеты периода «${period.label}». Фильтрация по типу, материалу, номиналу и году.`
  };
}

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const period = getPeriodBySlug(slug);
  if (!period) notFound();

  const { coins: all, tree, total } = await getCatalogTreeData();
  const coins = all.filter((c) => c.era === period.era);

  const sp = await searchParams;
  const singleType = pickSingleType(sp.type);
  const typeH1 = singleType ? period.typeH1?.[singleType] : undefined;

  // Серия поверх типа перебивает H1 и хлебные крошки: пользователь пришёл на
  // конкретную серию, заголовок должен это отражать.
  const rawSeries = Array.isArray(sp.series) ? sp.series[0] : sp.series;
  const activeSeries = rawSeries ? getSeriesBySlug(rawSeries) : undefined;
  const seriesH1 = activeSeries?.h1 ?? activeSeries?.label;

  // Подпериод имеет смысл только вместе с одиночным type (сейчас это всегда
  // `regular`). На пересечении «серия + подпериод» приоритет у серии — это
  // более узкий фильтр.
  const rawSub = Array.isArray(sp.sub) ? sp.sub[0] : sp.sub;
  const activeSubPeriod =
    singleType && !activeSeries ? getSubPeriod(period.era, singleType, rawSub) : undefined;

  const breadcrumb = [
    { label: 'Главная', href: '/' },
    { label: 'Все монеты', href: '/' },
    {
      label: period.label,
      href: activeSeries || activeSubPeriod ? `/period/${period.slug}` : undefined
    },
    ...(activeSeries ? [{ label: activeSeries.label }] : []),
    ...(activeSubPeriod ? [{ label: activeSubPeriod.label }] : [])
  ];

  const scope: CatalogScope = {
    basePath: `/period/${period.slug}`,
    activePeriodSlug: period.slug,
    title:
      seriesH1 ?? activeSubPeriod?.h1 ?? typeH1 ?? period.h1 ?? period.label,
    breadcrumb
  };

  return (
    <div className="catalog-scope">
      <CatalogPage
        coins={coins}
        scope={scope}
        categoryTree={tree}
        categoryTotal={total}
      />
    </div>
  );
}
