import {StrictMode, lazy, Suspense} from 'react';
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
import { unlockSound } from './lib/sound';

// The service worker belongs to the built portal; in development Vite serves fresh files itself.
if (import.meta.env.PROD) setUpInstall();
// Lets an emoji from a colleague chime later (browsers allow sound only after the first click).
unlockSound();

// The big screen in the hall opens the portal at #screen: no account, no menus, just the event.
const EventScreen = lazy(() => import('./components/event/EventScreen').then((m) => ({ default: m.EventScreen })));
const isScreen = window.location.hash === '#screen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isScreen ? (
      <Suspense fallback={null}>
        <EventScreen />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
