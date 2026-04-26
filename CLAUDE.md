# CLAUDE.md

Guidance for Claude Code working in **DG-Chat** — the multi-user P2P room with built-in DG-Lab Coyote remote-control.

## Project Overview

DG-Chat is a single-package Vite + React 19 SPA. Chat is fully peer-to-peer (PeerJS). Each user can grant remote control of their Coyote to other room members via WebRTC data channels. Hosted on GitHub Pages.

All BLE protocol + waveform code is reused from [`@dg-kit/*`](https://github.com/0xNullAI/DG-Kit) — DG-Chat owns just the React UI, the P2P layer, and the in-room command routing.

## Repo Layout

```
src/
  components/         UI components (ChatPanel, ControlPanel, MemberCard, …)
  hooks/              business hooks
    use-device.ts     wraps lib/bluetooth.ts, exposes React state
    use-peer-room.ts  PeerJS room management + member sync
    use-waveforms.ts  waveform library + import flow
  lib/
    bluetooth.ts      DGLabDevice — wraps @dg-kit/protocol + transport-webbluetooth
    protocol.ts       P2P message protocol (chat, device commands, waveform transfer)
    commands.ts       in-room command routing
    waveforms.ts      built-ins re-exported from @dg-kit/waveforms + .pulse import + localStorage
  styles/             tailwind tokens
  types/              ambient types (web-bluetooth.d.ts)
public/               static assets
```

## Branch & PR Convention

- Default branch: `main`
- All changes go directly on `main` (small project, single-user surface)
- For larger refactors, branch + PR is welcomed but not required

## Commands

```bash
npm install
npm run dev          # Vite dev server, http://localhost:5174/DG-Chat/
npm run build        # tsc -b + Vite build
npm run preview      # preview the production build
npm run lint         # eslint
```

## Test & Commit Workflow

Before commits:

1. `npm run lint` — zero new warnings (existing baseline has unrelated lint warnings; do not introduce more)
2. `npm run build` — tsc + Vite must succeed

> No vitest suite yet. For protocol logic, the regression coverage lives upstream in DG-Kit's tests.

Commit message style — conventional commits:

```
type(scope): short imperative subject

Optional body explaining the WHY.
```

`type` ∈ `feat | fix | refactor | docs | chore | test | perf | style`. `scope` is usually a directory (`bluetooth`, `room`, `waveforms`, `ui`).

PR description template:

```
## Summary
1-2 sentences.

## Test plan
- [x] npm run build
- [x] npm run lint
- [ ] Smoke test: create room, connect device, exercise feature
```

## Architecture Notes

- **`lib/protocol.ts` is the P2P chat protocol** — types like `ChatMessage`, `MemberState`, `WaveformTransfer`. Don't confuse with `@dg-kit/protocol` which is BLE.
- **`lib/bluetooth.ts` is a thin wrapper** over `@dg-kit/protocol` + `@dg-kit/transport-webbluetooth`. Public API (`DGLabDevice`, `DeviceVersion`, `DeviceInfo`, `WaveFrame`) preserved so `use-device.ts` and `commands.ts` can compile unchanged. If you need a new BLE feature, add it to DG-Kit first, then expose here.
- **Default per-channel safety cap is 50** (out of 0-200). Set on connect via `protocol.setLimits(50, 50)`. Users adjust via the UI; remote operators cannot exceed the local cap.
- **localStorage namespacing**: `dg-chat-custom-waveforms`, `dg-bg-behavior`, etc. Don't collide with DG-Agent's keys (different host so it doesn't matter in practice, but be explicit about origin).

## UI Maintenance Notes

- Background-behaviour setting (stop / keep) must persist across reloads (localStorage)
- Member list and chat panel responsive split: desktop = side-by-side, mobile = tabs
- Remote control panel must read same state regardless of viewer (no role-based hiding of strength/limit)

## Sister Projects

| Project | Purpose |
|---|---|
| [DG-Kit](https://github.com/0xNullAI/DG-Kit) | Shared TypeScript runtime (consumed by this project) |
| [DG-Agent](https://github.com/0xNullAI/DG-Agent) | Browser AI controller |
| [DG-MCP](https://github.com/0xNullAI/DG-MCP) | MCP server for Claude Desktop |

## Code Conventions

- TypeScript, ESM, React 19
- Tailwind CSS via `@tailwindcss/vite`
- UI strings in **Chinese (Simplified)**
- `import type` for type-only imports
- No emojis in code or comments unless explicitly requested
