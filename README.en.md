<div align="center">

# DG-Chat

**Multi-user P2P room with built-in Coyote remote-control. No server.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![@dg-kit](https://img.shields.io/badge/built%20on-%40dg--kit%2F*-0a84ff)](https://github.com/0xNullAI/DG-Kit)
[![Demo](https://img.shields.io/badge/demo-online-success)](https://0xnullai.github.io/DG-Chat/)

[中文](./README.md) | English

</div>

## What it is

DG-Chat is a browser-based multi-user chat room. Chat is fully peer-to-peer (no server, no chat-log uploads), but the real headline feature is this: **each member can grant remote control of their Coyote to other members in the room**. "Let X take a turn" — they tap your avatar and they're driving your strength sliders, waveform picker, and safety caps live.

Just open the page. Hosted free on GitHub Pages with HTTPS pre-configured.

## Features

- **P2P chat** — direct browser-to-browser, no server, no log retention
- **QR-code invites** — share room number or QR
- **Remote device control** — hand strength / waveform / limits to a teammate
- **Responsive layout** — split-pane on desktop, tabbed on mobile
- **Waveform import** — `.pulse` files and `.zip` packs
- **Background-behaviour policy** — choose what happens when the tab loses focus
- **Fully local** — settings and library stay in `localStorage`, never uploaded

## Quick start

### Try online

Open the [demo](https://0xnullai.github.io/DG-Chat/). Requires **Chrome / Edge** (Web Bluetooth).

### Local development

```bash
git clone https://github.com/0xNullAI/DG-Chat.git
cd DG-Chat
npm install
npm run dev
```

Visit http://localhost:5174/DG-Chat/.

## Usage

### Create or join a room

1. Open the page, enter a nickname
2. Click "Create" or paste a room number and click "Join"
3. Share the room number / QR with friends

### Connect your Coyote

1. Long-press the Coyote power button to turn it on
2. Click the Bluetooth icon at the top, pick the device

> Web Bluetooth requires HTTPS or localhost, and a supported browser (Chrome/Edge).

### Remote control

In the right-hand member list, tap any member (including yourself) → enter their control panel → adjust strength, swap waveforms, set safety caps.

> Local-side caps cannot be exceeded by remote control — safety is enforced at the protocol layer.

## Architecture

```
src/
  components/         UI components
  hooks/              business hooks (use-device / use-peer-room / use-waveforms)
  lib/
    bluetooth.ts      DGLabDevice — thin wrapper over @dg-kit/protocol + transport-webbluetooth
    protocol.ts       P2P message protocol (chat, device commands, waveform transfer)
    commands.ts       in-room command routing
    waveforms.ts      built-ins + .pulse import (via @dg-kit/waveforms)
```

All BLE and waveform code is reused from [`@dg-kit/*`](https://github.com/0xNullAI/DG-Kit). DG-Chat itself focuses on the React UI, the PeerJS-based P2P transport, and room state.

## Scripts

```bash
npm run dev
npm run build    # tsc + Vite
npm run lint
```

## Sister projects

| Project | Purpose |
|---|---|
| [DG-Kit](https://github.com/0xNullAI/DG-Kit) | Shared TypeScript runtime (consumed by this project) |
| [DG-Agent](https://github.com/0xNullAI/DG-Agent) | Browser AI controller |
| [DG-MCP](https://github.com/0xNullAI/DG-MCP) | MCP server for Claude Desktop |

## License

[MIT](./LICENSE)
