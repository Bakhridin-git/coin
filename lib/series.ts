import type { Coin } from './types';

/**
 * Каноническая таксономия серий юбилейных монет — кураторская,
 * не словарь из ЦБ. ЦБ в разные годы называет одну и ту же серию
 * по-разному (напр. "50-летие Победы" / "50 лет Великой Победы");
 * здесь всё сведено в единые ID.
 *
 * Добавление серии — два шага:
 *   1) записать Series в SERIES_RULES;
 *   2) перечислить все сырые slug'и из CSV в rawSlugs или задать match().
 */

export interface Series {
  /** Canonical slug, используется в URL и навигации. */
  slug: string;
  /** Человекочитаемое название для UI/меню. */
  label: string;
  /** H1 для страниц фильтра по серии. По умолчанию = label. */
  h1?: string;
}

interface SeriesRule {
  series: Series;
  /** Сырые series-слуги, как их пишет ЦБ (значение поля `series` в CSV). */
  rawSlugs: string[];
  /** Доп. признак — например, совпадение по coin.slug для одиночных монет. */
  match?: (coin: Coin) => boolean;
}

const SERIES_RULES: readonly SeriesRule[] = [
  {
    series: {
      slug: 'krasnaya-kniga',
      label: 'Красная книга',
      h1: 'Монеты серии «Красная книга»'
    },
    rawSlugs: ['krasnaya-kniga', 'krasnaya-kniga-sssr']
  },
  {
    series: {
      slug: 'bimetal-10r',
      label: 'Биметаллические (10р)',
      h1: 'Биметаллические 10-рублёвые монеты'
    },
    rawSlugs: ['rossiyskaya-federatsiya', 'drevnie-goroda-rossii'],
    match: (c) => c.denomination === 10 && c.denominationUnit === 'рубль' && c.material === 'bimetal'
  },
  {
    series: {
      slug: 'gvs',
      label: 'ГВС и аналогичные (10р)',
      h1: '10 рублей «Города воинской славы» и «Города трудовой доблести»'
    },
    rawSlugs: ['goroda-voinskoy-slavy', 'goroda-slavy', 'goroda-trudovoy-doblesti', 'chelovek-truda']
  },
  {
    series: {
      slug: 'goroda-geroi',
      label: 'Города-герои',
      h1: 'Монеты серии «Города-герои»'
    },
    rawSlugs: ['goroda-geroi'],
    match: (c) => /gorod-geroy/.test(c.slug)
  },
  {
    series: {
      slug: '1812',
      label: '200 лет Победы 1812',
      h1: '200-летие Победы в Отечественной войне 1812 года'
    },
    rawSlugs: [
      'polkovodtsy-i-geroi-otechestvennoy-voyny-1812-goda',
      'srazheniya-i-znamenatelnye-sobytiya-otechestvennoy-voyny-1812-goda-i-zagranichnykh-pokhodov-russkoy-armii-1813-1814-godov',
      '200-letie-pobedy-rossii-v-otechestvennoy-voyne-1812-goda'
    ]
  },
  {
    series: {
      slug: '50let-pobeda',
      label: '50 лет Победы в ВОВ',
      h1: '50-летие Победы в Великой Отечественной войне 1941–1945 гг.'
    },
    rawSlugs: [
      '50-letie-pobedy-v-velikoy-otechestvennoy-voyne',
      '50-let-velikoy-pobedy',
      'pamyatnye-monety-posvyashchennye-pobede-v-velikoy-otechestvennoy-voyne-1941-1945-gg'
    ]
  },
  {
    series: {
      slug: '70let-pobeda',
      label: '70 лет Победы в ВОВ',
      h1: '70-летие Победы в Великой Отечественной войне 1941–1945 гг.'
    },
    rawSlugs: [
      '70-letie-pobedy-v-velikoy-otechestvennoy-voyne-1941-1945-gg',
      '70-letie-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg',
      '70-letie-razgroma-sovetskimi-voyskami-nemetsko-fashistskikh-voysk-v-stalingradskoy-bitve',
      'podvig-sovetskikh-voinov-srazhavshikhsya-na-krymskom-poluostrove-v-gody-velikoy-otechestvennoy-voyny-1941-1945-gg'
    ]
  },
  {
    series: {
      slug: '75let-pobeda',
      label: '75 лет Победы в ВОВ',
      h1: '75-летие Победы в Великой Отечественной войне 1941–1945 гг.'
    },
    rawSlugs: [
      '75-letie-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg',
      'yubiley-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg',
      '75-letie-polnogo-osvobozhdeniya-leningrada-ot-fashistskoy-blokady'
    ]
  },
  {
    series: {
      slug: 'chelovek-truda',
      label: 'Человек труда',
      h1: 'Монеты серии «Человек труда»'
    },
    rawSlugs: ['chelovek-truda']
  },
  {
    series: {
      slug: 'oruzhie-pobedy',
      label: 'Оружие Великой Победы',
      h1: 'Монеты серии «Оружие Великой Победы (Конструкторы оружия)»'
    },
    rawSlugs: ['oruzhie-velikoy-pobedy-konstruktory-oruzhiya']
  },
  {
    series: {
      slug: 'sochi-2014',
      label: 'Олимпиада в Сочи 2014',
      h1: 'XXII Олимпийские зимние игры в Сочи 2014'
    },
    rawSlugs: ['xxii-olimpiyskie-zimnie-igry-i-xi-paralimpiyskie-zimnie-igry-2014-goda-v-g-sochi']
  },
  {
    series: {
      slug: 'futbol-2018',
      label: 'ЧМ по футболу 2018',
      h1: 'Чемпионат мира по футболу FIFA 2018 в России'
    },
    rawSlugs: ['chempionat-mira-po-futbolu-fifa-2018-v-rossii']
  },
  {
    series: {
      slug: 'crimea',
      label: 'Крымские события',
      h1: 'Монеты, посвящённые Крыму и Севастополю'
    },
    rawSlugs: [],
    match: (c) => /(-krym[^a]|-kryma-|-sevastopol|krymsk)/.test(c.slug) && c.year >= 2014
  },
  {
    series: {
      slug: 'arhitektura',
      label: 'Архитектура',
      h1: 'Памятники архитектуры'
    },
    rawSlugs: ['pamyatniki-arkhitektury', 'pamyatniki-arkhitektury-rossii']
  },
  {
    series: {
      slug: 'goroda-stolitsy',
      label: 'Города-столицы государств',
      h1: 'Города-столицы государств, освобождённые советскими войсками'
    },
    rawSlugs: ['goroda-stolitsy-gosudarstv-osvobozhdennye-sovetskimi-voyskami-ot-nemetsko-fashistskikh-zakhvatchikov']
  },
  {
    series: {
      slug: 'lichnosti',
      label: 'Личности',
      h1: 'Выдающиеся личности России'
    },
    rawSlugs: ['vydayushchiesya-lichnosti-rossii', '200-letie-so-dnya-rozhdeniya-pushkina']
  },
  {
    series: {
      slug: 'multfilmy',
      label: 'Мультипликация',
      h1: 'Российская (советская) мультипликация'
    },
    rawSlugs: ['rossiyskaya-sovetskaya-multiplikatsiya']
  },
  {
    series: {
      slug: 'sobytiya',
      label: 'События',
      h1: 'Памятные события России'
    },
    rawSlugs: [
      '300-letie-rossiyskogo-flota',
      '1150-letie-zarozhdeniya-rossiyskoy-gosudarstvennosti',
      '20-letie-prinyatiya-konstitutsii-rossiyskoy-federatsii',
      'xxvii-vsemirnaya-letnyaya-universiada-2013-goda-v-g-kazani',
      'khkhikh-vsemirnaya-zimnyaya-universiada-2019-goda-v-g-krasnoyarske',
      'rossiyskiy-sport',
      'kosmos',
      'sobytiya'
    ]
  },
  {
    series: {
      slug: 'bez-serii',
      label: 'Вне серии',
      h1: 'Юбилейные монеты вне серии'
    },
    rawSlugs: ['bez-serii']
  }
];

export const ALL_SERIES: readonly Series[] = SERIES_RULES.map((r) => r.series);

/**
 * Возвращает каноническую серию для монеты, либо null если монета
 * не попадает ни под одно правило. Проверка идёт в порядке SERIES_RULES —
 * первое совпавшее правило выигрывает.
 */
export function getCanonicalSeries(coin: Coin): Series | null {
  for (const r of SERIES_RULES) {
    if (r.rawSlugs.includes(coin.series)) return r.series;
    if (r.match && r.match(coin)) return r.series;
  }
  return null;
}

/**
 * Все монеты из `candidates` с той же канонической серией, что и `coin`
 * (сопоставление через SERIES_RULES: например `goroda-slavy` и
 * `goroda-voinskoy-slavy` обе попадают в «ГВС и аналогичные»). Сама `coin`
 * не включается. Если канонической серии нет — фильтр по сырому полю `series`.
 */
export function getCoinsSameCanonicalSeries(coin: Coin, candidates: readonly Coin[]): Coin[] {
  const canonical = getCanonicalSeries(coin);
  if (canonical) {
    return candidates.filter(
      (c) => c.slug !== coin.slug && getCanonicalSeries(c)?.slug === canonical.slug
    );
  }
  if (!coin.series) return [];
  return candidates.filter((c) => c.slug !== coin.slug && c.series === coin.series);
}

export function getSeriesBySlug(slug: string): Series | undefined {
  return ALL_SERIES.find((s) => s.slug === slug);
}
