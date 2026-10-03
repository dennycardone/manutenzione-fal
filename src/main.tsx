import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Layout } from './components/Layout';
import { StoreProvider, useStore } from './lib/store';
import { useRoute } from './lib/router';
import { Dashboard } from './pages/Dashboard';
import { SearchPage } from './pages/SearchPage';
import { PrcPage } from './pages/PrcPage';
import { ActivityPage } from './pages/ActivityPage';
import { ViewerPage } from './pages/ViewerPage';
import { ManualsPage } from './pages/ManualsPage';
import { ManualDetail } from './pages/ManualDetail';
import { ImportWizard } from './pages/ImportWizard';
import { ReviewPage } from './pages/ReviewPage';
import { LinksPage } from './pages/LinksPage';
import { StatusPage } from './pages/StatusPage';
import { SettingsPage } from './pages/SettingsPage';

function Router() {
  const { parts } = useRoute();
  const { ready } = useStore();
  if (!ready) return <div className="p-10 text-center text-sm text-muted">Caricamento dei dati locali…</div>;
  switch (parts[0]) {
    case undefined: return <Dashboard />;
    case 'dove': return <SearchPage />;
    case 'prc': return <PrcPage />;
    case 'attivita': return <ActivityPage />;
    case 'viewer': return <ViewerPage />;
    case 'manuali': return <ManualsPage />;
    case 'manuale': return <ManualDetail />;
    case 'documenti': return <ImportWizard />;
    case 'verifica': return <ReviewPage />;
    case 'collegamenti': return <LinksPage />;
    case 'stato': return <StatusPage />;
    case 'impostazioni': return <SettingsPage />;
    default: return <Dashboard />;
  }
}

class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err)
      return (
        <div className="card m-6 p-6">
          <div className="font-semibold text-miss">Si è verificato un errore</div>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{String(this.state.err?.stack || this.state.err)}</pre>
          <button className="btn btn-primary mt-4" onClick={() => { this.setState({ err: null }); location.hash = '#/'; }}>Torna alla dashboard</button>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <Layout>
      <Boundary>
        <Router />
      </Boundary>
    </Layout>
  </StoreProvider>,
);
