'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Coin } from '../lib/types';
import { getPeriodByEra } from '../lib/periods';
import { getCanonicalSeries } from '../lib/series';
import { formatCoinTitle, formatDenomination, formatPrice } from '../lib/format';

type GradeId = 'VF-20' | 'XF-40' | 'AU-50' | 'MS-63' | 'MS-65';

const GRADE_META: Record<GradeId, { name: string; desc: string }> = {
  'VF-20': { name: 'Very Fine', desc: 'Хорошая сохранность' },
  'XF-40': { name: 'Extremely Fine', desc: 'Отличная сохранность' },
  'AU-50': { name: 'About Uncirculated', desc: 'Почти не обращалась' },
  'MS-63': { name: 'Mint State', desc: 'Без следов обращения' },
  'MS-65': { name: 'Gem Uncirculated', desc: 'Превосходный экземпляр' }
};

const GRADE_ORDER: readonly GradeId[] = ['VF-20', 'XF-40', 'AU-50', 'MS-63', 'MS-65'] as const;

function gradeBadgeClass(g: GradeId): string {
  switch (g) {
    case 'VF-20':
      return 'grade-vf';
    case 'XF-40':
      return 'grade-xf';
    case 'AU-50':
      return 'grade-au';
    case 'MS-63':
      return 'grade-ms63';
    case 'MS-65':
      return 'grade-ms65';
  }
}

const MATERIAL_LABEL: Record<Coin['material'], string> = {
  galvanic: 'Сталь с гальваническим покрытием',
  gvs: 'Сталь с латунным покрытием',
  bimetal: 'Биметалл',
  cupronickel: 'Мельхиор',
  silver: 'Серебро',
  gold: 'Золото'
};

/**
 * Монетный двор с подсказкой «Москва / Санкт-Петербург» только для известных
 * полных обозначений. Для одиночных букв (Л/М/СП) и «Без двора» показываем
 * текст как есть — badge ничего не добавил бы, только запутал.
 */
function renderMint(mint: string): ReactNode {
  if (!mint) return '';
  if (mint === 'ММД') return <>ММД <span className="badge">Москва</span></>;
  if (mint === 'СПМД') return <>СПМД <span className="badge">Санкт‑Петербург</span></>;
  if (mint === 'ЛМД') return <>ЛМД <span className="badge">Ленинград</span></>;
  return mint;
}

/**
 * Строка спецификации.
 *   - `required: true`  — строка всегда присутствует, пустое значение → «—».
 *   - `required: false` (по умолчанию) — строка скрывается, если значения нет.
 *
 * Обязательные поля нужны, чтобы карточка монеты была структурно единообразной
 * (номинал/год/двор/материал/диаметр/толщина/вес/гурт всегда на одних позициях),
 * а опциональные (Разновидность, Серия) — показываются только когда актуальны.
 */
function SpecRow({
  label,
  value,
  required = false
}: {
  label: string;
  value: ReactNode;
  required?: boolean;
}) {
  const isEmpty =
    value == null || (typeof value === 'string' && value.trim() === '');
  if (isEmpty && !required) return null;
  return (
    <div className="specs-row">
      <span className="specs-key">{label}</span>
      <span className="specs-val">{isEmpty ? '—' : value}</span>
    </div>
  );
}

interface CoinDetailPageProps {
  coin: Coin;
  similarCoins: Coin[];
}

export function CoinDetailPage({ coin, similarCoins }: CoinDetailPageProps) {
  const [flipped, setFlipped] = useState(false);
  const [activeThumb, setActiveThumb] = useState<'reverse' | 'obverse'>('reverse');
  const [grade, setGrade] = useState<GradeId>('MS-63');

  const flipLabel = flipped ? 'Аверс' : 'Реверс';

  const prices = useMemo(
    () =>
      ({
        'VF-20': formatPrice(coin.prices.vf20),
        'XF-40': formatPrice(coin.prices.ef40),
        'AU-50': formatPrice(coin.prices.au50),
        'MS-63': formatPrice(coin.prices.ms63),
        'MS-65': formatPrice(coin.prices.ms65)
      }) as Record<GradeId, string>,
    [coin.prices]
  );

  const title = formatCoinTitle(coin);
  const denomLabel = formatDenomination(coin.denomination, coin.denominationUnit);
  const series = getCanonicalSeries(coin);

  const flipBoxRef = useRef<HTMLDivElement | null>(null);
  const specsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const flipBox = flipBoxRef.current;
      const specs = specsRef.current;
      if (!flipBox || !specs) return;
      if (window.innerWidth >= 769) {
        flipBox.style.height = `${specs.offsetHeight}px`;
      } else {
        flipBox.style.height = '';
      }
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const period = useMemo(() => getPeriodByEra(coin.era), [coin.era]);

  // Описания обеих сторон и карточки «О монете» формируются из данных монеты.
  // Жёсткие упоминания конкретной серии убраны — это универсальный рендер.
  const reverseDescription = coin.name
    ? `На реверсе — изображения, связанные с темой «${coin.name}»${series ? ` (серия «${series.label}»)` : ''}. Номинал — ${denomLabel}.`
    : `Реверс монеты ${denomLabel} ${coin.year} года${coin.mint ? `, ${coin.mint}` : ''}.`;
  const obverseDescription = `Герб Российской Федерации. По кругу надпись «Банк России», внизу год выпуска «${coin.year}»${coin.mint ? `, обозначение монетного двора — ${coin.mint}` : ''}.`;
  const aboutDescription =
    coin.description && coin.description.trim().length > 0
      ? coin.description
      : coin.name
        ? `${coin.name} — памятная монета${series ? ` серии «${series.label}»` : ''}, выпущенная в ${coin.year} году${coin.mint ? ` на ${coin.mint}` : ''}.`
        : `Монета ${denomLabel} ${coin.year} года${coin.mint ? `, ${coin.mint}` : ''}.`;

  const onFlip = () => {
    setFlipped((v) => !v);
    setActiveThumb((v) => (v === 'reverse' ? 'obverse' : 'reverse'));
  };

  return (
    <>
      <div className="main">
        <nav className="breadcrumb" aria-label="Хлебные крошки">
          <Link href="/">Главная</Link> ›<Link href="/">Монеты</Link>
          {period && (
            <>
              {' ›'}
              <Link href={`/period/${period.slug}`}>{period.label}</Link>
            </>
          )}
          {' ›'}
          <span>{title}</span>
        </nav>

        <div className="coin-title-block" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="coin-title" style={{ marginBottom: 0 }}>
              {title}
            </h1>
          </div>
        </div>

        <div className="coin-page">
          <div className="coin-images">
            <div ref={flipBoxRef} className={flipped ? 'flip-container flipped' : 'flip-container'} onClick={onFlip}>
              <div className="flip-inner">
                <div className="flip-front">
                  <Image src={coin.images.reverse} alt={`Реверс — ${coin.name}`} width={900} height={900} />
                </div>
                <div className="flip-back">
                  <Image src={coin.images.obverse} alt={`Аверс — ${coin.name}`} width={900} height={900} />
                </div>
              </div>
              <span className="flip-label">{flipLabel}</span>
              <button
                className="flip-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onFlip();
                }}
              >
                ↻ Перевернуть
              </button>
            </div>

            <button className="flip-btn-mobile" onClick={onFlip}>
              ↻ Перевернуть монету
            </button>

            <div className="thumbnails">
              <div
                className={activeThumb === 'reverse' ? 'thumb active' : 'thumb'}
                onClick={() => {
                  setFlipped(false);
                  setActiveThumb('reverse');
                }}
              >
                <Image src={coin.images.reverse} alt="Реверс" width={600} height={600} />
                <span className="thumb-label">Реверс</span>
              </div>
              <div
                className={activeThumb === 'obverse' ? 'thumb active' : 'thumb'}
                onClick={() => {
                  setFlipped(true);
                  setActiveThumb('obverse');
                }}
              >
                <Image src={coin.images.obverse} alt="Аверс" width={600} height={600} />
                <span className="thumb-label">Аверс</span>
              </div>
            </div>
          </div>

          <div className="coin-info">
            <div className="price-block">
              <div style={{ marginBottom: 14 }}>
                <div className="section-title">Стоимость</div>
              </div>

              <div className="grades-grid">
                {GRADE_ORDER.map((g) => (
                  <div key={g} className={g === 'MS-63' || g === 'MS-65' ? 'grade-card grade-card--highlight' : 'grade-card'}>
                    <div className={`grade-badge ${gradeBadgeClass(g)}`}>{g}</div>
                    <div className="grade-name">{GRADE_META[g].name}</div>
                    <div className="grade-desc">{GRADE_META[g].desc}</div>
                    <div className="grade-price">{prices[g]}</div>
                  </div>
                ))}
              </div>

              <div className="grade-scale-mobile">
                <div className="grade-scale-track">
                  <div className="grade-scale-line" />
                  {GRADE_ORDER.map((g) => (
                    <div key={g} className="grade-dot-wrap">
                      <button
                        className={g === grade ? 'grade-dot active' : 'grade-dot'}
                        onClick={() => setGrade(g)}
                        aria-label={`Выбрать состояние ${g}`}
                      />
                      <span className="grade-dot-label">{g}</span>
                    </div>
                  ))}
                </div>
                <div className="grade-scale-info">
                  <div className="grade-scale-name">
                    <span className="grade-scale-code">{grade}</span>
                    <span className="grade-scale-grade-name">{GRADE_META[grade].name}</span>
                  </div>
                  <div className="grade-scale-price">{prices[grade]}</div>
                </div>
              </div>
            </div>

            <div ref={specsRef} className="specs">
              <SpecRow required label="Номинал" value={denomLabel} />
              <SpecRow required label="Год" value={String(coin.year)} />
              <SpecRow required label="Монетный двор" value={renderMint(coin.mint)} />
              {coin.variant && <SpecRow label="Разновидность" value={coin.variant} />}
              <SpecRow required label="Материал" value={MATERIAL_LABEL[coin.material] ?? ''} />
              <SpecRow
                required
                label="Тираж"
                value={coin.mintage > 0 ? `${coin.mintage.toLocaleString('ru-RU')} шт.` : ''}
              />
              {series && <SpecRow label="Серия" value={series.label} />}
              {period && <SpecRow required label="Период" value={period.label} />}
              <SpecRow
                required
                label="Диаметр"
                value={coin.diameterMm > 0 ? `${coin.diameterMm.toFixed(1).replace('.', ',')} мм` : ''}
              />
              <SpecRow
                required
                label="Толщина"
                value={coin.thicknessMm > 0 ? `${coin.thicknessMm.toFixed(1).replace('.', ',')} мм` : ''}
              />
              <SpecRow
                required
                label="Вес"
                value={coin.weightG > 0 ? `${coin.weightG.toFixed(2).replace('.', ',')} г` : ''}
              />
              <SpecRow required label="Гурт" value={coin.edge} />
            </div>

            <div className="coin-info-extras-mobile">
              <div className="sides">
                <div className="side-card">
                  <div className="side-card-title">Реверс</div>
                  <p>{reverseDescription}</p>
                </div>
                <div className="side-card">
                  <div className="side-card-title">Аверс</div>
                  <p>{obverseDescription}</p>
                </div>
              </div>

              <div className="side-card">
                <div className="side-card-title">О монете</div>
                <p className="coin-about-copy">{aboutDescription}</p>
              </div>
            </div>
          </div>
        </div>

        <section className="coin-secondary-desktop" aria-label="Дополнительное описание монеты">
          <div className="coin-secondary-block">
            <div className="side-card">
              <div className="side-card-title">О монете</div>
              <p className="coin-about-copy">{aboutDescription}</p>
            </div>
          </div>

          <div className="coin-secondary-block">
            <div className="sides">
              <div className="side-card">
                <div className="side-card-title">Реверс</div>
                <p>{reverseDescription}</p>
              </div>
              <div className="side-card">
                <div className="side-card-title">Аверс</div>
                <p>{obverseDescription}</p>
              </div>
            </div>
          </div>
        </section>

        {similarCoins.length > 0 && (
          <section className="similar-coins" aria-labelledby="similar-coins-title">
            <div className="similar-coins-header">
              <h2 className="similar-coins-title" id="similar-coins-title">
                Похожие монеты
              </h2>
              {series && (
                <p className="similar-coins-subtitle">Из той же серии: {series.label}</p>
              )}
            </div>
            <div className="similar-coins-grid">
              {similarCoins.slice(0, 8).map((c) => {
                const cSeries = getCanonicalSeries(c);
                const cTitle = formatCoinTitle(c);
                return (
                  <Link key={c.slug} href={`/coins/${c.slug}`} className="similar-coin-card">
                    <div className="similar-coin-image">
                      <Image src={c.images.reverse} alt={`Реверс — ${cTitle}`} width={600} height={600} />
                    </div>
                    <div className="similar-coin-body">
                      {cSeries && <span className="similar-coin-series">{cSeries.label}</span>}
                      <div className="similar-coin-name">{cTitle}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
