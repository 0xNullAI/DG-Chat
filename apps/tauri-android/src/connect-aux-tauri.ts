/**
 * Tauri Android implementation of `DeviceSession`'s `TauriAuxConnectFn` hook
 * (see `src/lib/bluetooth.ts`) — connects one of the three auxiliary DG-Lab
 * device kinds (paw-prints, civet-edging, Opossum) using `@dg-kit/transport-
 * tauri-blec`'s `connectTauriAuxDevice()` (plugin-blec scan, scoped to the
 * given kind's name prefix, + the same `showDevicePicker` modal Coyote's
 * `TauriBlecDeviceClient` uses) instead of `navigator.bluetooth.requestDevice()`.
 *
 * `@dg-kit/transport-tauri-blec` doesn't yet export a single cross-kind
 * picker (`requestDgLabDevice()`'s Tauri equivalent) — that needs a
 * `TauriBlecDeviceClient.connectDevice()`-style passthrough added upstream
 * first. Until then, this is called once per kind, with the kind chosen by
 * the user via `DeviceSafetyButton`'s Tauri-only kind buttons.
 */
import { connectTauriAuxDevice } from '@dg-kit/transport-tauri-blec';
import {
  PAW_PRINTS_DEVICE_NAME_PREFIX,
  CIVET_DEVICE_NAME_PREFIX,
  OPOSSUM_DEVICE_NAME_PREFIX,
} from '@dg-kit/protocol';
import type { TauriAuxConnectFn } from '@chat/lib/bluetooth';
import { showDevicePicker } from './components/show-device-picker';

const NAME_PREFIXES: Record<Parameters<TauriAuxConnectFn>[0], string[]> = {
  'paw-prints': [PAW_PRINTS_DEVICE_NAME_PREFIX],
  'civet-edging': [CIVET_DEVICE_NAME_PREFIX],
  opossum: [OPOSSUM_DEVICE_NAME_PREFIX],
};

export const connectAuxTauri: TauriAuxConnectFn = async (kind, adapter) => {
  return connectTauriAuxDevice(
    {
      selectDevice: showDevicePicker,
      namePrefixes: NAME_PREFIXES[kind],
      scanDurationMs: 8000,
    },
    adapter,
    null,
    // DeviceSession registers its own gattserverdisconnected listener on
    // the returned device right after this resolves — no-op here so the
    // disconnect signal isn't handled twice.
    () => undefined,
  );
};
