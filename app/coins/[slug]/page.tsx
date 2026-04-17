import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CoinDetailPage } from '../../../components/CoinDetailPage';
import { getCoinBySlug, getCoins } from '../../../lib/services/coins';
import { getCoinsSameCanonicalSeries } from '../../../lib/series';
import '../../coin-detail.css';

function sortSimilar(a: { year: number; slug: string }, b: { year: number; slug: string }): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.slug.localeCompare(b.slug, 'ru');
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const coin = await getCoinBySlug(slug);
  if (!coin) notFound();

  const all = await getCoins();
  let similar = getCoinsSameCanonicalSeries(coin, all).sort(sortSimilar);
  if (!similar.length) {
    similar = all.filter((c) => c.slug !== coin.slug).sort(sortSimilar);
  }

  return (
    <div className="coin-detail-scope">
      <Suspense fallback={null}>
        <CoinDetailPage coin={coin} similarCoins={similar} />
      </Suspense>
    </div>
  );
}
