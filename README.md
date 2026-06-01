# WeFlow 助手

本项目是 WeFlow 的本地伴侣助手，用于公司内部测试辅助：读取 WeFlow 本地 HTTP API、分析聊天上下文、生成回复草稿，并把最终发送保留给人工确认。

## 能力边界

- 只读读取 WeFlow API：会话、消息、联系人相关数据。
- 可调用 AI 服务做摘要、待办、风险、回复草稿。
- 默认不自动发送微信消息；只会把草稿放入输入框等待人工确认。需要自动发送时，可在配置中心显式开启并选择发送方式。
- 可跳转打开 WeFlow 的对应会话页面：`/chat?sessionId=...`。

## 运行前准备

1. 在 WeFlow 设置中开启 `API 服务`。
2. 确认 WeFlow API 地址，默认是 `http://127.0.0.1:5031`。
3. 如果 WeFlow 设置了 Access Token，可在软件界面内填写并保存；也可以手动写入 `.env`。

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
REPLY_SCENARIOS=
AUTO_COPY_DRAFT_DELAY_MS=1200
WEIXIN_DRAFT_INPUT_MODE=paste
WEIXIN_TYPING_INTERVAL_MS=80
WEIXIN_TYPING_JITTER_MS=40
AUTO_ADVANCE_AFTER_MANUAL_SEND=false
AUTO_ANALYZE_AFTER_ADVANCE=true
AUTO_SKIP_EMPTY_SESSION=true
AI_AUTO_SKIP_TIMEOUT_MS=45000
ADVANCE_NEXT_SHORTCUT=Ctrl+Alt+N
MANUAL_SEND_WATCH_TIMEOUT_MS=120000
MANUAL_SEND_POLL_MS=3000
ADVANCE_DELAY_AFTER_SEND_MS=800
ACTIVATE_ASSISTANT_AFTER_SEND=true
AUTO_SEND_AFTER_DRAFT_INPUT=false
WEIXIN_SEND_MODE=enter
WEIXIN_SEARCH_MODE=name
CLEAR_INPUT_BEFORE_PASTE=true
WEIXIN_WINDOW_TITLE_KEYWORD=
AUTO_TASK_ENABLED=false
AUTO_TASK_INTERVAL_MS=300000
```

当前版本要求配置 AI 才能执行分析和草稿生成。建议优先在软件界面内填写并保存 AI 配置。
微信草稿填入方式也可在配置中心调整：`paste` 为直接粘贴，`typing` 为逐字模拟输入，`WEIXIN_TYPING_INTERVAL_MS` 控制基础间隔，`WEIXIN_TYPING_JITTER_MS` 控制每个字的随机波动范围。
助手只会激活已登录的微信主窗口，不会自动启动新的微信进程；如果电脑上有多个微信窗口，可在配置中心填写 `WEIXIN_WINDOW_TITLE_KEYWORD` 对应的窗口标题关键词。
发送后推进也可在配置中心开启：检测到你在微信手动发送后，会切回助手、选择下一个联系人，并可自动执行 AI 分析；也可以按 `Ctrl+Alt+N` 手动推进。
如果当前联系人没有聊天记录，或 AI 请求超过配置的超时时间，助手会自动跳过到下一个联系人，避免卡死。
自动发送默认关闭；开启后可选择 `enter` 模拟回车发送、`button` 模拟切到发送按钮后确认、`mouse` 鼠标点击微信窗口右下角发送按钮附近位置。
定时任务可在配置中心开启：界面里按“秒”填写执行间隔，底层仍保存为 `AUTO_TASK_INTERVAL_MS` 毫秒；每次按当前左侧会话列表从第一个联系人开始扫一轮，最后一条是自己发送的联系人会跳过继续下一个，扫完回到第一个联系人并等待下次间隔。
场景化回复也在配置中心维护：每个场景包含“场景类型、判断说明、回复 Prompt”，AI 会先判断当前聊天属于哪个场景，再选择对应 Prompt 生成回复。

## 启动

浏览器版：

```powershell
npm start
```

开发时自动重启：

```powershell
npm run dev
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
3. 在左侧配置并保存 WeFlow / AI 参数。
4. 点击 `AI 分析` 生成摘要。
5. 输入回复目标，生成草稿。
6. 人工检查草稿，复制后手动发送。
7. 如需查看完整上下文，点击 `在 WeFlow 打开`。

## 安全建议

- 只监听 `127.0.0.1`，不要暴露到局域网或公网。
- 不要把全量聊天记录发送给外部模型；优先限制条数并脱敏。
- 公司测试建议使用授权测试账号和授权设备。
- 所有发送动作保留人工确认，避免自动群发和风控风险。
