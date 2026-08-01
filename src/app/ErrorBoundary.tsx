import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadBackup } from '../data/backup';

/**
 * A blank screen is the worst possible failure mode for this app.
 *
 * Everything lives in IndexedDB on one device, so if a render throws and the
 * user sees nothing, their entire record looks lost and there is no route to
 * getting it back. This boundary keeps the one action that matters reachable:
 * export. The data is almost always still perfectly fine — it is the UI that
 * broke — and the export path reads straight from the database without going
 * through React at all.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry — nothing leaves the device. The console is the only log.
    console.error('Praxis failed to render:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="shell">
        <div className="stack-lg" style={{ marginTop: 32 }}>
          <div>
            <h1>Something broke</h1>
            <p className="prose" style={{ marginTop: 12 }}>
              The screen failed to draw. Your data is almost certainly intact — this is the
              interface falling over, not the notebook.
            </p>
          </div>

          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void downloadBackup()}>
              Export my data
            </button>
            <button type="button" className="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>

          <p className="hint">
            Export first if you are at all unsure. The file it produces can be restored from
            Settings, and it reads the database directly rather than going through the screen
            that just failed.
          </p>

          <details>
            <summary className="label" style={{ cursor: 'pointer' }}>
              Technical detail
            </summary>
            <pre
              className="mono"
              style={{
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--ink-2)',
                marginTop: 8,
              }}
            >
              {error.name}: {error.message}
            </pre>
          </details>
        </div>
      </main>
    );
  }
}
