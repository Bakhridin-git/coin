'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { CategoryNode } from '../lib/categoryTree';
import './CategoryTree.css';

/**
 * URL узла считается «активным», если pathname совпадает и все query-параметры
 * из ссылки узла присутствуют в текущем URL. Лишние параметры в текущем URL
 * (например, выбранная серия поверх type=jubilee) не мешают — узел родитель
 * остаётся активным и раскрытым.
 */
function isUrlWithinNode(
  nodeHref: string,
  pathname: string,
  search: URLSearchParams
): boolean {
  const [hrefPath, hrefQuery = ''] = nodeHref.split('?');
  if (pathname !== hrefPath) return false;
  if (!hrefQuery) return true;
  const required = new URLSearchParams(hrefQuery);
  for (const [k, v] of required) {
    if (search.get(k) !== v) return false;
  }
  return true;
}

/**
 * Строгое сравнение: pathname и набор query-параметров совпадают точно.
 * Используется для обработки «повторного клика» — чтобы свернуть раздел,
 * когда пользователь уже стоит ровно на этой странице без дополнительных
 * фильтров.
 */
function isUrlExactlyNode(
  nodeHref: string,
  pathname: string,
  search: URLSearchParams
): boolean {
  const [hrefPath, hrefQuery = ''] = nodeHref.split('?');
  if (pathname !== hrefPath) return false;
  const required = new URLSearchParams(hrefQuery);
  const requiredKeys = Array.from(required.keys());
  const currentKeys = Array.from(search.keys());
  if (requiredKeys.length !== currentKeys.length) return false;
  for (const k of requiredKeys) {
    if (search.get(k) !== required.get(k)) return false;
  }
  return true;
}

interface CategoryTreeProps {
  tree: CategoryNode[];
  /** Total across all eras, for the "Все монеты" row. */
  total: number;
  /** Slug of currently active period (highlights the row). */
  activePeriodSlug: string | null;
  /** Fired after any link click — useful for closing the mobile drawer. */
  onNavigate?: () => void;
  /** Optional heading above the tree (e.g. "Монеты"). */
  title?: string;
  /** Extra CSS class on the root wrapper — lets the container tweak layout. */
  className?: string;
}

/**
 * Expandable categories tree. Used in the desktop left sidebar and the mobile
 * drawer. Each row has a chevron toggle (if there are children) and a link that
 * navigates to a pre-filtered catalog URL. Toggle and link are siblings so
 * clicks don't collide.
 */
export function CategoryTree({
  tree,
  total,
  activePeriodSlug,
  onNavigate,
  title,
  className
}: CategoryTreeProps) {
  return (
    <div className={['cat-tree', className].filter(Boolean).join(' ')}>
      {title && <div className="cat-tree-heading">{title}</div>}
      <ul className="cat-tree-list">
        <li className="cat-tree-item">
          <div
            className={[
              'cat-tree-row',
              activePeriodSlug === null ? 'is-active' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="cat-tree-spacer" aria-hidden="true" />
            {/* `scroll={false}` — чтобы клик по пункту меню не прыгал к верху
             *  страницы: контент каталога и сайдбар остаются в кадре. */}
            <Link className="cat-tree-link" href="/" scroll={false} onClick={onNavigate}>
              <span className="cat-tree-label">Все монеты</span>
              <span className="cat-tree-count">{total}</span>
            </Link>
          </div>
        </li>
        {tree.map((node) => (
          <CategoryNodeView
            key={node.id}
            node={node}
            depth={0}
            activePeriodSlug={activePeriodSlug}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}

interface NodeViewProps {
  node: CategoryNode;
  depth: number;
  activePeriodSlug: string | null;
  onNavigate?: () => void;
}

function CategoryNodeView({ node, depth, activePeriodSlug, onNavigate }: NodeViewProps) {
  const hasChildren = !!node.children && node.children.length > 0;
  const isActiveRoot = depth === 0 && node.id === activePeriodSlug;

  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  // «Узел на активном пути» — текущий URL попадает в него или его потомка.
  // Используется и для раскрытия по умолчанию, и для синхронизации при смене
  // маршрута (компонент живёт в root layout, state переживает навигацию).
  const isOnActivePath = useMemo(() => {
    const search = searchParams ?? new URLSearchParams();
    if (isUrlWithinNode(node.href, pathname, search)) return true;
    if (hasChildren) {
      return node.children!.some((c) => isUrlWithinNode(c.href, pathname, search));
    }
    return false;
  }, [node, hasChildren, pathname, searchParams]);

  const [open, setOpen] = useState(isOnActivePath || isActiveRoot);

  // Если пользователь ушёл в подраздел этого узла (например, кликнул на
  // «Юбилейные и памятные»), автоматически раскрываем — не ждём клика по
  // шеврону. Вручную закрытый узел остаётся закрытым только пока URL с ним
  // не совпадает; как только маршрут снова попадает внутрь — открываем.
  useEffect(() => {
    if (isOnActivePath) setOpen(true);
  }, [isOnActivePath]);

  // Точное совпадение URL — подсвечиваем строку как активную.
  const isExactlyActive = useMemo(() => {
    const search = searchParams ?? new URLSearchParams();
    return isUrlWithinNode(node.href, pathname, search);
  }, [node.href, pathname, searchParams]);

  // Нужен отдельный строгий флаг для «повторного клика сворачивает». Если
  // в URL висят лишние параметры дочернего узла (например, series=...),
  // родитель не должен считаться «точно на этой странице».
  const isUrlExact = useMemo(() => {
    const search = searchParams ?? new URLSearchParams();
    return isUrlExactlyNode(node.href, pathname, search);
  }, [node.href, pathname, searchParams]);

  return (
    <li className={`cat-tree-item depth-${depth}`}>
      <div
        className={['cat-tree-row', isExactlyActive || isActiveRoot ? 'is-active' : '']
          .filter(Boolean)
          .join(' ')}
      >
        {hasChildren ? (
          <button
            type="button"
            className={['cat-tree-toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Свернуть раздел' : 'Развернуть раздел'}
            aria-expanded={open}
          >
            <svg width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden="true">
              <path
                d="M1 1l5 4-5 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span className="cat-tree-spacer" aria-hidden="true" />
        )}
        <Link
          className="cat-tree-link"
          href={node.href}
          // scroll={false} — переходы между разделами каталога не должны
          // прыгать к началу страницы. Каталог/сайдбар остаются в кадре,
          // контент обновляется под курсором пользователя.
          scroll={false}
          onClick={(e) => {
            if (hasChildren) {
              // Клик по уже активной строке (тот же URL) — тогглим open
              // локально, без навигации: нет ни прыжка скролла, ни лишнего
              // server-render. В остальных случаях пусть Link переходит
              // сам; раскрытие сработает в useEffect, когда isOnActivePath
              // станет true. Это убирает двойной ре-рендер и «дёрганье».
              if (isUrlExact) {
                e.preventDefault();
                setOpen((v) => !v);
              }
            } else {
              onNavigate?.();
            }
          }}
        >
          <span className="cat-tree-label">{node.label}</span>
          <span className="cat-tree-count">{node.count}</span>
        </Link>
      </div>

      {open && hasChildren && (
        <ul className="cat-tree-sub">
          {node.children!.map((child) => (
            <CategoryNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              activePeriodSlug={activePeriodSlug}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
