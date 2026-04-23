# DG-Chat — P2P 多人聊天 & 远程郊狼控制

> 基于 WebRTC 的 P2P 多人房间，无需服务器，打开网页即可群聊 + 远程控制 DG-Lab 郊狼设备。

## 特性

- **无服务器 P2P** — 基于 Trystero + Nostr 信令，WebRTC 直连，无需后端
- **多人房间** — 输入房间号即可加入，支持二维码分享
- **群聊 + 设备控制** — 左侧群聊面板，右侧成员列表；点击成员即可远程控制其 DG-Lab 设备
- **响应式布局** — 桌面端左右分栏，移动端 Tab 切换
- **双版本支持** — 适配 DG-Lab Coyote v2 (D-LAB ESTIM) 和 v3 (47L121)
- **波形系统** — 内置呼吸、潮汐、低脉冲、中脉冲、高脉冲、敲击六种波形，支持导入自定义 `.pulse` 文件
- **A/B 双通道控制** — 远程调节强度、选择波形
- **趣味互动** — 振动手机、抖动屏幕、蜂鸣、弹窗提醒、更换背景颜色

## 快速开始

### 1. 创建 / 加入房间

1. 打开网页，输入昵称
2. 点击「创建房间」生成房间号，或输入已有房间号点击「加入」
3. 将房间号或二维码分享给其他人

### 2. 连接设备

1. 长按郊狼电源键开机
2. 确保手机蓝牙已开启
3. 在页面中点击蓝牙连接按钮，在弹出的系统配对框中选择设备

> ⚠️ Web Bluetooth 需要 HTTPS 环境 + 支持的浏览器（见下方兼容性表格）

### 3. 远程控制

房间内的其他成员可以在成员列表中看到你的设备，点击即可远程调节 A/B 通道强度和波形。

## 浏览器支持

| 浏览器              | WebRTC 聊天 | 设备控制 (BLE) | 说明                                       |
| ------------------- | ----------- | -------------- | ------------------------------------------ |
| Chrome 80+ (桌面)   | ✅ 支持      | ✅ 支持         | 推荐                                       |
| Edge 80+ (桌面)     | ✅ 支持      | ✅ 支持         | 推荐                                       |
| Chrome (Android)    | ✅ 支持      | ✅ 支持         | 需系统蓝牙权限                             |
| Safari 15.4+ (iOS)  | ✅ 支持      | ❌ 不支持       | Apple 未实现 Web Bluetooth，聊天功能正常   |
| Firefox             | ✅ 支持      | ❌ 不支持       | Mozilla 未实现 Web Bluetooth，聊天功能正常 |

## 安全须知

> ⚡ 本项目涉及电刺激设备的远程控制，请务必遵守以下安全规范：

1. **禁止危险部位** — 禁止将电极放置在心脏、头部、颈部等危险部位
2. **从低强度开始** — 首次使用从最低强度开始，逐步增加
3. **限制使用时间** — 同一部位连续使用不超过 30 分钟
4. **确保知情同意** — 确保使用者清醒、自愿，且能随时停止
5. **远程控制须沟通** — 远程控制时请提前与对方沟通并获得同意

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- [Trystero](https://github.com/dmotz/trystero) — Nostr relay 信令 WebRTC P2P
- Web Bluetooth API — DG-Lab 设备蓝牙直连
- QR Code — 房间号二维码分享

## 本地开发

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

## 部署

项目配置了 GitHub Actions，推送到 `main` 分支即自动部署到 GitHub Pages。

> ⚠️ WebRTC 需要 HTTPS 环境。GitHub Pages 自带 HTTPS，本地开发使用 `localhost` 也支持 WebRTC。

## 致谢

- [DG-LAB-OPENSOURCE](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE) — 官方开源 BLE 协议
- [openclaw-plugin-dg-lab](https://github.com/FengYing1314/openclaw-plugin-dg-lab) — 波形解析器参考实现
- [sse-dg-lab](https://github.com/admilkjs/sse-dg-lab) — Dungeonlab+pulse 波形解析引擎
- [DG-Agent](https://github.com/0xNullAI/DG-Agent) — 本项目的蓝牙协议和波形系统参考了 DG-Agent 项目
- [Trystero](https://github.com/dmotz/trystero) — 无服务器 P2P WebRTC 房间
- [DG-Lab](https://www.dungeon-lab.com/) — DG-Lab Coyote 设备制造商

## 免责声明

> **本项目仅供学习交流使用，请遵守当地法律法规。使用者需自行承担使用风险。**
