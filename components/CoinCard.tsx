import Image from 'next/image';
import Link from 'next/link';
import { Coin } from '../lib/types';
import { formatCoinTitle } from '../lib/format';
import { getCanonicalSeries } from '../lib/series';

export function CoinCard({ coin }: { coin: Coin }) {
  const title = formatCoinTitle(coin);
  const series = getCanonicalSeries(coin);
  const altSide = coin.name || coin.variant || title;
  return (
    <Link className="coin-card" href={`/coins/${coin.slug}`}>
      <div className="coin-image-wrap">
        <Image src={coin.images.reverse} alt={`Реверс — ${altSide}`} width={600} height={600} />
        <span className="coin-flip-hint">↻ перевернуть</span>
      </div>
      <div className="coin-info">
        {series && <div className="coin-series">{series.label}</div>}
        <div className="coin-name">{title}</div>
      </div>
    </Link>
  );
}

