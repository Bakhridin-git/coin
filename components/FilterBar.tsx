'use client';

import { useEffect, useRef, useState } from 'react';
import {
  COIN_MATERIAL_OPTIONS,
  COIN_TYPE_OPTIONS,
  denomKeyToString,
  MINT_OPTIONS,
  SORT_IDS,
  SORT_LABELS,
  type CatalogFilters,
  type DenominationKey,
  type FilterCounts,
  type SortId
} from '../lib/catalog';
import type { CoinMaterial, CoinType } from '../lib/types';
import { formatDenomination } from '../lib/format';

interface FilterBarProps {
  filters: CatalogFilters;
  counts: FilterCounts;
  denominations: DenominationKey[];
  years: number[];
  onToggleType: (id: CoinType) => void;
  onToggleMaterial: (id: CoinMaterial) => void;
  onToggleMint: (id: string) => void;
  onToggleDenomination: (value: DenominationKey) => void;
  onSetYearRange: (from: number | null, to: number | null) => void;
  onSetSort: (value: SortId) => void;
  onReset: () => void;
}

/**
 * Desktop filter bar — a row of dropdown buttons. Each button opens a popover
 * with checkboxes / options. The actual filter state lives in the URL (via
 * CatalogPage), this component only renders the chrome and forwards events.
 */
export function FilterBar({
  filters,
  counts,
  denominations,
  years,
  onToggleType,
  onToggleMaterial,
  onToggleMint,
  onToggleDenomination,
  onSetYearRange,
  onSetSort,
  onReset
}: FilterBarProps) {
  const hasAny =
    filters.types.length > 0 ||
    filters.materials.length > 0 ||
    filters.mints.length > 0 ||
    filters.denominations.length > 0 ||
    filters.yearFrom != null ||
    filters.yearTo != null;

  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const hasYears = minYear != null && maxYear != null;

  return (
    <div className="filter-bar" role="toolbar" aria-label="Фильтры каталога">
      <FilterDropdown
        label={SORT_LABELS[filters.sort]}
        buttonClassName="filter-dd-btn--sort"
        buttonIcon={
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3 2v8M3 2l-2 2M3 2l2 2M9 10V2M9 10l-2-2M9 10l2-2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
      >
        {(close) => (
          <>
            {SORT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`filter-dd-item filter-dd-item--plain ${id === filters.sort ? 'is-active' : ''}`}
                onClick={() => {
                  onSetSort(id);
                  close();
                }}
              >
                <span className="filter-dd-label">{SORT_LABELS[id]}</span>
              </button>
            ))}
          </>
        )}
      </FilterDropdown>

      <FilterDropdown label="Тип" activeCount={filters.types.length}>
        {COIN_TYPE_OPTIONS.map((opt) => (
          <label key={opt.id} className="filter-dd-item">
            <input
              type="checkbox"
              checked={filters.types.includes(opt.id)}
              onChange={() => onToggleType(opt.id)}
            />
            <span className="filter-dd-label">{opt.label}</span>
            <span className="filter-dd-count">{counts.type[opt.id] ?? 0}</span>
          </label>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Материал" activeCount={filters.materials.length}>
        {COIN_MATERIAL_OPTIONS.map((opt) => (
          <label key={opt.id} className="filter-dd-item">
            <input
              type="checkbox"
              checked={filters.materials.includes(opt.id)}
              onChange={() => onToggleMaterial(opt.id)}
            />
            <span className="filter-dd-label">{opt.label}</span>
            <span className="filter-dd-count">{counts.material[opt.id] ?? 0}</span>
          </label>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Номинал" activeCount={filters.denominations.length}>
        {denominations.map((d) => {
          const key = denomKeyToString(d);
          const checked = filters.denominations.some((x) => denomKeyToString(x) === key);
          return (
            <label key={key} className="filter-dd-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleDenomination(d)}
              />
              <span className="filter-dd-label">{formatDenomination(d.value, d.unit)}</span>
              <span className="filter-dd-count">{counts.denomination[key] ?? 0}</span>
            </label>
          );
        })}
      </FilterDropdown>

      {hasYears && (
        <FilterDropdown
          label="Год"
          activeCount={filters.yearFrom != null || filters.yearTo != null ? 1 : 0}
          panelClassName="filter-dd-panel--wide"
        >
          {(close) => (
            <YearRangeFilter
              min={minYear}
              max={maxYear}
              valueFrom={filters.yearFrom}
              valueTo={filters.yearTo}
              onApply={(from, to) => {
                onSetYearRange(from, to);
                close();
              }}
            />
          )}
        </FilterDropdown>
      )}

      <FilterDropdown label="Монетный двор" activeCount={filters.mints.length}>
        {MINT_OPTIONS.map((opt) => (
          <label key={opt.id} className="filter-dd-item">
            <input
              type="checkbox"
              checked={filters.mints.includes(opt.id)}
              onChange={() => onToggleMint(opt.id)}
            />
            <span className="filter-dd-label">{opt.label}</span>
            <span className="filter-dd-count">{counts.mint[opt.id] ?? 0}</span>
          </label>
        ))}
      </FilterDropdown>

      {hasAny && (
        <button type="button" className="filter-bar-reset" onClick={onReset}>
          Сбросить
        </button>
      )}
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  activeCount?: number;
  panelClassName?: string;
  buttonClassName?: string;
  /** Optional leading icon inside the button (rendered before the label). */
  buttonIcon?: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

function FilterDropdown({
  label,
  activeCount = 0,
  panelClassName,
  buttonClassName,
  buttonIcon,
  children
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const btnClass = [
    'filter-dd-btn',
    open ? 'is-open' : '',
    activeCount > 0 ? 'is-active' : '',
    buttonClassName ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="filter-dd" ref={ref}>
      <button
        type="button"
        className={btnClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonIcon && <span className="filter-dd-icon">{buttonIcon}</span>}
        <span>{label}</span>
        {activeCount > 0 && <span className="filter-dd-badge">{activeCount}</span>}
        <svg
          className="filter-dd-chev"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className={['filter-dd-panel', panelClassName].filter(Boolean).join(' ')}
          role="dialog"
          aria-label={label}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

interface YearRangeFilterProps {
  min: number;
  max: number;
  valueFrom: number | null;
  valueTo: number | null;
  onApply: (from: number | null, to: number | null) => void;
}

/**
 * Dual-handle range + "от / до" number inputs. Local draft state commits on
 * "Применить" so typing/dragging doesn't thrash the URL. "Очистить" resets both
 * bounds to null (i.e. removes the year filter entirely).
 */
function YearRangeFilter({ min, max, valueFrom, valueTo, onApply }: YearRangeFilterProps) {
  const hasRange = min < max;
  /**
   * Храним значения полей как строки: так поле может легитимно быть пустым,
   * и пользователь не упирается в «непереставляемый» ноль при Backspace.
   * Число считаем уже в момент применения/слайдера.
   */
  const [from, setFrom] = useState<string>(valueFrom != null ? String(valueFrom) : '');
  const [to, setTo] = useState<string>(valueTo != null ? String(valueTo) : '');

  useEffect(() => {
    setFrom(valueFrom != null ? String(valueFrom) : '');
    setTo(valueTo != null ? String(valueTo) : '');
  }, [valueFrom, valueTo]);

  /** Для слайдера нужно число. Пустое поле трактуем как min/max. */
  const fromNum = from === '' ? min : Number(from);
  const toNum = to === '' ? max : Number(to);

  const clampFrom = (v: number) => Math.max(min, Math.min(v, toNum));
  const clampTo = (v: number) => Math.min(max, Math.max(v, fromNum));

  const range = Math.max(1, max - min);
  const fromPct = hasRange ? ((fromNum - min) / range) * 100 : 0;
  const toPct = hasRange ? ((toNum - min) / range) * 100 : 100;

  /** Разрешаем в инпуте только цифры — не даём появиться «-», «e», и т.п. */
  const onYearInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
    setter(cleaned);
  };

  return (
    <div className="year-range">
      {hasRange && (
        <div className="year-range-slider">
          <div className="year-range-track" />
          <div
            className="year-range-active"
            style={{ left: `${fromPct}%`, width: `${Math.max(0, toPct - fromPct)}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={fromNum}
            onChange={(e) => setFrom(String(clampFrom(Number(e.target.value))))}
            aria-label="Год от"
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={toNum}
            onChange={(e) => setTo(String(clampTo(Number(e.target.value))))}
            aria-label="Год до"
          />
        </div>
      )}

      <div className="year-range-inputs">
        <label className="year-range-field">
          <span className="year-range-prefix">от</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder={String(min)}
            value={from}
            onChange={onYearInput(setFrom)}
            onBlur={() => {
              if (from === '') return;
              setFrom(String(clampFrom(Number(from))));
            }}
          />
          <span className="year-range-suffix">г.</span>
        </label>
        <label className="year-range-field">
          <span className="year-range-prefix">до</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder={String(max)}
            value={to}
            onChange={onYearInput(setTo)}
            onBlur={() => {
              if (to === '') return;
              setTo(String(clampTo(Number(to))));
            }}
          />
          <span className="year-range-suffix">г.</span>
        </label>
      </div>

      <div className="year-range-actions">
        <button
          type="button"
          className="year-range-btn"
          onClick={() => {
            setFrom('');
            setTo('');
            onApply(null, null);
          }}
        >
          Очистить
        </button>
        <button
          type="button"
          className="year-range-btn year-range-btn--primary"
          onClick={() => {
            const f = from === '' ? min : clampFrom(Number(from));
            const t = to === '' ? max : clampTo(Number(to));
            const isDefault = f === min && t === max;
            onApply(isDefault ? null : f, isDefault ? null : t);
          }}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
