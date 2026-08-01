import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import { StoreProvider } from './app/store';
import { ErrorBoundary } from './app/ErrorBoundary';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* The boundary sits outside the store so a failure to open or read the
        database still renders something with an export button, rather than a
        blank page. */}
    <ErrorBoundary>
      {/* HashRouter so the built app works from any static host or file path
          without server-side rewrite rules. */}
      <HashRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline caching is a nicety; the app works without it */
    });
  });
}
