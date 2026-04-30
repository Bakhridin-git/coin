'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  activeFilterCount,
  buildSearchString,
  COIN_MATERIAL_OPTIONS,
  COIN_TYPE_OPTIONS,
  denomKeyToString,
  MINT_OPTIONS,
  parseFilters,
  parsePageParam,
  SORT_IDS,
  SORT_LABELS,
  type CatalogFilters,
  type DenominationKey,
  type FilterCounts,
  type SortId
} from '../lib/catalog';
import type { CategoryNode } from '../lib/categoryTree';
import type { Coin, CoinMaterial, CoinType } from '../lib/types';
import { CATALOG_PAGE_LCP_IMAGE_COUNT, CATALOG_PAGE_SIZE, PARAM } from '../lib/constants';
import { formatDenomination } from '../lib/format';
import { CatalogPagination } from './CatalogPagination';
import { CoinCard } from './CoinCard';
import { FilterBar } from './FilterBar';
import { CategoryTree } from './CategoryTree';

export interface CatalogScope {
  basePath: string;
  activePeriodSlug: string | null;
  title: string;
  subtitle?: string;
  breadcrumb: ReadonlyArray<{ label: string; href?: string }>;
}

export interface CatalogPageClientProps {
  /** Coins for the current page only (already filtered/sorted/paginated on the server). */
  pagedCoins: Coin[];
  /** How many coins match current filters (in this scope). */
  totalVisible: number;
  /** Total coins in this scope (period/root), without filters. */
  totalAll: number;
  /** Total pages for the current filtered result. */
  totalPages: number;
  /** Server-clamped page number (e.g. page=99 → last page). */
  effectivePage: number;
  /** Faceted counts computed on the server for current filters. */
  counts: FilterCounts;
  /** Filter dropdown options computed on the server for this scope. */
  denominations: DenominationKey[];
  years: number[];
  scope: CatalogScope;
  categoryTree: CategoryNode[];
  categoryTotal: number;
}

export function CatalogPageClient(props: CatalogPageClientProps) {
  return (
    <Suspense fallback={null}>
      <CatalogPageClientInner {...props} />
    </Suspense>
  );
}

function CatalogPageClientInner({
  pagedCoins,
  totalVisible,
  totalAll,
  totalPages,
  effectivePage,
  counts,
  denominations,
  years,
  scope,
  categoryTree,
  categoryTotal
}: CatalogPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<CatalogFilters>(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const activeCount = activeFilterCount(filters);

  const pageFromUrl = useMemo(
    () => parsePageParam(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  useEffect(() => {
    if (pageFromUrl !== effectivePage) {
      router.replace(`${scope.basePath}${buildSearchString(filters, effectivePage)}`, {
        scroll: false
      });
    }
  }, [pageFromUrl, effectivePage, filters, scope.basePath, router]);

  const getPageHref = useCallback(
    (page: number) => `${scope.basePath}${buildSearchString({ ...filters, q: '' }, page)}`,
    [filters, scope.basePath]
  );

  /** Query без `page` — смена только страницы не даёт вспышку. */
  const filtersOnlyKey = useMemo(() => {
    const usp = new URLSearchParams(searchParams.toString());
    usp.delete(PARAM.page);
    return usp.toString();
  }, [searchParams]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const skipResultsFlashOnMount = useRef(true);
  const pendingFlashRef = useRef(false);
  const resultsFlashTargetRef = useRef<HTMLDivElement | null>(null);

  const triggerFlash = useCallback(() => {
    const el = resultsFlashTargetRef.current;
    if (!el) return;
    el.classList.remove('catalog-results-flash');
    void el.offsetWidth;
    el.classList.add('catalog-results-flash');
  }, []);

  useEffect(() => {
    if (skipResultsFlashOnMount.current) {
      skipResultsFlashOnMount.current = false;
      return;
    }
    if (filtersOpen) {
      pendingFlashRef.current = true;
    } else {
      triggerFlash();
    }
  }, [filtersOnlyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!filtersOpen && pendingFlashRef.current) {
      pendingFlashRef.current = false;
      triggerFlash();
    }
  }, [filtersOpen, triggerFlash]);

  const updateFilters = useCallback(
    (patch: Partial<CatalogFilters>) => {
      const next: CatalogFilters = { ...filters, ...patch };
      router.replace(`${scope.basePath}${buildSearchString(next, 1)}`, { scroll: false });
    },
    [filters, router, scope.basePath]
  );

  const resetFilters = useCallback(() => {
    router.replace(scope.basePath, { scroll: false });
  }, [router, scope.basePath]);

  const toggleInArray = useCallback(
    <T extends string>(list: T[], value: T): T[] =>
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    []
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (filtersOpen || sortOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      // На навигации компонент размонтируется. Без cleanup скролл может остаться заблокированным.
      document.body.style.overflow = prev;
    };
  }, [filtersOpen, sortOpen]);

  const openFilters = useCallback(() => {
    setSortOpen(false);
    setFiltersOpen(true);
  }, []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const openSort = useCallback(() => {
    setFiltersOpen(false);
    setSortOpen(true);
  }, []);
  const closeSort = useCallback(() => setSortOpen(false), []);

  const selectSort = useCallback(
    (sort: SortId) => {
      updateFilters({ sort });
      closeSort();
    },
    [updateFilters, closeSort]
  );

  const toggleType = (id: CoinType) => updateFilters({ types: toggleInArray(filters.types, id) });
  const toggleMaterial = (id: CoinMaterial) =>
    updateFilters({ materials: toggleInArray(filters.materials, id) });
  const toggleMint = (id: string) => updateFilters({ mints: toggleInArray(filters.mints, id) });

  const toggleDenomination = (d: DenominationKey) => {
    const key = denomKeyToString(d);
    const next = filters.denominations.some((x) => denomKeyToString(x) === key)
      ? filters.denominations.filter((x) => denomKeyToString(x) !== key)
      : [...filters.denominations, d];
    updateFilters({ denominations: next });
  };

  return (
    <>
      <div className={sortOpen ? 'sort-overlay open' : 'sort-overlay'} onClick={closeSort} />
      <section
        className={sortOpen ? 'sort-sheet open' : 'sort-sheet'}
        role="dialog"
        aria-modal="true"
        aria-label="Сортировка"
      >
        <div className="sort-header">
          <div className="sort-title">
            <span aria-hidden="true">⇅</span>Сортировка
          </div>
          <button className="sort-close" onClick={closeSort} aria-label="Закрыть сортировку">
            ×
          </button>
        </div>
        <ul className="sort-list">
          {SORT_IDS.map((id) => (
            <li key={id}>
              <button
                className={id === filters.sort ? 'sort-item is-active' : 'sort-item'}
                type="button"
                onClick={() => selectSort(id)}
              >
                {SORT_LABELS[id]}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className={filtersOpen ? 'filter-overlay open' : 'filter-overlay'} onClick={closeFilters} />

      <div className="catalog-head">
        <nav className="breadcrumb">
          {scope.breadcrumb.map((crumb, index) => {
            const isLast = index === scope.breadcrumb.length - 1;
            return (
              <span key={`${crumb.label}-${index}`}>
                {crumb.href && !isLast ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {!isLast && ' › '}
              </span>
            );
          })}
        </nav>

        <div className="content-header">
          <div>
            <span className="content-title">
              {scope.title}{' '}
              <span className="content-count">
                {totalVisible} из {totalAll}
              </span>
            </span>
            {scope.subtitle && <div className="content-subtitle">{scope.subtitle}</div>}
          </div>
        </div>
      </div>

      <div className="main">
        <aside className="cat-sidebar" aria-label="Разделы каталога">
          <CategoryTree tree={categoryTree} total={categoryTotal} activePeriodSlug={scope.activePeriodSlug} />
        </aside>

        <div className="catalog-filter-row">
          <FilterBar
            filters={filters}
            counts={counts}
            denominations={denominations}
            years={years}
            onToggleType={toggleType}
            onToggleMaterial={toggleMaterial}
            onToggleMint={toggleMint}
            onToggleDenomination={toggleDenomination}
            onSetYearRange={(from, to) => updateFilters({ yearFrom: from, yearTo: to })}
            onSetSort={(sort) => updateFilters({ sort })}
            onReset={resetFilters}
          />
        </div>

        <aside className={filtersOpen ? 'sidebar open' : 'sidebar'}>
          <div className="sidebar-header">
            <span className="sidebar-title">Фильтры</span>
            <button className="sidebar-close" onClick={closeFilters} aria-label="Закрыть фильтры">
              ×
            </button>
          </div>
          <div className="sidebar-scroll">
            <div className="filter-group">
              <div className="filter-title">Тип</div>
              {COIN_TYPE_OPTIONS.map((opt) => (
                <div key={opt.id} className="filter-option">
                  <input
                    id={`type-${opt.id}`}
                    type="checkbox"
                    checked={filters.types.includes(opt.id)}
                    onChange={() => toggleType(opt.id)}
                  />
                  <label htmlFor={`type-${opt.id}`}>
                    <span>{opt.label}</span>
                    <span className="filter-count">{counts.type[opt.id] ?? 0}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="filter-group">
              <div className="filter-title">Материал</div>
              {COIN_MATERIAL_OPTIONS.map((opt) => (
                <div key={opt.id} className="filter-option">
                  <input
                    id={`material-${opt.id}`}
                    type="checkbox"
                    checked={filters.materials.includes(opt.id)}
                    onChange={() => toggleMaterial(opt.id)}
                  />
                  <label htmlFor={`material-${opt.id}`}>
                    <span>{opt.label}</span>
                    <span className="filter-count">{counts.material[opt.id] ?? 0}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="filter-group">
              <div className="filter-title">Номинал</div>
              {denominations.map((d) => {
                const key = denomKeyToString(d);
                return (
                  <div key={key} className="filter-option">
                    <input
                      id={`denom-${key}`}
                      type="checkbox"
                      checked={filters.denominations.some((x) => denomKeyToString(x) === key)}
                      onChange={() => toggleDenomination(d)}
                    />
                    <label htmlFor={`denom-${key}`}>
                      <span>{formatDenomination(d.value, d.unit)}</span>
                      <span className="filter-count">{counts.denomination[key] ?? 0}</span>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="filter-group">
              <div className="filter-title">Год выпуска</div>
              <div className="filter-year-range">
                <label className="filter-year-field">
                  <span>от</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={years[0] != null ? String(years[0]) : ''}
                    value={filters.yearFrom ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateFilters({ yearFrom: raw === '' ? null : Number(raw) });
                    }}
                  />
                  <span>г.</span>
                </label>
                <label className="filter-year-field">
                  <span>до</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={
                      years[years.length - 1] != null ? String(years[years.length - 1]) : ''
                    }
                    value={filters.yearTo ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateFilters({ yearTo: raw === '' ? null : Number(raw) });
                    }}
                  />
                  <span>г.</span>
                </label>
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-title">Монетный двор</div>
              {MINT_OPTIONS.map((opt) => (
                <div key={opt.id} className="filter-option">
                  <input
                    id={`mint-${opt.id}`}
                    type="checkbox"
                    checked={filters.mints.includes(opt.id)}
                    onChange={() => toggleMint(opt.id)}
                  />
                  <label htmlFor={`mint-${opt.id}`}>
                    <span>{opt.label}</span>
                    <span className="filter-count">{counts.mint[opt.id] ?? 0}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="sidebar-footer">
            <button className="sidebar-action" type="button" onClick={resetFilters}>
              Очистить
            </button>
            <button
              className="sidebar-action sidebar-action--primary"
              type="button"
              onClick={closeFilters}
            >
              Применить
            </button>
          </div>
        </aside>

        <main className="content">
          <div className="mobile-actions">
            <button className="mobile-button mobile-button--sort" type="button" onClick={openSort}>
              <span aria-hidden="true">⇅</span>
              <span>{SORT_LABELS[filters.sort]}</span>
            </button>
            <button
              className="mobile-button mobile-button--filters"
              type="button"
              onClick={openFilters}
            >
              <span className="mobile-button__inner">
                <span>Фильтры</span>
                {activeCount > 0 && (
                  <span className="mobile-pill" aria-label="Выбрано фильтров">
                    {activeCount}
                  </span>
                )}
              </span>
            </button>
          </div>

          <div ref={resultsFlashTargetRef} className="catalog-results-flash-wrap">
            {totalVisible === 0 ? (
              <EmptyState
                query={filters.q}
                hasOtherFilters={activeCount > 0}
                onReset={resetFilters}
                onSearchGlobal={() => {
                  const q = filters.q.trim();
                  const tail = q ? `?${PARAM.q}=${encodeURIComponent(q)}` : '';
                  router.replace(`/${tail}`, { scroll: false });
                }}
              />
            ) : (
              <>
                <div className="coin-grid">
                  {pagedCoins.map((coin, index) => (
                    <CoinCard
                      key={coin.slug}
                      coin={coin}
                      imagePriority={effectivePage === 1 && index < CATALOG_PAGE_LCP_IMAGE_COUNT}
                    />
                  ))}
                </div>
                <CatalogPagination
                  currentPage={effectivePage}
                  totalPages={Math.max(1, totalPages)}
                  getPageHref={(p) => getPageHref(p)}
                />
              </>
            )}
          </div>

          {totalVisible > 0 && totalVisible <= CATALOG_PAGE_SIZE && (
            <div style={{ marginTop: 10, color: '#888', fontSize: 12 }}>
              Показано {totalVisible} монет
            </div>
          )}
        </main>
      </div>
    </>
  );
}

interface EmptyStateProps {
  query: string;
  hasOtherFilters: boolean;
  onReset: () => void;
  onSearchGlobal: () => void;
}

function EmptyState({ query, hasOtherFilters, onReset, onSearchGlobal }: EmptyStateProps) {
  const trimmed = query.trim();
  const hint =
    trimmed && hasOtherFilters
      ? `По запросу «${trimmed}» в этом разделе ничего нет — возможно, монета в другом типе/периоде.`
      : trimmed
        ? `По запросу «${trimmed}» монет не найдено. Попробуйте изменить запрос или сбросить фильтры.`
        : 'Нет монет, подходящих под выбранные фильтры.';

  const primaryLabel = trimmed && hasOtherFilters ? 'Искать по всему каталогу' : 'Сбросить фильтры';
  const onPrimary = trimmed && hasOtherFilters ? onSearchGlobal : onReset;

  return (
    <div
      style={{
        padding: '40px 24px',
        background: '#fff',
        border: '1px solid #e8e6e0',
        borderRadius: 16,
        textAlign: 'center'
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
        Ничего не нашлось
      </div>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>{hint}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onPrimary}
          style={{
            background: '#c9a84c',
            color: '#1a1a2e',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 8,
            fontFamily: 'inherit',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {primaryLabel}
        </button>
        {trimmed && hasOtherFilters && (
          <button
            type="button"
            onClick={onReset}
            style={{
              background: '#fff',
              color: '#1a1a2e',
              border: '1px solid #e8e6e0',
              padding: '10px 16px',
              borderRadius: 8,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Сбросить всё
          </button>
        )}
      </div>
    </div>
  );
}

