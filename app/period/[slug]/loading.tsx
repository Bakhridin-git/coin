import '../../catalog.css';
import '../../filter-bar.css';
import '../../catalog-loading.css';

function PlaceholderCard({ keyId }: { keyId: string }) {
  return (
    <div key={keyId} className="coin-card placeholder">
      <div className="coin-image-wrap">
        <div
          className="coin-card-flip"
          aria-hidden="true"
          style={{
            aspectRatio: '1 / 1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div className="placeholder-img" />
        </div>
      </div>
      <div className="coin-info" aria-hidden="true">
        <div className="placeholder-line short" />
        <div className="placeholder-line" />
      </div>
    </div>
  );
}

export default function Loading() {
  const placeholders = Array.from({ length: 12 }, (_, i) => `ph-${i}`);

  return (
    <div className="catalog-scope">
      <div className="main">
        <main className="content">
          <div className="catalog-loading-wrap">
            <div className="coin-grid" aria-label="Загрузка монет">
              {placeholders.map((id) => (
                <PlaceholderCard key={id} keyId={id} />
              ))}
            </div>
            <div className="catalog-loading-overlay" role="status" aria-live="polite">
              <div className="catalog-loading-dots" aria-label="Загрузка">
                {Array.from({ length: 9 }, (_, i) => i).map((i) => (
                  <span
                    key={`dot-${i}`}
                    className={[
                      'catalog-loading-dot',
                      i === 4 ? 'is-strong' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

