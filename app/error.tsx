'use client';

/**
 * Показывает причину сбоя вместо пустой страницы «Internal Server Error».
 * Кнопка «Повторить» заново рендерит сегмент с теми же props.
 */
export default function CatalogError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '50vh',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#f5f4f0',
        color: '#1a1a2e'
      }}
    >
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Не удалось загрузить страницу</h1>
      <p style={{ marginBottom: '1rem', color: '#555', lineHeight: 1.5 }}>
        Произошла ошибка при отображении каталога. Попробуйте ещё раз или перезапустите dev-сервер (
        <code style={{ fontSize: '0.9em' }}>rm -rf .next && npm run dev</code>
        ).
      </p>
      {process.env.NODE_ENV === 'development' && (
        <pre
          style={{
            padding: '1rem',
            background: '#fff',
            border: '1px solid #e8e6e0',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
            marginBottom: '1rem'
          }}
        >
          {error.message}
          {error.digest ? `\n(digest: ${error.digest})` : ''}
        </pre>
      )}
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: '10px 18px',
          borderRadius: 10,
          border: '1px solid #e8e6e0',
          background: '#fff',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        Повторить
      </button>
    </div>
  );
}
