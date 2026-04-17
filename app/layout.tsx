import type { Metadata } from 'next';
import { getCatalogTreeData } from '../lib/catalog-data';
import { PrototypeHeader } from '../components/PrototypeHeader';
import './globals.css';
import './site-header.css';

export const metadata: Metadata = {
  title: 'Нумизмат РФ',
  description: 'Нумизмат РФ — цифровой альбом монет.'
};

/**
 * The header lives here (not inside individual pages) so it is NOT unmounted
 * when the user navigates between routes. Keeps the mobile drawer's open
 * state stable across drill-downs like "/" → "/period/rf" → "/period/rf?type=…".
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { tree, total } = await getCatalogTreeData();

  return (
    <html lang="ru">
      <body>
        <PrototypeHeader categoryTree={tree} categoryTotal={total} />
        {children}
      </body>
    </html>
  );
}
