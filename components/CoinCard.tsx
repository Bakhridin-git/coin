'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState, type MouseEvent } from 'react';
import { Coin } from '../lib/types';
import { formatCoinTitle } from '../lib/format';
import { getCanonicalSeries } from '../lib/series';

interface CoinCardProps {
  coin: Coin;
  /** Первые карточки страницы — приоритет загрузки (LCP). Остальные — lazy. */
  imagePriority?: boolean;
}

export function CoinCard({ coin, imagePriority = false }: CoinCardProps) {
  /** Как на странице монеты: false = реверс, true = аверс (кроссфейд, без 3D). */
  const [flipped, setFlipped] = useState(false);
  const title = formatCoinTitle(coin);
  const series = getCanonicalSeries(coin);
  const altSide = coin.name || coin.variant || title;
  const href = `/coins/${coin.slug}`;

  const onFlipClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFlipped((v) => !v);
  }, []);

  return (
    <div className="coin-card">
      <div className="coin-image-wrap">
        <Link href={href} className="coin-image-wrap__link">
          <div
            className={['coin-card-flip', flipped ? 'coin-card-flip--flipped' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <div className="coin-card-flip__inner">
              <div
                className="coin-card-flip__face coin-card-flip__face--front"
                aria-hidden={flipped}
              >
                <Image
                  src={coin.images.reverse}
                  alt={`Реверс — ${altSide}`}
                  width={600}
                  height={600}
                  priority={imagePriority}
                  loading={imagePriority ? undefined : 'lazy'}
                />
              </div>
              <div
                className="coin-card-flip__face coin-card-flip__face--back"
                aria-hidden={!flipped}
              >
                <Image
                  src={coin.images.obverse}
                  alt={`Аверс — ${altSide}`}
                  width={600}
                  height={600}
                  priority={false}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </Link>
        <button
          type="button"
          className="coin-flip-hint"
          onClick={onFlipClick}
          aria-label={flipped ? 'Показать реверс' : 'Показать аверс'}
        >
          ↻ перевернуть
        </button>
      </div>
      <Link href={href} className="coin-info" title={title}>
        {series && <div className="coin-series">{series.label}</div>}
        <div className="coin-name">{title}</div>
      </Link>
    </div>
  );
}

