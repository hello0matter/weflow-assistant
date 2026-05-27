const state = {
  config: null,
  selected: null,
  sessions: [],
  messages: [],
  loadingMessages: false,
  manualSendWatch: null
}

const defaultReplyAnalysisPrompt = '你是公司内部微信回复助手。只基于用户授权的本地聊天记录，直接生成一段适合发给对方的微信回复正文。不要做总结，不要解释思路，不要分点，不要加标题，不要出现“建议回复”这类提示语，只输出最终可发送的话。语气自然，贴近真实聊天，避免过长。'
const defaultReplyDraftPrompt = '你是公司内部微信回复助手。只基于用户授权的本地聊天记录起草回复。只输出适合直接发给对方的微信正文，不要解释，不要分点，不要加标题，不要出现系统提示语。语气自然，像真人聊天。'
const defaultScenarios = [
  {
    type: '刚认识',
    description: '刚加好友或首次开始聊天，双方信息较少。',
    prompt: '生成一句自然不尴尬的开场回复，语气轻松友好，不要太热情，不要查户口，优先延续对方刚提到的话题。'
  },
  {
    type: '打招呼',
    description: '对方只是问好、寒暄、在不在。',
    prompt: '生成一句简短自然的回应，先回应问候，再轻轻抛出一个容易回答的问题，避免长篇解释。'
  },
  {
    type: '兴趣爱好',
    description: '聊天已经涉及爱好、日常、娱乐、旅行、运动、吃喝等个人兴趣。',
    prompt: '生成一句围绕对方兴趣继续聊下去的回复，包含一个具体追问或共鸣点，语气像真人聊天。'
  },
  {
    type: '工作沟通',
    description: '聊天涉及任务、时间、需求、进度、确认、协作。',
    prompt: '生成一句清晰礼貌的工作回复，明确确认事项、下一步或时间点，避免暧昧表达。'
  }
]

const elements = {
  configBtn: document.querySelector('#configBtn'),
  closeConfigBtn: document.querySelector('#closeConfigBtn'),
  configBackdrop: document.querySelector('#configBackdrop'),
  configModal: document.querySelector('#configModal'),
  healthBtn: document.querySelector('#healthBtn'),
  keywordInput: document.querySelector('#keywordInput'),
  searchBtn: document.querySelector('#searchBtn'),
  status: document.querySelector('#status'),
  weflowBaseUrlInput: document.querySelector('#weflowBaseUrlInput'),
  weflowTokenInput: document.querySelector('#weflowTokenInput'),
  aiBaseUrlInput: document.querySelector('#aiBaseUrlInput'),
  aiApiKeyInput: document.querySelector('#aiApiKeyInput'),
  aiModelInput: document.querySelector('#aiModelInput'),
  analysisSystemPromptInput: document.querySelector('#analysisSystemPromptInput'),
  draftSystemPromptInput: document.querySelector('#draftSystemPromptInput'),
  scenarioList: document.querySelector('#scenarioList'),
  addScenarioBtn: document.querySelector('#addScenarioBtn'),
  resetScenariosBtn: document.querySelector('#resetScenariosBtn'),
  autoOpenChatAfterDraftInput: document.querySelector('#autoOpenChatAfterDraftInput'),
  autoCopyDraftAfterDraftInput: document.querySelector('#autoCopyDraftAfterDraftInput'),
  autoCopyDraftDelayMsInput: document.querySelector('#autoCopyDraftDelayMsInput'),
  weixinDraftInputModeInput: document.querySelector('#weixinDraftInputModeInput'),
  weixinTypingIntervalMsInput: document.querySelector('#weixinTypingIntervalMsInput'),
  weixinTypingJitterMsInput: document.querySelector('#weixinTypingJitterMsInput'),
  autoAdvanceAfterManualSendInput: document.querySelector('#autoAdvanceAfterManualSendInput'),
  autoAnalyzeAfterAdvanceInput: document.querySelector('#autoAnalyzeAfterAdvanceInput'),
  autoSkipEmptySessionInput: document.querySelector('#autoSkipEmptySessionInput'),
  aiAutoSkipTimeoutMsInput: document.querySelector('#aiAutoSkipTimeoutMsInput'),
  advanceNextShortcutInput: document.querySelector('#advanceNextShortcutInput'),
  manualSendWatchTimeoutMsInput: document.querySelector('#manualSendWatchTimeoutMsInput'),
  manualSendPollMsInput: document.querySelector('#manualSendPollMsInput'),
  advanceDelayAfterSendMsInput: document.querySelector('#advanceDelayAfterSendMsInput'),
  weixinSearchModeInput: document.querySelector('#weixinSearchModeInput'),
  clearInputBeforePasteInput: document.querySelector('#clearInputBeforePasteInput'),
  autoSendAfterDraftInputInput: document.querySelector('#autoSendAfterDraftInputInput'),
  weixinSendModeInput: document.querySelector('#weixinSendModeInput'),
  resetReplyPromptBtn: document.querySelector('#resetReplyPromptBtn'),
  saveConfigBtn: document.querySelector('#saveConfigBtn'),
  toggleTokenBtn: document.querySelector('#toggleTokenBtn'),
  toggleAiKeyBtn: document.querySelector('#toggleAiKeyBtn'),
  sessions: document.querySelector('#sessions'),
  sessionTitle: document.querySelector('#sessionTitle'),
  sessionMeta: document.querySelector('#sessionMeta'),
  openWeFlowBtn: document.querySelector('#openWeFlowBtn'),
  copyTalkerBtn: document.querySelector('#copyTalkerBtn'),
  limitInput: document.querySelector('#limitInput'),
  autoAnalyzeCheckbox: document.querySelector('#autoAnalyzeCheckbox'),
  loadMessagesBtn: document.querySelector('#loadMessagesBtn'),
  analyzeBtn: document.querySelector('#analyzeBtn'),
  purposeInput: document.querySelector('#purposeInput'),
  analysisScenario: document.querySelector('#analysisScenario'),
  analysis: document.querySelector('#analysis'),
  messages: document.querySelector('#messages'),
  intentInput: document.querySelector('#intentInput'),
  draftBtn: document.querySelector('#draftBtn'),
  draftOutput: document.querySelector('#draftOutput'),
  copyDraftBtn: document.querySelector('#copyDraftBtn')
}

init()
window.weflowAssistantAdvanceNext = async () => {
  stopManualSendWatch()
  await requestJson('/api/activate-assistant', { method: 'POST' }).catch(() => ({}))
  await advanceToNextSession()
}

async function init() {
  bindEvents()
  await loadConfig()
  await checkHealth()
  await searchSessions()
}

function bindEvents() {
  elements.configBtn.addEventListener('click', openConfigModal)
  elements.closeConfigBtn.addEventListener('click', closeConfigModal)
  elements.configBackdrop.addEventListener('click', closeConfigModal)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeConfigModal()
    if (matchesShortcut(event, state.config?.advanceNextShortcut || 'Ctrl+Alt+N')) {
      event.preventDefault()
      stopManualSendWatch()
      advanceToNextSession()
    }
  })

  elements.healthBtn.addEventListener('click', checkHealth)
  elements.searchBtn.addEventListener('click', searchSessions)
  elements.keywordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchSessions()
  })
  elements.saveConfigBtn.addEventListener('click', saveConfig)
  elements.toggleTokenBtn.addEventListener('click', toggleTokenVisibility)
  elements.toggleAiKeyBtn.addEventListener('click', toggleAiKeyVisibility)
  elements.resetReplyPromptBtn.addEventListener('click', resetReplyPrompts)
  elements.addScenarioBtn.addEventListener('click', () => {
    renderScenarios([...readScenarioInputs(), { type: '', description: '', prompt: '' }])
  })
  elements.resetScenariosBtn.addEventListener('click', () => {
    renderScenarios(defaultScenarios)
    setStatus('已恢复默认场景配置，记得保存配置。', 'ok')
  })
  elements.loadMessagesBtn.addEventListener('click', () => loadMessages({ autoAnalyze: false }))
  elements.analyzeBtn.addEventListener('click', analyzeSession)
  elements.draftBtn.addEventListener('click', draftReply)
  elements.copyDraftBtn.addEventListener('click', () => copyText(elements.draftOutput.value, '草稿已复制，请人工确认后发送。'))
  elements.copyTalkerBtn.addEventListener('click', () => {
    if (state.selected?.id) copyText(state.selected.id, '会话 ID 已复制。')
  })
  elements.openWeFlowBtn.addEventListener('click', openInWeFlow)
}

async function loadConfig() {
  const data = await requestJson('/api/config')
  state.config = data.config
  elements.weflowBaseUrlInput.value = state.config?.weflowBaseUrl || ''
  elements.weflowTokenInput.value = state.config?.weflowAccessToken || ''
  elements.aiBaseUrlInput.value = state.config?.openaiBaseUrl || ''
  elements.aiApiKeyInput.value = state.config?.openaiApiKey || ''
  elements.aiModelInput.value = state.config?.model || ''
  elements.analysisSystemPromptInput.value = state.config?.analysisSystemPrompt || ''
  elements.draftSystemPromptInput.value = state.config?.draftSystemPrompt || ''
  renderScenarios(state.config?.replyScenarios || defaultScenarios)
  elements.autoOpenChatAfterDraftInput.checked = state.config?.autoOpenChatAfterDraft !== false
  elements.autoCopyDraftAfterDraftInput.checked = state.config?.autoCopyDraftAfterDraft !== false
  elements.autoCopyDraftDelayMsInput.value = String(state.config?.autoCopyDraftDelayMs ?? 1200)
  elements.weixinDraftInputModeInput.value = state.config?.weixinDraftInputMode || 'paste'
  elements.weixinTypingIntervalMsInput.value = String(state.config?.weixinTypingIntervalMs ?? 80)
  elements.weixinTypingJitterMsInput.value = String(state.config?.weixinTypingJitterMs ?? 40)
  elements.autoAdvanceAfterManualSendInput.checked = state.config?.autoAdvanceAfterManualSend === true
  elements.autoAnalyzeAfterAdvanceInput.checked = state.config?.autoAnalyzeAfterAdvance !== false
  elements.autoSkipEmptySessionInput.checked = state.config?.autoSkipEmptySession !== false
  elements.aiAutoSkipTimeoutMsInput.value = String(state.config?.aiAutoSkipTimeoutMs ?? 45000)
  elements.advanceNextShortcutInput.value = state.config?.advanceNextShortcut || 'Ctrl+Alt+N'
  elements.manualSendWatchTimeoutMsInput.value = String(state.config?.manualSendWatchTimeoutMs ?? 120000)
  elements.manualSendPollMsInput.value = String(state.config?.manualSendPollMs ?? 3000)
  elements.advanceDelayAfterSendMsInput.value = String(state.config?.advanceDelayAfterSendMs ?? 800)
  elements.weixinSearchModeInput.value = state.config?.weixinSearchMode || 'name'
  elements.clearInputBeforePasteInput.checked = state.config?.clearInputBeforePaste !== false
  elements.autoSendAfterDraftInputInput.checked = state.config?.autoSendAfterDraftInput === true
  elements.weixinSendModeInput.value = state.config?.weixinSendMode || 'enter'
}

function openConfigModal() {
  elements.configModal.classList.remove('hidden')
  elements.configModal.setAttribute('aria-hidden', 'false')
}

function closeConfigModal() {
  elements.configModal.classList.add('hidden')
  elements.configModal.setAttribute('aria-hidden', 'true')
}

async function checkHealth() {
  setStatus('正在检测 WeFlow API...')
  try {
    const data = await requestJson('/api/health')
    const weflow = data.weflow || {}
    if (weflow.authRequired) {
      setStatus('WeFlow API 已连接，但会话接口要求 Access Token。请打开配置弹窗填写 token。', 'error')
      return
    }
    setStatus('WeFlow API 可用。', 'ok')
  } catch (error) {
    setStatus(`WeFlow API 不可用：${error.message}`, 'error')
  }
}

async function searchSessions() {
  setStatus('正在搜索会话...')
  elements.sessions.innerHTML = ''
  try {
    const keyword = elements.keywordInput.value.trim()
    const data = await requestJson(`/api/sessions?limit=100${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`)
    const sessions = normalizeSessions(data)
    state.sessions = sessions
    renderSessions(sessions)
    setStatus(`找到 ${sessions.length} 个会话。`, 'ok')
  } catch (error) {
    setStatus(`搜索失败：${error.message}`, 'error')
  }
}

async function saveConfig() {
  setStatus('正在保存配置...')
  try {
    const data = await requestJson('/api/config', {
      method: 'POST',
      body: JSON.stringify({
        weflowBaseUrl: elements.weflowBaseUrlInput.value.trim(),
        weflowAccessToken: elements.weflowTokenInput.value,
        openaiBaseUrl: elements.aiBaseUrlInput.value.trim(),
        openaiApiKey: elements.aiApiKeyInput.value,
        openaiModel: elements.aiModelInput.value.trim(),
        analysisSystemPrompt: elements.analysisSystemPromptInput.value,
        draftSystemPrompt: elements.draftSystemPromptInput.value,
        replyScenarios: readScenarioInputs(),
        autoOpenChatAfterDraft: elements.autoOpenChatAfterDraftInput.checked,
        autoCopyDraftAfterDraft: elements.autoCopyDraftAfterDraftInput.checked,
        autoCopyDraftDelayMs: Number(elements.autoCopyDraftDelayMsInput.value || 1200),
        weixinDraftInputMode: elements.weixinDraftInputModeInput.value,
        weixinTypingIntervalMs: Number(elements.weixinTypingIntervalMsInput.value || 80),
        weixinTypingJitterMs: Number(elements.weixinTypingJitterMsInput.value || 40),
        autoAdvanceAfterManualSend: elements.autoAdvanceAfterManualSendInput.checked,
        autoAnalyzeAfterAdvance: elements.autoAnalyzeAfterAdvanceInput.checked,
        autoSkipEmptySession: elements.autoSkipEmptySessionInput.checked,
        aiAutoSkipTimeoutMs: Number(elements.aiAutoSkipTimeoutMsInput.value || 45000),
        advanceNextShortcut: elements.advanceNextShortcutInput.value.trim() || 'Ctrl+Alt+N',
        manualSendWatchTimeoutMs: Number(elements.manualSendWatchTimeoutMsInput.value || 120000),
        manualSendPollMs: Number(elements.manualSendPollMsInput.value || 3000),
        advanceDelayAfterSendMs: Number(elements.advanceDelayAfterSendMsInput.value || 800),
        weixinSearchMode: elements.weixinSearchModeInput.value,
        clearInputBeforePaste: elements.clearInputBeforePasteInput.checked,
        autoSendAfterDraftInput: elements.autoSendAfterDraftInputInput.checked,
        weixinSendMode: elements.weixinSendModeInput.value
      })
    })
    state.config = data.config
    setStatus('配置已保存。', 'ok')
    closeConfigModal()
    await checkHealth()
    if (state.selected) {
      await loadMessages({ autoAnalyze: false })
    }
  } catch (error) {
    setStatus(`保存失败：${error.message}`, 'error')
  }
}

function toggleTokenVisibility() {
  const isPassword = elements.weflowTokenInput.type === 'password'
  elements.weflowTokenInput.type = isPassword ? 'text' : 'password'
  elements.toggleTokenBtn.textContent = isPassword ? '隐藏 Token' : '显示 Token'
}

function toggleAiKeyVisibility() {
  const isPassword = elements.aiApiKeyInput.type === 'password'
  elements.aiApiKeyInput.type = isPassword ? 'text' : 'password'
  elements.toggleAiKeyBtn.textContent = isPassword ? '隐藏 AI Key' : '显示 AI Key'
}

function resetReplyPrompts() {
  elements.analysisSystemPromptInput.value = defaultReplyAnalysisPrompt
  elements.draftSystemPromptInput.value = defaultReplyDraftPrompt
  setStatus('已恢复为默认回复型 Prompt，记得保存配置。', 'ok')
}

function renderScenarios(scenarios) {
  const normalized = normalizeScenarioConfig(scenarios)
  elements.scenarioList.innerHTML = normalized.map((scenario, index) => `
    <div class="scenario-item" data-index="${index}">
      <div class="scenario-item-head">
        <label class="field-label">
          场景类型
          <input class="scenario-type" value="${escapeHtml(scenario.type)}" placeholder="例如：刚认识" />
        </label>
        <label class="field-label">
          判断说明
          <input class="scenario-description" value="${escapeHtml(scenario.description)}" placeholder="让 AI 判断何时属于这个场景" />
        </label>
        <button class="secondary-btn scenario-remove-btn" type="button">删除</button>
      </div>
      <label class="field-label">
        该场景回复 Prompt
        <textarea class="scenario-prompt" placeholder="这个场景下要怎么回复">${escapeHtml(scenario.prompt)}</textarea>
      </label>
    </div>
  `).join('')

  for (const button of elements.scenarioList.querySelectorAll('.scenario-remove-btn')) {
    button.addEventListener('click', () => {
      const item = button.closest('.scenario-item')
      const index = Number(item?.dataset.index)
      const nextScenarios = readScenarioInputs().filter((_, itemIndex) => itemIndex !== index)
      renderScenarios(nextScenarios.length ? nextScenarios : [{ type: '', description: '', prompt: '' }])
    })
  }
}

function readScenarioInputs() {
  return Array.from(elements.scenarioList.querySelectorAll('.scenario-item')).map((item) => ({
    type: item.querySelector('.scenario-type')?.value.trim() || '',
    description: item.querySelector('.scenario-description')?.value.trim() || '',
    prompt: item.querySelector('.scenario-prompt')?.value.trim() || ''
  })).filter((scenario) => scenario.type || scenario.description || scenario.prompt)
}

function normalizeScenarioConfig(scenarios) {
  const list = Array.isArray(scenarios) ? scenarios : defaultScenarios
  const normalized = list.map((scenario) => ({
    type: String(scenario?.type || '').trim(),
    description: String(scenario?.description || '').trim(),
    prompt: String(scenario?.prompt || '').trim()
  })).filter((scenario) => scenario.type || scenario.description || scenario.prompt)
  return normalized.length ? normalized : defaultScenarios
}

function normalizeSessions(data) {
  const list = data.sessions || data.data || data.items || []
  return Array.isArray(list) ? list.map((item) => {
    const id = item.sessionId || item.username || item.talker || item.id || item.userName || ''
    const name = item.displayName || item.name || item.nickName || item.remark || item.nickname || id
    return {
      raw: item,
      id,
      name,
      preview: item.lastMessage || item.lastContent || item.content || item.preview || '',
      time: item.lastTime || item.updateTime || item.createTime || item.timestamp || ''
    }
  }).filter((item) => item.id) : []
}

function renderSessions(sessions) {
  if (!sessions.length) {
    elements.sessions.innerHTML = '<div class="status">没有匹配会话。</div>'
    return
  }
  elements.sessions.innerHTML = sessions.map((session) => `
    <div class="session-item" data-id="${escapeHtml(session.id)}">
      <div class="session-name">${escapeHtml(session.name)}</div>
      <div class="session-id">${escapeHtml(session.id)}</div>
      <div class="session-id">${escapeHtml(String(session.preview || '').slice(0, 80))}</div>
    </div>
  `).join('')

  for (const node of elements.sessions.querySelectorAll('.session-item')) {
    node.addEventListener('click', async () => {
      const session = sessions.find((item) => item.id === node.dataset.id)
      if (!session) return
      selectSession(session)
      await loadMessages({ autoAnalyze: elements.autoAnalyzeCheckbox.checked })
    })
  }
}

function selectSession(session) {
  stopManualSendWatch()
  state.selected = session
  state.messages = []
  for (const node of elements.sessions.querySelectorAll('.session-item')) {
    node.classList.toggle('active', node.dataset.id === session.id)
  }
  elements.sessionTitle.textContent = session.name
  elements.sessionMeta.textContent = session.id
  elements.messages.innerHTML = '<div class="status">正在自动读取最近消息...</div>'
  elements.analysisScenario.classList.add('hidden')
  elements.analysisScenario.textContent = ''
  elements.analysis.textContent = '分析结果会显示在这里。'
  elements.openWeFlowBtn.disabled = false
  elements.copyTalkerBtn.disabled = false
  elements.loadMessagesBtn.disabled = false
  elements.analyzeBtn.disabled = false
  elements.draftBtn.disabled = false
}

async function loadMessages({ autoAnalyze = false } = {}) {
  if (!state.selected || state.loadingMessages) return
  state.loadingMessages = true
  setStatus('正在读取消息...')
  try {
    const limit = Number(elements.limitInput.value || 80)
    const data = await requestJson(`/api/messages?talker=${encodeURIComponent(state.selected.id)}&limit=${encodeURIComponent(limit)}`)
    state.messages = Array.isArray(data.messages) ? data.messages : []
    renderMessages(state.messages)
    setStatus(`已读取 ${state.messages.length} 条消息。`, 'ok')
    if (autoAnalyze && !state.messages.length && state.config?.autoSkipEmptySession !== false) {
      setStatus('当前联系人没有聊天记录，自动跳过。', 'ok')
      await delay(300)
      state.loadingMessages = false
      await advanceToNextSession()
      return
    }
    if (autoAnalyze) {
      await analyzeSession()
    }
  } catch (error) {
    setStatus(`读取失败：${error.message}`, 'error')
  } finally {
    state.loadingMessages = false
  }
}

function renderMessages(messages) {
  if (!messages.length) {
    elements.messages.innerHTML = '<div class="status">暂无消息。</div>'
    return
  }
  elements.messages.innerHTML = messages.map((message) => {
    const mine = message.isSend === 1
    const sender = mine ? '我' : (message.senderName || message.senderUsername || message.sourceName || '对方')
    const content = message.content || message.parsedContent || message.rawContent || '[非文本消息]'
    return `
      <div class="message-item ${mine ? 'mine' : ''}">
        <div class="message-sender">${escapeHtml(sender)}</div>
        <div class="message-time">${escapeHtml(formatTime(message.createTime || message.timestamp || message.time))}</div>
        <div class="message-content">${escapeHtml(String(content))}</div>
      </div>
    `
  }).join('')
}

async function analyzeSession() {
  if (!state.selected) return
  elements.analysis.textContent = '正在分析...'
  try {
    const data = await requestJsonWithTimeout('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        talker: state.selected.id,
        limit: Number(elements.limitInput.value || 80),
        purpose: elements.purposeInput.value
      })
    }, Number(state.config?.aiAutoSkipTimeoutMs ?? 45000))
    elements.analysis.textContent = data.analysis || '无分析结果。'
    renderAnalysisScenario(data.scenario)
    setStatus(`AI 分析完成${data.scenario?.type ? `，当前场景：${data.scenario.type}` : ''}，准备打开微信并粘贴回复。`, 'ok')
    await handlePostWechatActions(elements.analysis.textContent, 'AI 分析结果已准备到微信输入框。请人工确认后发送。')
  } catch (error) {
    elements.analysis.textContent = `分析失败：${error.message}`
    setStatus(`分析失败：${error.message}`, 'error')
    if (error.name === 'AbortError' || error.message.includes('超时')) {
      setStatus('AI 长时间无响应，自动跳过当前联系人。', 'error')
      await delay(300)
      state.loadingMessages = false
      await advanceToNextSession()
    }
  }
}

function renderAnalysisScenario(scenario) {
  if (!scenario?.type) {
    elements.analysisScenario.classList.add('hidden')
    elements.analysisScenario.textContent = ''
    return
  }
  elements.analysisScenario.classList.remove('hidden')
  elements.analysisScenario.textContent = `场景：${scenario.type}${scenario.reason ? `｜${scenario.reason}` : ''}`
}

async function draftReply() {
  if (!state.selected) return
  elements.draftOutput.value = '正在生成草稿...'
  try {
    const data = await requestJson('/api/draft', {
      method: 'POST',
      body: JSON.stringify({
        talker: state.selected.id,
        limit: 50,
        intent: elements.intentInput.value
      })
    })
    elements.draftOutput.value = data.draft || ''
    setStatus('AI 草稿生成完成，准备打开微信并粘贴。', 'ok')
    await handlePostWechatActions(elements.draftOutput.value, 'AI 草稿已准备到微信输入框。请人工确认后发送。')
  } catch (error) {
    elements.draftOutput.value = `生成失败：${error.message}`
    setStatus(`草稿失败：${error.message}`, 'error')
  }
}

async function handlePostWechatActions(text, fallbackMessage) {
  if (!state.selected || !state.config || !text) return
  if (state.config.autoOpenChatAfterDraft) {
    try {
      const searchText = state.config.weixinSearchMode === 'id' ? state.selected.id : (state.selected.name || state.selected.id)
      const result = await requestJson('/api/prepare-weixin-draft', {
        method: 'POST',
        body: JSON.stringify({
          searchText,
          sessionName: state.selected.name,
          talkerId: state.selected.id,
          draft: text,
          shouldPaste: state.config.autoCopyDraftAfterDraft !== false,
          delayMs: Number(state.config.autoCopyDraftDelayMs ?? 1200),
          inputMode: state.config.weixinDraftInputMode || 'paste',
          typingIntervalMs: Number(state.config.weixinTypingIntervalMs ?? 80),
          typingJitterMs: Number(state.config.weixinTypingJitterMs ?? 40),
          autoSend: state.config.autoSendAfterDraftInput === true,
          sendMode: state.config.weixinSendMode || 'enter',
          clearInputBeforePaste: state.config.clearInputBeforePaste !== false
        })
      })
      if (!result.prepared) {
        openInWeFlow()
      } else {
        setStatus(result.autoSent ? '草稿已自动发送。' : fallbackMessage, 'ok')
        if (!result.autoSent) startManualSendWatch(text)
        if (result.autoSent && state.config?.autoAnalyzeAfterAdvance !== false) {
          await delay(Number(state.config?.advanceDelayAfterSendMs ?? 800))
          await requestJson('/api/activate-assistant', { method: 'POST' }).catch(() => ({}))
          await advanceToNextSession()
        }
      }
    } catch {
      openInWeFlow()
    }
  } else if (state.config.autoCopyDraftAfterDraft) {
    await copyText(text, '内容已复制。请人工切到对应会话后发送。')
  }
}

function startManualSendWatch(draftText) {
  stopManualSendWatch()
  if (!state.selected || state.config?.autoAdvanceAfterManualSend !== true) return
  const currentSessionId = state.selected.id
  const watch = {
    sessionId: currentSessionId,
    draftText: String(draftText || '').trim(),
    startedAt: Date.now(),
    timeoutMs: Number(state.config.manualSendWatchTimeoutMs ?? 120000),
    pollMs: Number(state.config.manualSendPollMs ?? 3000),
    timer: null,
    stopped: false
  }
  state.manualSendWatch = watch
  setStatus('已开始监控手动发送；发送后会自动回到助手并切下一个联系人。', 'ok')
  watch.timer = window.setTimeout(() => pollManualSend(watch), watch.pollMs)
}

function stopManualSendWatch() {
  if (state.manualSendWatch?.timer) window.clearTimeout(state.manualSendWatch.timer)
  if (state.manualSendWatch) state.manualSendWatch.stopped = true
  state.manualSendWatch = null
}

async function pollManualSend(watch) {
  if (watch.stopped || state.manualSendWatch !== watch) return
  if (Date.now() - watch.startedAt > watch.timeoutMs) {
    stopManualSendWatch()
    setStatus('等待手动发送超时，已停止自动切换。', 'error')
    return
  }

  try {
    const limit = Math.max(10, Number(elements.limitInput.value || 80))
    const data = await requestJson(`/api/messages?talker=${encodeURIComponent(watch.sessionId)}&limit=${encodeURIComponent(limit)}`)
    const messages = Array.isArray(data.messages) ? data.messages : []
    if (hasManualSentDraft(messages, watch.draftText)) {
      stopManualSendWatch()
      setStatus('检测到已发送，准备切回助手并处理下一个联系人。', 'ok')
      await delay(Number(state.config?.advanceDelayAfterSendMs ?? 800))
      await requestJson('/api/activate-assistant', { method: 'POST' }).catch(() => ({}))
      await advanceToNextSession()
      return
    }
  } catch (error) {
    setStatus(`监控发送状态失败：${error.message}`, 'error')
  }

  if (state.manualSendWatch === watch && !watch.stopped) {
    watch.timer = window.setTimeout(() => pollManualSend(watch), watch.pollMs)
  }
}

function hasManualSentDraft(messages, draftText) {
  const normalizedDraft = normalizeComparableText(draftText)
  if (!normalizedDraft) return false
  return messages.some((message) => {
    if (message.isSend !== 1) return false
    const content = normalizeComparableText(message.content || message.parsedContent || message.rawContent || '')
    return content === normalizedDraft || (normalizedDraft.length >= 12 && content.includes(normalizedDraft))
  })
}

async function advanceToNextSession() {
  if (!state.selected) return
  const currentIndex = state.sessions.findIndex((session) => session.id === state.selected.id)
  const nextSession = state.sessions[currentIndex + 1]
  if (!nextSession) {
    setStatus('当前列表已处理到最后一个联系人。', 'ok')
    return
  }
  selectSession(nextSession)
  await loadMessages({ autoAnalyze: state.config?.autoAnalyzeAfterAdvance !== false })
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function delay(ms) {
  return new Promise((resolvePromise) => window.setTimeout(resolvePromise, Math.max(0, ms)))
}

function openInWeFlow() {
  if (!state.selected || !state.config?.weflowBaseUrl) return
  const url = new URL('/chat', state.config.weflowBaseUrl)
  url.searchParams.set('sessionId', state.selected.id)
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) throw new Error(data.error || response.statusText)
  return data
}

async function requestJsonWithTimeout(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(new Error('AI 请求超时')), Math.max(1000, timeoutMs))
  try {
    return await requestJson(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`AI 请求超时（${timeoutMs}ms）`)
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function matchesShortcut(event, shortcut) {
  const parts = String(shortcut || '').split('+').map((part) => part.trim().toLowerCase()).filter(Boolean)
  if (!parts.length) return false
  const key = parts.find((part) => !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd', 'command'].includes(part))
  const wantsCtrl = parts.includes('ctrl') || parts.includes('control')
  const wantsAlt = parts.includes('alt')
  const wantsShift = parts.includes('shift')
  const wantsMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command')
  return Boolean(key) &&
    event.key.toLowerCase() === key &&
    event.ctrlKey === wantsCtrl &&
    event.altKey === wantsAlt &&
    event.shiftKey === wantsShift &&
    event.metaKey === wantsMeta
}

async function copyText(text, message) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  setStatus(message, 'ok')
}


function setStatus(text, type = '') {
  elements.status.textContent = text
  elements.status.className = `status ${type}`.trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatTime(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '未知时间'
  const milliseconds = number > 1000000000000 ? number : number * 1000
  return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
}
