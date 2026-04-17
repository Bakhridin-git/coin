'use client';

import Link from 'next/link';
import { CATALOG_PAGINATION_MAX_VISIBLE } from '../lib/constants';

export interface CatalogPaginationProps {
  currentPage: number;
  totalPages: number;
  getPageHref: (page: number) => string;
}

/** Скользящее окно из `CATALOG_PAGINATION_MAX_VISIBLE` номеров вокруг текущей; на последней странице в окне видны последние номера. */
function visiblePageNumbers(current: number, total: number): number[] {
  const maxVisible = CATALOG_PAGINATION_MAX_VISIBLE;
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  let end = Math.min(total, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function CatalogPagination({
  currentPage,
  totalPages,
  getPageHref
}: CatalogPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = visiblePageNumbers(currentPage, totalPages);
  const firstInWindow = pages[0];
  const lastInWindow = pages[pages.length - 1];
  if (firstInWindow === undefined || lastInWindow === undefined) return null;

  const showFirst = firstInWindow > 1;
  const showLast = lastInWindow < totalPages;

  return (
    <nav className="catalog-pagination" aria-label="Страницы каталога">
      <span className="catalog-pagination__sr">
        Страница {currentPage} из {totalPages}
      </span>
      <div className="catalog-pagination__row">
        {currentPage > 1 ? (
          <Link
            className="catalog-pagination__link catalog-pagination__link--step"
            href={getPageHref(currentPage - 1)}
            scroll={false}
          >
            <span className="catalog-pagination__link-full">Назад</span>
            <span className="catalog-pagination__link-compact" aria-hidden="true">
              ←
            </span>
          </Link>
        ) : (
          <span
            className="catalog-pagination__link catalog-pagination__link--step catalog-pagination__link--disabled"
            aria-disabled="true"
          >
            <span className="catalog-pagination__link-full">Назад</span>
            <span className="catalog-pagination__link-compact" aria-hidden="true">
              ←
            </span>
          </span>
        )}

        <div className="catalog-pagination__pages-scroll">
          <div className="catalog-pagination__pages">
            {showFirst && (
              <>
                <Link
                  className="catalog-pagination__num"
                  href={getPageHref(1)}
                  scroll={false}
                >
                  1
                </Link>
                {firstInWindow > 2 && (
                  <span className="catalog-pagination__ellipsis" aria-hidden="true">
                    …
                  </span>
                )}
              </>
            )}
            {pages.map((p) => (
              <Link
                key={p}
                href={getPageHref(p)}
                scroll={false}
                className={
                  p === currentPage
                    ? 'catalog-pagination__num catalog-pagination__num--current'
                    : 'catalog-pagination__num'
                }
                aria-current={p === currentPage ? 'page' : undefined}
              >
                {p}
              </Link>
            ))}
            {showLast && (
              <>
                {lastInWindow < totalPages - 1 && (
                  <span className="catalog-pagination__ellipsis" aria-hidden="true">
                    …
                  </span>
                )}
                <Link
                  className="catalog-pagination__num"
                  href={getPageHref(totalPages)}
                  scroll={false}
                >
                  {totalPages}
                </Link>
              </>
            )}
          </div>
        </div>

        {currentPage < totalPages ? (
          <Link
            className="catalog-pagination__link catalog-pagination__link--step"
            href={getPageHref(currentPage + 1)}
            scroll={false}
          >
            <span className="catalog-pagination__link-full">Вперёд</span>
            <span className="catalog-pagination__link-compact" aria-hidden="true">
              →
            </span>
          </Link>
        ) : (
          <span
            className="catalog-pagination__link catalog-pagination__link--step catalog-pagination__link--disabled"
            aria-disabled="true"
          >
            <span className="catalog-pagination__link-full">Вперёд</span>
            <span className="catalog-pagination__link-compact" aria-hidden="true">
              →
            </span>
          </span>
        )}
      </div>
    </nav>
  );
}
