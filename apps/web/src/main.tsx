import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.js';
import { createBrowserAuthService } from './auth/auth-client.js';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <App auth={createBrowserAuthService()} />
  </StrictMode>,
);
