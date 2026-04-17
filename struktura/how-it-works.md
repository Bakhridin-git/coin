# Как работает система

## Принцип

Оркестратор (главный агент) **не делает работу сам** — он определяет тип задачи, находит нужного агента (или цепочку), делегирует, и показывает результат.

## Три слоя

```
PM говорит: "Создай страницу каталога монет"
                          |
                    Оркестратор (я)
                          |
          +---------------+---------------+
          v               v               v
    Standard 1.14    Skill:           Agent:
    (какой этап?)    component-create ui-developer
                     (как создать)    (делает работу)
```

**Стандарт** = зачем и что (правила проекта)
**Скилл** = как именно (пошаговая инструкция)
**Агент** = кто выполняет (специализированный ИИ-работник)

## Жизненный цикл фичи

Полная цепочка от идеи до деплоя:

```
1. Идея появилась
   -> spec-writer: формулирует требования, AC, Non-goals

2. Data layer
   -> data-service-builder: пишет сервис (getCoins, getCoinBySlug)
      -> sheets-analyst: читает Google Sheets MCP (структура таблицы)

3. UI компонент
   -> ui-developer: создаёт компонент (TypeScript + Tailwind + Shadcn)
      -> critique-design: стресс-тест дизайн-решения

4. SEO
   -> seo-specialist: meta-теги, JSON-LD, generateMetadata()

5. Code review
   -> code-reviewer: качество, типы, архитектура, доступность

6. Деплой
   -> orchestrator: git commit текст, push, Vercel preview

7. Закрытие фичи
   -> knowledge-extractor: learnings в docs/, обновление реестра
```

## Важные правила

### Data layer отделён от UI
Всегда: `lib/services/coins.ts` → компонент читает только через сервис.
Причина: лёгкая замена Google Sheets на Supabase без переписки UI.

### Slug — единственный ID
Формат: `[номинал]-[год]-[название-латиницей]` (например: `10r-2023-sevastopol`).
Используется в URL, именовании изображений, ключах LocalStorage.

### Изображения — строгая структура
```
/public/images/coins/
  10r-2023-sevastopol-obverse.jpg
  10r-2023-sevastopol-reverse.jpg
```
Компонент `CoinCard` всегда ожидает оба файла.

### Hard Blocks
Перед работой с Google Sheets MCP — обязательно прочитать структуру таблицы (названия колонок).
Перед SQL к Supabase — обязательно прочитать schema.sql.
Перед деплоем — обязательно TypeScript build без ошибок.

## Аналитика данных

```
sheets-analyst
      |
   Google Sheets MCP
      |
   Таблица «Нумизмат РФ - База»
   (ID, название, год, монетный двор, тираж, номинал, серия)
```

После миграции на Supabase:
```
supabase-analyst
      |
   Supabase MCP / REST API
      |
   PostgreSQL (coins, collections, users)
```

## Составные задачи

| Что говорит PM | Цепочка агентов |
|---|---|
| "Создай страницу монеты" | sheets-analyst → data-service-builder → ui-developer → seo-specialist → code-reviewer |
| "Сделай 3D-переворот" | ui-developer (Framer Motion) → critique-design → code-reviewer |
| "Подключи авторизацию" | spec-writer → data-service-builder (Supabase Auth) → ui-developer → code-reviewer |
| "Оптимизируй SEO" | seo-specialist → code-reviewer → client-review |
| "Мигрируй на Supabase" | spec-writer → data-service-builder → code-reviewer |

## Что делает оркестратор сам (не делегирует)

- Ответить на простой вопрос ("где лежит X?")
- Прочитать файл
- Мелкие правки (< 5 строк, 1 файл)
- Git commit + push (только по явной просьбе)
- Предложить текст коммита после изменений
