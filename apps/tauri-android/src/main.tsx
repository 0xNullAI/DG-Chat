import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@chat/App';
import '@chat/index.css';
import './styles.css';
import { TauriBlecDeviceClient } from '@dg-kit/transport-tauri-blec';
import { showDevicePicker } from './components/show-device-picker';
import { wrapWithLifecycleSafety } from './lifecycle-safety';
import { installAndroidShellBehaviours, withBlePermissionHelp } from './android-shell';

// Wire up Android-only behaviours (status bar tint, keyboard scroll,
// hardware back button) before React renders.
installAndroidShellBehaviours();

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
      deviceClientFactory={(protocol) => {
        const inner = wrapWithLifecycleSafety(
          new TauriBlecDeviceClient({
            protocol,
            selectDevice: showDevicePicker,
            namePrefixes: ['47L121', 'D-LAB'],
            scanDurationMs: 8000,
          }),
        );
        return {
          ...inner,
          connect: () => withBlePermissionHelp(() => inner.connect()),
        };
      }}
    />
  </React.StrictMode>,
);
