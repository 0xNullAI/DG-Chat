<div align="center">

# DG-Chat

**自带郊狼控制功能的多人 P2P 房间，无需服务器**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![@dg-kit](https://img.shields.io/badge/built%20on-%40dg--kit%2F*-0a84ff)](https://github.com/0xNullAI/DG-Kit)
[![Demo](https://img.shields.io/badge/demo-online-success)](https://0xnullai.github.io/DG-Chat/)

中文 | [English](./README.en.md)

</div>

## 这是什么

DG-Chat 是一个浏览器端的多人聊天房间。聊天本身用 P2P 协议直连，无需服务器存储；除此之外，**每个成员可以把自己的郊狼设备授权给房间里其他人远程控制**——发"现在让谁谁谁来"，对方点你头像就能调强度、换波形、发短脉冲。

打开网页就能用，跑在 GitHub Pages 免费托管的 HTTPS 上。

## 特性

- **P2P 聊天** — 浏览器之间直连，无服务器、无聊天记录上传
- **二维码邀请** — 房间号 + 二维码，分享给朋友直接加入
- **远程设备控制** — 把强度滑块、波形选择、安全上限的控制权交给队友
- **响应式布局** — 桌面端左右分栏，移动端 Tab 切换
- **波形导入** — 支持 `.pulse` / `.zip` 自定义波形包
- **后台保活策略** — 切到后台时是停止输出还是继续，由你设置
- **完全本地** — 设置和波形库都在 localStorage，不上传

## 快速开始

### 在线试玩

打开 [demo](https://0xnullai.github.io/DG-Chat/)。需要 **Chrome / Edge**（Web Bluetooth）。

### 本地开发

```bash
git clone https://github.com/0xNullAI/DG-Chat.git
cd DG-Chat
npm install
npm run dev
```

打开 http://localhost:5174/DG-Chat/。

## 使用方法

### 创建 / 加入房间

1. 打开页面，输入昵称
2. 点"创建房间"或输入房间号点"加入"
3. 把房间号或二维码分享给其他人

### 连接郊狼

1. 长按郊狼电源键开机
2. 点页面顶部蓝牙按钮，在系统弹窗里选择设备

> Web Bluetooth 需要 HTTPS 或 localhost + 支持的浏览器（Chrome/Edge）。

### 远程控制

在右侧成员列表点任意成员（包括自己）→ 进入控制界面 → 调强度、换波形、设安全上限。

> 本机端开了某个上限，远端控制不能突破——安全约束在硬件层面。

## 架构

```
src/
  components/         UI 组件
  hooks/              业务 Hook（use-device、use-peer-room、use-waveforms）
  lib/
    bluetooth.ts      DGLabDevice：基于 @dg-kit/protocol + transport-webbluetooth 的薄封装
    protocol.ts       P2P 消息协议（聊天、设备命令、波形传输）
    commands.ts       房间内命令分发
    waveforms.ts      内置波形 + .pulse 导入（基于 @dg-kit/waveforms）
```

蓝牙 + 波形相关代码完全复用了 [`@dg-kit/*`](https://github.com/0xNullAI/DG-Kit) 的中台实现，DG-Chat 自身只负责 React UI、P2P 连接（基于 PeerJS）和房间状态。

## 命令

```bash
npm run dev      # 本地开发
npm run build    # tsc + Vite 构建
npm run lint
```

## 相关项目

| 项目 | 用途 |
|---|---|
| [DG-Kit](https://github.com/0xNullAI/DG-Kit) | 共享的 TypeScript 中台（被本项目消费） |
| [DG-Agent](https://github.com/0xNullAI/DG-Agent) | 浏览器版 AI 控制器，自然语言驱动 |
| [DG-MCP](https://github.com/0xNullAI/DG-MCP) | MCP 服务器，接入 Claude Desktop |

## 协议

[MIT](./LICENSE)
