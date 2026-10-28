import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
// The font is bundled with the app so the portal works without internet access.
import '@fontsource/vazirmatn/300.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import '@fontsource/vazirmatn/900.css';
import './index.css';
import { setUpInstall } from './lib/pwa';

// The service worker belongs to the built portal; in development Vite serves fresh files itself.
if (import.meta.env.PROD) setUpInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
