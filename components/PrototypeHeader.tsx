'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PARAM, SEARCH_API_PATH } from '../lib/constants';
import { buildNavItems } from '../lib/nav';
import type { CategoryNode } from '../lib/categoryTree';
import { CategoryTree } from './CategoryTree';

interface PrototypeHeaderProps {
  /** Tree rendered inside the mobile drawer. Desktop drawer falls back to the
   *  flat nav list — the tree is meant for the small viewport only. */
  categoryTree?: CategoryNode[];
  categoryTotal?: number;
}

/**
 * Active period slug derived from the URL. `/period/<slug>` → `<slug>`.
 * `/coins/<slug>` → 'inactive' (detail page, no tab should be highlighted).
 * Everything else (including the root catalog `/`) → `null`.
 */
function deriveActivePeriodSlug(pathname: string): string | null | 'inactive' {
  if (pathname === '/') return null;
  if (pathname.startsWith('/coins/')) return 'inactive';
  const match = pathname.match(/^\/period\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * Global site header. Rendered once at the root layout so it is not unmounted
 * on client-side navigation — that way the mobile drawer state (menuOpen)
 * stays intact when the user drills from "Монеты РФ" into a sub-type without
 * any visual flicker or storage hacks.
 */
export function PrototypeHeader(props: PrototypeHeaderProps) {
  return (
    <Suspense fallback={<PrototypeHeaderFallback />}>
      <PrototypeHeaderInner {...props} />
    </Suspense>
  );
}

/** Статичная оболочка, пока не готовы searchParams (SSR / первый кадр). */
function PrototypeHeaderFallback() {
  return (
    <header>
      <div className="header-top">
        <button type="button" className="burger-btn" aria-label="Меню" disabled>
          <span />
          <span />
          <span />
        </button>
        <Link href="/" className="logo">
          <div className="logo-icon">Н</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="logo-title">Нумизмат РФ</span>
            <span className="logo-sub">Цифровой альбом</span>
          </div>
        </Link>
        <div className="search-bar-wrap">
          <form className="search-bar" role="search" aria-hidden="true">
            <span aria-hidden="true">🔍</span>
            <input type="search" placeholder="Загрузка…" disabled readOnly aria-label="Поиск монет" />
          </form>
        </div>
        <div className="header-actions">
          <span className="icon-btn" aria-hidden="true">
            ⌕
          </span>
        </div>
      </div>
    </header>
  );
}

type SearchSuggestion = { slug: string; title: string };

function PrototypeHeaderInner({ categoryTree, categoryTotal }: PrototypeHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Мобильное раскрытие поисковой строки. На десктопе поле видно всегда и
  // это состояние на него не влияет — управляется только CSS.
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get(PARAM.q) ?? '';

  const activePeriodSlug = useMemo(() => deriveActivePeriodSlug(pathname), [pathname]);
  const navItems = useMemo(() => buildNavItems(activePeriodSlug), [activePeriodSlug]);
  const treeActiveSlug = activePeriodSlug === 'inactive' ? null : activePeriodSlug;

  const searchTargetPath = pathname.startsWith('/coins/') ? '/' : pathname;
  const [query, setQuery] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const t = query.trim();
    if (t.length < 2) {
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    const ac = new AbortController();
    const tid = window.setTimeout(async () => {
      try {
        const res = await fetch(`${SEARCH_API_PATH}?q=${encodeURIComponent(t)}`, {
          signal: ac.signal
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { results: SearchSuggestion[] };
        setSuggestions(data.results);
        setHighlight(-1);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setSuggestions([]);
      }
    }, 260);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestions([]);
        setHighlight(-1);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const close = useCallback(() => setMenuOpen(false), []);
  const toggle = useCallback(() => setMenuOpen((v) => !v), []);

  const submitSearch = useCallback(
    (raw: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = raw.trim();
      if (trimmed) next.set(PARAM.q, trimmed);
      else next.delete(PARAM.q);
      const queryString = next.toString();
      const destination = queryString ? `${searchTargetPath}?${queryString}` : searchTargetPath;
      router.push(destination);
      // После отправки запроса схлопываем поле на мобиле, чтобы пользователь
      // сразу видел результаты, а не клавиатуру поверх выдачи.
      setSearchOpen(false);
      setSuggestions([]);
    },
    [router, searchParams, searchTargetPath]
  );

  const goToCoin = useCallback(
    (slug: string) => {
      router.push(`/coins/${slug}`);
      setSuggestions([]);
      setHighlight(-1);
      setSearchOpen(false);
    },
    [router]
  );

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (highlight >= 0 && suggestions[highlight]) {
        goToCoin(suggestions[highlight].slug);
        return;
      }
      submitSearch(query);
    },
    [submitSearch, query, highlight, suggestions, goToCoin]
  );

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!suggestions.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
      } else if (e.key === 'Escape') {
        setSuggestions([]);
        setHighlight(-1);
      }
    },
    [suggestions.length]
  );

  /**
   * Переключение мобильной поисковой строки. При открытии — фокус на input
   * (rAF нужен, чтобы к моменту focus() элемент уже был отрисован и виден).
   * При закрытии — снимаем фокус, чтобы не всплывала клавиатура.
   */
  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        inputRef.current?.blur();
      }
      return next;
    });
  }, []);

  // Esc и клик вне поисковой строки закрывают поиск.
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !searchWrapRef.current?.contains(target) &&
        !searchToggleBtnRef.current?.contains(target)
      ) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, { capture: true });
    };
  }, [searchOpen]);

  const headerClass = searchOpen ? 'search-open' : undefined;

  return (
    <header className={headerClass}>
      <div className="header-top">
        <button className="burger-btn" onClick={toggle} aria-label="Меню">
          <span />
          <span />
          <span />
        </button>

        <Link href="/" className="logo" onClick={close}>
          <div className="logo-icon">Н</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="logo-title">Нумизмат РФ</span>
            <span className="logo-sub">Цифровой альбом</span>
          </div>
        </Link>

        <div className="search-bar-wrap" ref={searchWrapRef}>
          <form className="search-bar" onSubmit={onSubmit} role="search">
            <span aria-hidden="true">🔍</span>
            <input
              ref={inputRef}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              autoComplete="off"
              placeholder="Введите номинал, год или название монеты..."
              aria-label="Поиск монет"
            />
          </form>
          {suggestions.length > 0 && (
            <ul
              id="header-search-suggest"
              className="search-suggest"
              role="listbox"
              aria-label="Совпадения"
            >
              {suggestions.map((s, i) => (
                <li key={s.slug} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={['search-suggest-item', i === highlight ? 'is-active' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goToCoin(s.slug);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="header-actions">
          <button
            ref={searchToggleBtnRef}
            type="button"
            className="icon-btn"
            aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск'}
            aria-expanded={searchOpen}
            onClick={toggleSearch}
          >
            {searchOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.8"/>
                <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className={menuOpen ? 'nav-overlay open' : 'nav-overlay'} onClick={close} />
      <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
        <div className="drawer-header">
          <span className="drawer-title">Монеты</span>
          <button className="drawer-close" onClick={close} aria-label="Закрыть меню">
            ×
          </button>
        </div>
        {/* Mobile drawer is JUST the category tree — no flat nav list above.
         * Periods in the top tabs duplicated these same links (with counts),
         * so showing both made the drawer feel noisy. See MONETNIK reference. */}
        {categoryTree && categoryTree.length > 0 && categoryTotal != null ? (
          <div className="cat-drawer-tree">
            <CategoryTree
              tree={categoryTree}
              total={categoryTotal}
              activePeriodSlug={treeActiveSlug}
              onNavigate={close}
            />
          </div>
        ) : (
          <ul className="nav-list">
            {navItems.map((it) => (
              <li key={it.label}>
                <Link className={it.active ? 'active' : undefined} href={it.href} onClick={close}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </header>
  );
}
