export const COIN_IMAGE_BASE_PATH = '/images/coins' as const;

/** Заглушка, когда реального изображения монеты нет в `public/images/coins`. */
export const COIN_IMAGE_PLACEHOLDER_SRC = '/images/coin-placeholder.svg' as const;

/** Имена переменных окружения проекта (без magic strings). */
export const ENV = {
  hideCoinsWithoutImages: 'HIDE_COINS_WITHOUT_IMAGES'
} as const;

/**
 * Ключи query-string каталога. Вынесены сюда, чтобы `categoryTree` и другие
 * модули не тянули `lib/catalog.ts` (тяжёлый граф → риск циклов и ошибок Webpack).
 */
export const PARAM = {
  q: 'q',
  type: 'type',
  material: 'material',
  mint: 'mint',
  series: 'series',
  sub: 'sub',
  denomination: 'denomination',
  yearFrom: 'yearFrom',
  yearTo: 'yearTo',
  sort: 'sort',
  page: 'page'
} as const;

/** Route Handler для подсказок поиска в шапке. */
export const SEARCH_API_PATH = '/api/search' as const;

/** Сколько монет на странице каталога. Кратно 12 → ровно заполняет сетку 2/3/4 колонки. */
export const CATALOG_PAGE_SIZE = 24;

/** Сколько номеров страниц показывать в центре пагинации (скользящее окно). */
export const CATALOG_PAGINATION_MAX_VISIBLE = 3;

/** Сколько карточек на первой странице грузить с `priority` (LCP). */
export const CATALOG_PAGE_LCP_IMAGE_COUNT = 8;
