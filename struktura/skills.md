# Скиллы

Скиллы — детальные пошаговые инструкции. Агенты читают их перед выполнением работы. Каждый скилл = ответ на реальную потребность или ошибку.

---

## Project Setup (инициализация и конфигурация)

| Скилл | Что делает |
|---|---|
| nextjs-project-init | Инициализация Next.js 14+ с TypeScript, Tailwind, Shadcn/UI, Framer Motion |
| shadcn-component-add | Добавление Shadcn/UI компонента: правильная команда, проверка конфликтов |
| tailwind-config-setup | Настройка tailwind.config: тема «Современный музей», шрифты Inter/Geist, кастомные цвета |
| vercel-deploy-setup | Настройка деплоя на Vercel: env variables, build settings, preview URLs |
| github-repo-setup | Инициализация GitHub репозитория, .gitignore для Next.js |

---

## Data Layer (работа с данными)

| Скилл | Что делает |
|---|---|
| sheets-structure-read | Чтение структуры Google Sheets через MCP: колонки, типы, примеры данных |
| service-layer-create | Создание сервиса в `lib/services/`: типизированные функции, TypeScript interface Coin |
| getcoins-service | Реализация `getCoins()`: фильтры, сортировка, пагинация |
| getcoin-by-slug | Реализация `getCoinBySlug(slug)`: single coin, 404 handling |
| sheets-to-supabase-migration | Пошаговая миграция: schema.sql → seed data → замена сервиса → тесты |
| supabase-schema-design | Дизайн схемы PostgreSQL для монет: coins, series, mints, user_collections |
| supabase-rls-setup | Row Level Security для user_collections: только свои данные |
| local-storage-collection | Реализация «В коллекции» через LocalStorage: key schema, get/set/toggle |
| collection-sync-supabase | Миграция коллекции из LocalStorage в Supabase после авторизации |
| coin-type-definition | Определение TypeScript interface Coin из структуры Sheets/Supabase |

---

## UI Components (компоненты)

| Скилл | Что делает |
|---|---|
| coin-card-component | Компонент CoinCard: изображение, название, год, монетный двор, кнопка «В коллекции» |
| coin-flip-3d | 3D-переворот монеты на Framer Motion: аверс/реверс, hover trigger, доступность |
| coin-grid-layout | Адаптивная сетка монет: 2/3/4-5 колонок, skeleton loading, infinite scroll |
| coin-detail-page | Страница монеты: hero image, характеристики, описание, 3D-переворот |
| collection-badge | Значок «В коллекции» на карточке: toggle, оптимистичный UI |
| filter-sidebar | Фильтры: по серии, году, монетному двору, номиналу — Shadcn Checkbox/Select |
| search-component | Поиск по монетам: debounced input, highlight результатов |
| breadcrumb-nav | Breadcrumb навигация: семантическая, JSON-LD совместимая |
| skeleton-loader | Skeleton состояния для CoinCard и CoinGrid во время загрузки |
| empty-state | Empty state компонент: нет монет, нет результатов поиска, пустая коллекция |
| error-boundary | Error boundary для страниц: graceful degradation, retry кнопка |

---

## SEO (поисковая оптимизация)

| Скилл | Что делает |
|---|---|
| seo-page-metadata | `generateMetadata()` для страницы: title, description, OG, canonical URL |
| jsonld-coin-schema | JSON-LD Schema.org для монеты: Product, IndividualProduct, numismatic свойства |
| jsonld-catalog-schema | JSON-LD для страницы каталога: CollectionPage, BreadcrumbList |
| sitemap-generation | `sitemap.ts` в App Router: динамические URL для всех монет |
| robots-txt | `robots.txt`: разрешения для поисковиков, блокировка служебных путей |
| semantic-html-audit | Аудит семантики HTML: правильные теги, ARIA, heading hierarchy |
| og-image-generation | Open Graph изображения через `next/og`: динамические для каждой монеты |

---

## Agent Core (надёжность работы агента)

| Скилл | Что делает |
|---|---|
| task-completion-persistence | Настойчивость: explicit output/outcome, доведение до конца |
| document-creation-guard | Проверка перед созданием ЛЮБОГО файла: разрешено или нет, нет ли дубликата |
| rca-incidents | RCA: 5 whys, фиксация в docs/incidents/, design injection (правило-предотвращение) |
| protocol-challenge | Challenge: фальсифицируй выводы, что не учёл, снизь overconfidence |
| code-review-checklist | Чеклист перед коммитом: TypeScript, data isolation, a11y, next/image |
| feature-create-sequence | Последовательность шагов при создании фичи: spec → data → UI → SEO → review |

---

## Git & Deploy (версионирование и деплой)

| Скилл | Что делает |
|---|---|
| git-commit-propose | Формулировка текста коммита: тип (feat/fix/chore), scope, описание |
| branch-review | Ревью branch перед merge: diff, конфликты, TypeScript build |
| vercel-preview-check | Проверка Vercel Preview URL после деплоя: визуальный QA |
| env-variables-setup | Управление env variables: .env.local, Vercel dashboard, типизация через process.env |

---

## Communications (взаимодействие с PM)

| Скилл | Что делает |
|---|---|
| client-perspective-review | Ревью артефакта глазами коллекционера-пользователя (не разработчика) |
| feature-summary | Краткое резюме что сделано: что изменилось, как проверить, текст коммита |
| adr-document | Architectural Decision Record: почему выбрано решение, альтернативы, trade-offs |

---

## Research (исследование и анализ)

| Скилл | Что делает |
|---|---|
| numismatic-data-research | Исследование данных о монетах РФ: серии, монетные дворы, тиражи, источники |
| competitor-catalog-analysis | Анализ конкурентов: нумизматические сайты, их UX, структура каталога |
| schema-org-numismatic | Изучение Schema.org типов для нумизматики: правильные свойства и значения |
