export type CoinEra = 'ancient' | 'empire' | 'ussr' | 'rf';
export type CoinType = 'regular' | 'jubilee' | 'sets' | 'regional';
export type CoinMaterial = 'bimetal' | 'gvs' | 'silver' | 'gold' | 'cupronickel' | 'galvanic';
/** Единица номинала. «рубль» — монеты в рублях, «копейка» — разменные. */
export type DenominationUnit = 'рубль' | 'копейка';

/**
 * Цены хранятся как `number | null`, потому что редко по какой монете известны
 * все пять градаций. `null` = «данных нет», в UI рендерим «—».
 */
export interface CoinPrices {
  vf20: number | null;
  ef40: number | null;
  au50: number | null;
  ms63: number | null;
  ms65: number | null;
}

export interface CoinImages {
  obverse: string;
  reverse: string;
}

export interface Coin {
  slug: string;
  name: string;
  denomination: number;
  /** Единица номинала. Нужна, чтобы отличить «1 рубль» от «1 копейка». */
  denominationUnit: DenominationUnit;
  year: number;
  mint: string;
  era: CoinEra;
  subPeriod: string;
  type: CoinType;
  material: CoinMaterial;
  series: string;
  /**
   * Разновидность (например, «магнитная», «немагнитная», «биметалл»,
   * «широкий кант»). Пустая строка — у монеты нет разновидности.
   * Каждая разновидность = отдельная карточка со своим slug.
   */
  variant: string;
  mintage: number;
  diameterMm: number;
  thicknessMm: number;
  weightG: number;
  edge: string;
  prices: CoinPrices;
  images: CoinImages;
  description: string;
  /** Подпись сюжета аверса с сайта ЦБ; пусто — показывается шаблон «герб РФ…». */
  obverseDescription: string;
  /** Подпись реверса с сайта ЦБ; пусто — показывается общий шаблон. */
  reverseDescription: string;
}

