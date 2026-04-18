import { CatalogPage, type CatalogScope } from '../components/CatalogPage';
import { getCatalogTreeData } from '../lib/catalog-data';
import './catalog.css';
import './filter-bar.css';

const HOME_SCOPE: CatalogScope = {
  basePath: '/',
  activePeriodSlug: null,
  title: 'Коллекционные юбилейные и регулярные монеты',
  breadcrumb: [{ label: 'Главная', href: '/' }, { label: 'Все монеты' }]
};

export default async function Page() {
  const { coins, tree, total } = await getCatalogTreeData();
  return (
    <div className="catalog-scope">
      <CatalogPage
        coins={coins}
        scope={HOME_SCOPE}
        categoryTree={tree}
        categoryTotal={total}
      />
    </div>
  );
}
