# DG-Chat

基于 MQTT 的多人房间，无需服务器部署，打开网页即可群聊 + 远程控制 DG-Lab 郊狼设备。

## 功能

- **即时通信** — 基于 MQTT 公共 Broker，多节点冗余，无需自建服务器
- **多人房间** — 输入房间号即可加入，支持二维码邀请
- **群聊** — 左侧实时聊天面板
- **远程设备控制** — 右侧成员列表，点击任意成员可远程控制其 DG-Lab 郊狼设备
- **A/B 双通道** — 独立调节强度、选择波形、播放/暂停
- **一键开火** — 按住圆形按钮瞬间提升到设定强度，松开立即恢复
- **波形系统** — 内置 6 种波形（呼吸、潮汐、低/中/高脉冲、敲击），支持导入 `.pulse` 文件
- **强度上限** — 每位用户可为自己的设备设定硬件级强度上限，他人无法突破
- **双版本兼容** — 支持 DG-Lab Coyote v2（D-LAB ESTIM）和 v3（47L121）
- **响应式布局** — 桌面端左右分栏，移动端 Tab 切换
- **明暗主题** — 支持手动切换

## 使用方法

### 创建 / 加入房间

1. 打开 [DG-Chat](https://0xnullai.github.io/DG-Chat/)，输入昵称
2. 点击「创建房间」或输入已有房间号点击「加入」
3. 将房间号或二维码分享给其他人

### 连接郊狼设备

1. 长按郊狼电源键开机
2. 点击页面顶部的蓝牙按钮，在系统弹窗中选择设备

> Web Bluetooth 需要 HTTPS + 支持的浏览器（见下表）

### 远程控制

在成员列表中点击任意成员，即可进入其设备控制界面，调节 A/B 通道的强度和波形。

## 浏览器兼容性

| 浏览器 | 聊天 | 设备控制 | 备注 |
| --- | --- | --- | --- |
| Chrome / Edge 80+ (桌面) | ✅ | ✅ | 推荐 |
| Chrome (Android) | ✅ | ✅ | 需蓝牙权限 |
| Safari 15.4+ (iOS) | ✅ | ❌ | 不支持 Web Bluetooth |
| Firefox | ✅ | ❌ | 不支持 Web Bluetooth |

## 安全须知

本项目涉及电刺激设备的远程控制，请务必：

1. **禁止**将电极放置在心脏、头部、颈部等危险部位
2. 从**最低强度**开始，逐步增加
3. 同一部位连续使用**不超过 30 分钟**
4. 确保使用者**知情同意**，且能随时停止
5. 远程控制前**提前与对方沟通**

## 本地开发

```bash
npm install
npm run dev
```

## 致谢

- [DG-LAB-OPENSOURCE](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE) — 官方开源 BLE 协议
- [openclaw-plugin-dg-lab](https://github.com/FengYing1314/openclaw-plugin-dg-lab) — 波形解析器参考实现
- [sse-dg-lab](https://github.com/admilkjs/sse-dg-lab) — Dungeonlab+pulse 波形解析引擎
- [DG-Agent](https://github.com/0xNullAI/DG-Agent) — 蓝牙协议与波形系统参考
- [MQTT.js](https://github.com/mqttjs/MQTT.js) — JavaScript MQTT 客户端
- [DG-Lab](https://www.dungeon-lab.com/) — 郊狼设备制造商

## 免责声明

本项目仅供学习交流使用，请遵守当地法律法规。使用者需自行承担使用风险。
