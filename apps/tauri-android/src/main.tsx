import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@chat/App';
import '@chat/index.css';
import { TauriBlecDeviceClient } from '@dg-kit/transport-tauri-blec';
import { showDevicePicker } from './components/show-device-picker';
import { wrapWithLifecycleSafety } from './lifecycle-safety';

// Fade out the splash placed in index.html once React commits its first frame.
queueMicrotask(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('dgch-splash');
    if (splash) {
      splash.classList.add('dgch-splash-loaded');
      setTimeout(() => splash.remove(), 250);
    }
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App
      deviceClientFactory={(protocol) =>
        wrapWithLifecycleSafety(
          new TauriBlecDeviceClient({
            protocol,
            selectDevice: showDevicePicker,
            namePrefixes: ['47L121', 'D-LAB'],
            scanDurationMs: 8000,
          }),
        )
      }
    />
  </React.StrictMode>,
);
