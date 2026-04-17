'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { CategoryNode } from '../lib/categoryTree';
import './CategoryTree.css';

/**
 * Строит «канонический» href активного узла из текущего URL —
 * только pathname + nav-параметры (type, series, sub).
 * Все остальные параметры (sort, q, material…) отбрасываются.
 * Сравнение `node.href === activeHref` гарантирует ровно один активный узел.
 */
function buildActiveHref(pathname: string, search: URLSearchParams): string {
  const parts: string[] = [];
  const type = search.get('type');
  const series = search.get('series');
  const sub = search.get('sub');
  if (type) parts.push(`type=${type}`);
  if (series) parts.push(`series=${series}`);
  if (sub) parts.push(`sub=${sub}`);
  return parts.length ? `${pathname}?${parts.join('&')}` : pathname;
}

/**
 * URL узла считается «на активном пути», если pathname совпадает и все
 * навигационные параметры из href узла присутствуют в текущем URL.
 * Используется только для авто-раскрытия узлов — не для подсветки.
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
 * drawer. У узлов с детьми — невидимая кнопка раскрытия + ссылка; клики не пересекаются.
 */
export function CategoryTree({
  tree,
  total,
  activePeriodSlug,
  onNavigate,
  title,
  className
}: CategoryTreeProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const activeHref = buildActiveHref(pathname, searchParams ?? new URLSearchParams());

  return (
    <div className={['cat-tree', className].filter(Boolean).join(' ')}>
      {title && <div className="cat-tree-heading">{title}</div>}
      <ul className="cat-tree-list">
        <li className="cat-tree-item">
          <div
            className={[
              'cat-tree-row',
              activeHref === '/' ? 'is-active' : ''
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
            activeHref={activeHref}
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
  activeHref: string;
  activePeriodSlug: string | null;
  onNavigate?: () => void;
}

function CategoryNodeView({ node, depth, activeHref, activePeriodSlug, onNavigate }: NodeViewProps) {
  const hasChildren = !!node.children && node.children.length > 0;
  const isActiveRoot = depth === 0 && node.id === activePeriodSlug;

  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();

  const isOnActivePath = useMemo(() => {
    const search = searchParams ?? new URLSearchParams();
    if (isUrlWithinNode(node.href, pathname, search)) return true;
    if (hasChildren) {
      return (node.children ?? []).some((c) => isUrlWithinNode(c.href, pathname, search));
    }
    return false;
  }, [node, hasChildren, pathname, searchParams]);

  const [open, setOpen] = useState(isOnActivePath || isActiveRoot);

  useEffect(() => {
    if (isOnActivePath) setOpen(true);
  }, [isOnActivePath]);

  const isActive = node.href === activeHref;

  return (
    <li className={`cat-tree-item depth-${depth}`}>
      <div
        className={['cat-tree-row', isActive ? 'is-active' : '']
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
          />
        ) : (
          <span className="cat-tree-spacer" aria-hidden="true" />
        )}
        <Link
          className="cat-tree-link"
          href={node.href}
          scroll={false}
          onClick={(e) => {
            if (hasChildren && isActive) {
              e.preventDefault();
              setOpen((v) => !v);
            } else if (!hasChildren) {
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
          {(node.children ?? []).map((child) => (
            <CategoryNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              activeHref={activeHref}
              activePeriodSlug={activePeriodSlug}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
