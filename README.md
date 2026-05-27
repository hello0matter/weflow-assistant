# WeFlow 助手

本项目是 WeFlow 的本地伴侣助手，用于公司内部测试辅助：读取 WeFlow 本地 HTTP API、分析聊天上下文、生成回复草稿，并把最终发送保留给人工确认。

## 能力边界

- 只读读取 WeFlow API：会话、消息、联系人相关数据。
- 可调用 AI 服务做摘要、待办、风险、回复草稿。
- 不自动发送微信消息，不自动点击发送按钮。
- 可跳转打开 WeFlow 的对应会话页面：`/chat?sessionId=...`。

## 运行前准备

1. 在 WeFlow 设置中开启 `API 服务`。
2. 确认 WeFlow API 地址，默认是 `http://127.0.0.1:5031`。
3. 如果 WeFlow 设置了 Access Token，把 Token 写入 `.env`。

## 配置

复制示例配置：

```powershell
Copy-Item .env.example .env
```

常用配置：

```env
WEFLOW_BASE_URL=http://127.0.0.1:5031
WEFLOW_ACCESS_TOKEN=
ASSISTANT_PORT=5088
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

不配置 `OPENAI_API_KEY` 时，助手会使用本地简析和占位草稿。

## 启动

浏览器版：

```powershell
npm start
```

打开：

```text
http://127.0.0.1:5088
```

桌面版：

```powershell
npm install
npm run desktop
```

桌面版会自动启动本地助手服务，并在系统托盘保留入口。关闭窗口时默认隐藏到托盘，托盘菜单可退出。

## 推荐使用流程

1. 搜索联系人或群聊。
2. 读取最近消息。
3. 点击 `AI/本地分析` 生成摘要。
4. 输入回复目标，生成草稿。
5. 人工检查草稿，复制后手动发送。
6. 如需查看完整上下文，点击 `在 WeFlow 打开`。

## 安全建议

- 只监听 `127.0.0.1`，不要暴露到局域网或公网。
- 不要把全量聊天记录发送给外部模型；优先限制条数并脱敏。
- 公司测试建议使用授权测试账号和授权设备。
- 所有发送动作保留人工确认，避免自动群发和风控风险。
