import {createRoot} from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App.tsx';
import './index.css';
import i18n from './i18n';
import { CombatStateProvider } from './contexts/CombatStateContext';
import { ColumnsProvider } from './contexts/ColumnsContext';
import { GMConsoleProvider } from './contexts/GMConsoleContext';

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <CombatStateProvider>
      <ColumnsProvider>
        <GMConsoleProvider>
          <App />
          <Toaster position="bottom-center" toastOptions={{ className: 'bg-zinc-900 text-zinc-100 border border-zinc-700' }} />
        </GMConsoleProvider>
      </ColumnsProvider>
    </CombatStateProvider>
  );
}

// Preload default namespace so useTranslation never suspends after first render
i18n.loadNamespaces(i18n.options.defaultNS || 'core').then(renderApp).catch(renderApp);
