import { PERIODS } from './periods';

export interface NavItem {
  href: string;
  label: string;
  active?: boolean;
}

/**
 * Build the top navigation. `activePeriodSlug === null` means "Все монеты".
 * When on a detail page use `inactive` so no tab is highlighted.
 */
export function buildNavItems(
  activePeriodSlug: string | null | 'inactive'
): NavItem[] {
  const active = activePeriodSlug === 'inactive' ? Symbol('none') : activePeriodSlug;
  return [
    { href: '/', label: 'Все монеты', active: active === null },
    ...PERIODS.map((p) => ({
      href: `/period/${p.slug}`,
      label: p.label,
      active: active === p.slug
    }))
  ];
}
