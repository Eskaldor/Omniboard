import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import i18n from './i18n';
import { CombatStateProvider } from './contexts/CombatStateContext';
import { ColumnsProvider } from './contexts/ColumnsContext';

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <CombatStateProvider>
      <ColumnsProvider>
        <App />
      </ColumnsProvider>
    </CombatStateProvider>
  );
}

// Preload default namespace so useTranslation never suspends after first render
i18n.loadNamespaces(i18n.options.defaultNS || 'core').then(renderApp).catch(renderApp);
