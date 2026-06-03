const state = {
  config: null,
  selected: null,
  sessions: [],
  messages: [],
  loadingMessages: false,
  manualSendWatch: null,
  sourceFingerprint: '',
  sourcePollTimer: null,
  sourcePollInFlight: false,
  sourceDebugLines: [],
  sourceDebugVisible: false,
  autoTaskTimer: null,
  autoTaskRunning: false,
  autoTaskPaused: false,
  autoTaskRunId: 0,
  taskSnapshot: [],
  taskCursor: 0,
  currentContactWatchdogTimer: null,
  automationStopped: false,
  handledPeerMessageFingerprints: {}
}

const selectedSessionStorageKey = 'weflowAssistant.selectedSession'
const handledPeerMessageStorageKey = 'weflowAssistant.handledPeerMessageFingerprints'

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
  startTasksBtn: document.querySelector('#startTasksBtn'),
  pauseTasksBtn: document.querySelector('#pauseTasksBtn'),
  stopTasksBtn: document.querySelector('#stopTasksBtn'),
  closeConfigBtn: document.querySelector('#closeConfigBtn'),
  configBackdrop: document.querySelector('#configBackdrop'),
  configModal: document.querySelector('#configModal'),
  healthBtn: document.querySelector('#healthBtn'),
  keywordInput: document.querySelector('#keywordInput'),
  searchBtn: document.querySelector('#searchBtn'),
  toggleDebugBtn: document.querySelector('#toggleDebugBtn'),
  debugWeixinSearchBtn: document.querySelector('#debugWeixinSearchBtn'),
  status: document.querySelector('#status'),
  sourceDebug: document.querySelector('#sourceDebug'),
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
  autoTaskEnabledInput: document.querySelector('#autoTaskEnabledInput'),
  autoTaskIntervalMsInput: document.querySelector('#autoTaskIntervalMsInput'),
  aiAutoSkipTimeoutMsInput: document.querySelector('#aiAutoSkipTimeoutMsInput'),
  advanceNextShortcutInput: document.querySelector('#advanceNextShortcutInput'),
  pauseTaskShortcutInput: document.querySelector('#pauseTaskShortcutInput'),
  manualSendWatchTimeoutMsInput: document.querySelector('#manualSendWatchTimeoutMsInput'),
  manualSendPollMsInput: document.querySelector('#manualSendPollMsInput'),
  advanceDelayAfterSendMsInput: document.querySelector('#advanceDelayAfterSendMsInput'),
  activateAssistantAfterSendInput: document.querySelector('#activateAssistantAfterSendInput'),
  autoSendAfterDraftInputInput: document.querySelector('#autoSendAfterDraftInputInput'),
  weixinSendModeInput: document.querySelector('#weixinSendModeInput'),
  weixinSearchModeInput: document.querySelector('#weixinSearchModeInput'),
  clearInputBeforePasteInput: document.querySelector('#clearInputBeforePasteInput'),
  weixinWindowTitleKeywordInput: document.querySelector('#weixinWindowTitleKeywordInput'),
  weixinAccountUiKeywordInput: document.querySelector('#weixinAccountUiKeywordInput'),
  weixinTargetPidInput: document.querySelector('#weixinTargetPidInput'),
  weixinSearchBoxRatioInput: document.querySelector('#weixinSearchBoxRatioInput'),
  weixinSearchOcrEnabledInput: document.querySelector('#weixinSearchOcrEnabledInput'),
  ocrProviderInput: document.querySelector('#ocrProviderInput'),
  ocrPythonPathInput: document.querySelector('#ocrPythonPathInput'),
  refreshWeixinWindowsBtn: document.querySelector('#refreshWeixinWindowsBtn'),
  calibrateWeixinTargetWindowBtn: document.querySelector('#calibrateWeixinTargetWindowBtn'),
  calibrateWeixinSearchBoxBtn: document.querySelector('#calibrateWeixinSearchBoxBtn'),
  weixinWindowHint: document.querySelector('#weixinWindowHint'),
  cleanupWeixinPopupsAfterTaskInput: document.querySelector('#cleanupWeixinPopupsAfterTaskInput'),
  resetReplyPromptBtn: document.querySelector('#resetReplyPromptBtn'),
  saveConfigBtn: document.querySelector('#saveConfigBtn'),
  toggleTokenBtn: document.querySelector('#toggleTokenBtn'),
  toggleAiKeyBtn: document.querySelector('#toggleAiKeyBtn'),
  sessions: document.querySelector('#sessions'),
  sessionTitle: document.querySelector('#sessionTitle'),
  sessionMeta: document.querySelector('#sessionMeta'),
  openWeFlowBtn: document.querySelector('#openWeFlowBtn'),
  advanceNextBtn: document.querySelector('#advanceNextBtn'),
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
window.weflowAssistantTogglePauseTask = () => {
  togglePauseTaskRun()
}

window.weflowAssistantConfigSaved = () => true

async function init() {
  state.handledPeerMessageFingerprints = readHandledPeerMessageFingerprints()
  bindEvents()
  await loadConfig()
  await checkHealth()
  await searchSessions()
  startWeFlowSourcePolling()
  restartAutoTaskScheduler()
}

function bindEvents() {
  elements.configBtn.addEventListener('click', openConfigModal)
  elements.startTasksBtn.addEventListener('click', () => startTaskRun({ source: 'manual' }))
  elements.pauseTasksBtn.addEventListener('click', togglePauseTaskRun)
  elements.stopTasksBtn.addEventListener('click', stopAllAutomation)
  elements.closeConfigBtn.addEventListener('click', closeConfigModal)
  elements.configBackdrop.addEventListener('click', closeConfigModal)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeConfigModal()
    if (matchesShortcut(event, state.config?.advanceNextShortcut || 'Ctrl+Alt+N')) {
      event.preventDefault()
      stopManualSendWatch()
      advanceToNextSession()
      return
    }
    if (matchesShortcut(event, state.config?.pauseTaskShortcut || 'Ctrl+Alt+P')) {
      event.preventDefault()
      togglePauseTaskRun()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopWeFlowSourcePolling()
      return
    }
    if (state.autoTaskRunning) return
    restartWeFlowSourcePolling()
    pollWeFlowSource().catch(() => {})
  })

  elements.healthBtn.addEventListener('click', checkHealth)
  elements.searchBtn.addEventListener('click', searchSessions)
  elements.toggleDebugBtn.addEventListener('click', toggleSourceDebug)
  elements.debugWeixinSearchBtn.addEventListener('click', debugWeixinSearch)
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
  elements.refreshWeixinWindowsBtn.addEventListener('click', refreshWeixinWindows)
  elements.calibrateWeixinTargetWindowBtn.addEventListener('click', calibrateWeixinTargetWindow)
  elements.calibrateWeixinSearchBoxBtn.addEventListener('click', calibrateWeixinSearchBox)
  elements.loadMessagesBtn.addEventListener('click', () => loadMessages({ autoAnalyze: false }))
  elements.analyzeBtn.addEventListener('click', analyzeSession)
  elements.draftBtn.addEventListener('click', draftReply)
  elements.copyDraftBtn.addEventListener('click', () => copyText(elements.draftOutput.value, '草稿已复制，请人工确认后发送。'))
  elements.copyTalkerBtn.addEventListener('click', () => {
    if (state.selected?.id) copyText(state.selected.id, '会话 ID 已复制。')
  })
  elements.advanceNextBtn.addEventListener('click', () => {
    stopManualSendWatch()
    advanceToNextSession()
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
  elements.autoTaskEnabledInput.checked = state.config?.autoTaskEnabled === true
  elements.autoTaskIntervalMsInput.value = String(Math.round(Number(state.config?.autoTaskIntervalMs ?? 300000) / 1000))
  elements.aiAutoSkipTimeoutMsInput.value = String(state.config?.aiAutoSkipTimeoutMs ?? 45000)
  elements.advanceNextShortcutInput.value = state.config?.advanceNextShortcut || 'Ctrl+Alt+N'
  elements.pauseTaskShortcutInput.value = state.config?.pauseTaskShortcut || 'Ctrl+Alt+P'
  elements.manualSendWatchTimeoutMsInput.value = String(state.config?.manualSendWatchTimeoutMs ?? 120000)
  elements.manualSendPollMsInput.value = String(state.config?.manualSendPollMs ?? 3000)
  elements.advanceDelayAfterSendMsInput.value = String(state.config?.advanceDelayAfterSendMs ?? 800)
  elements.activateAssistantAfterSendInput.checked = state.config?.activateAssistantAfterSend !== false
  elements.autoSendAfterDraftInputInput.checked = state.config?.autoSendAfterDraftInput === true
  elements.weixinSendModeInput.value = normalizeWeixinSendMode(state.config?.weixinSendMode)
  elements.weixinSearchModeInput.value = state.config?.weixinSearchMode || 'name'
  elements.clearInputBeforePasteInput.checked = state.config?.clearInputBeforePaste !== false
  elements.weixinWindowTitleKeywordInput.value = state.config?.weixinWindowTitleKeyword || ''
  elements.weixinAccountUiKeywordInput.value = state.config?.weixinAccountUiKeyword || ''
  elements.weixinTargetPidInput.value = String(Number(state.config?.weixinTargetPid || 0))
  elements.weixinSearchBoxRatioInput.value = `${Number(state.config?.weixinSearchBoxRatioX ?? 0.19)},${Number(state.config?.weixinSearchBoxRatioY ?? 0.071)}`
  elements.weixinSearchOcrEnabledInput.checked = state.config?.weixinSearchOcrEnabled === true
  elements.ocrProviderInput.value = state.config?.ocrProvider || 'tesseract'
  elements.ocrPythonPathInput.value = state.config?.ocrPythonPath || 'python'
  elements.cleanupWeixinPopupsAfterTaskInput.checked = state.config?.cleanupWeixinPopupsAfterTask !== false
}

function openConfigModal() {
  elements.configModal.classList.remove('hidden')
  elements.configModal.setAttribute('aria-hidden', 'false')
}

function closeConfigModal() {
  elements.configModal.classList.add('hidden')
  elements.configModal.setAttribute('aria-hidden', 'true')
}

async function refreshWeixinWindows() {
  elements.weixinWindowHint.textContent = '正在读取已登录微信窗口...'
  try {
    const data = await requestJson('/api/weixin-windows')
    const windows = Array.isArray(data.windows) ? data.windows : []
    if (!windows.length) {
      elements.weixinWindowHint.textContent = '未找到已登录微信主窗口。请先手动打开正确微信，不会自动启动新微信。'
      return
    }
    const titles = windows.map((item) => item.MainWindowTitle || item.mainWindowTitle || item.title || '').filter(Boolean)
    const summaries = windows.map((item) => {
      const id = item.Id || item.id || item.pid || '?'
      const title = item.MainWindowTitle || item.mainWindowTitle || item.title || '无标题'
      const preview = item.UiTextPreview || item.uiTextPreview || ''
      const locked = Number(state.config?.weixinTargetPid || 0) === Number(id) ? '（已锁定）' : ''
      return `PID ${id}${locked}：${title}${preview ? `｜${preview}` : ''}`
    })
    elements.weixinWindowHint.textContent = `已找到：${summaries.join('；')}`
    if (!elements.weixinWindowTitleKeywordInput.value.trim() && titles.length === 1) {
      elements.weixinWindowTitleKeywordInput.value = titles[0]
    }
  } catch (error) {
    elements.weixinWindowHint.textContent = `读取微信窗口失败：${error.message}`
  }
}

async function calibrateWeixinTargetWindow() {
  elements.weixinWindowHint.textContent = '请把鼠标移到要跑任务的小号微信窗口上，2 秒后自动锁定鼠标所在微信...'
  await new Promise((resolve) => setTimeout(resolve, 2000))
  try {
    const data = await requestJson('/api/calibrate-weixin-target-window', { method: 'POST' })
    if (!data.calibrated) {
      elements.weixinWindowHint.textContent = `锁定失败：${data.reason || '鼠标所在窗口不是微信'}`
      return
    }
    state.config = data.config
    elements.weixinTargetPidInput.value = String(data.targetPid || 0)
    elements.weixinWindowHint.textContent = `已锁定目标微信：PID ${data.targetPid}（${data.window?.title || '微信'}，鼠标 ${data.cursorX},${data.cursorY}）。之后任务只会操作这个微信。`
  } catch (error) {
    elements.weixinWindowHint.textContent = `锁定目标微信失败：${error.message}`
  }
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
      ensureWeFlowSourceFingerprint()
    } catch (error) {
      setStatus(`WeFlow API 不可用：${error.message}`, 'error')
  }
}

async function calibrateWeixinSearchBox() {
  elements.weixinWindowHint.textContent = '请把鼠标放在微信左上角搜索框中心，3 秒后自动读取位置...'
  await new Promise((resolve) => setTimeout(resolve, 3000))
  try {
    const data = await requestJson('/api/calibrate-weixin-search-box', { method: 'POST' })
    if (!data.calibrated) {
      elements.weixinWindowHint.textContent = `校准失败：${data.reason || '未知原因'}`
      return
    }
    state.config = data.config
    elements.weixinSearchBoxRatioInput.value = `${data.ratioX},${data.ratioY}`
    elements.weixinWindowHint.textContent = `已校准搜索框位置：${data.ratioX},${data.ratioY}（窗口 PID ${data.window?.pid || '?' }）`
  } catch (error) {
    elements.weixinWindowHint.textContent = `校准失败：${error.message}`
  }
}

function readWeixinSearchBoxRatio() {
  const [rawX, rawY] = elements.weixinSearchBoxRatioInput.value.split(',')
  const ratioX = Number(rawX)
  const ratioY = Number(rawY)
  if (!Number.isFinite(ratioX) || !Number.isFinite(ratioY)) {
    return {
      weixinSearchBoxRatioX: state.config?.weixinSearchBoxRatioX ?? 0.19,
      weixinSearchBoxRatioY: state.config?.weixinSearchBoxRatioY ?? 0.071
    }
  }
  return { weixinSearchBoxRatioX: ratioX, weixinSearchBoxRatioY: ratioY }
}

async function searchSessions({ silent = false, source = 'manual' } = {}) {
  const previousScrollTop = elements.sessions.scrollTop
  if (!silent) {
    setStatus('正在搜索会话...')
    elements.sessions.innerHTML = ''
  }
  try {
    const keyword = elements.keywordInput.value.trim()
    const data = await requestJson(`/api/sessions?limit=100${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`)
    const sessions = normalizeSessions(data)
    const rawCount = getRawSessionCount(data)
    const filteredCount = Math.max(0, rawCount - sessions.length)
    state.sessions = sessions
    if (!keyword) state.sourceFingerprint = buildSessionFingerprint(sessions)
    appendSourceDebugLog(`${source === 'background' ? '后台刷新' : '手动加载'}${keyword ? `（关键词：${keyword}）` : ''}`, sessions)
    renderSessions(sessions)
    if (silent) {
      elements.sessions.scrollTop = previousScrollTop
      if (state.selected) {
        const updatedSelected = sessions.find((item) => item.id === state.selected.id)
        if (updatedSelected) {
          state.selected = { ...state.selected, ...updatedSelected }
          for (const node of elements.sessions.querySelectorAll('.session-item')) {
            node.classList.toggle('active', node.dataset.id === state.selected.id)
          }
        }
      } else if (!keyword) {
        await restoreSelectedSession()
      }
      return
    }
    if (!keyword) await restoreSelectedSession()
    setStatus(`${keyword ? '筛选到' : '按最近对话整理出'} ${sessions.length} 个会话${filteredCount ? `，已过滤 ${filteredCount} 个群聊/渠道/服务号` : ''}。`, 'ok')
  } catch (error) {
    if (!silent) setStatus(`搜索失败：${error.message}`, 'error')
  }
}

async function debugWeixinSearch() {
  const keyword = elements.keywordInput.value.trim() || state.selected?.name || state.selected?.id || ''
  if (!keyword) {
    setStatus('请先在搜索框输入要诊断的微信昵称/ID。', 'error')
    return
  }
  setStatus(`正在诊断微信搜索：${keyword}...`, 'ok')
  try {
    const data = await requestJson('/api/debug-weixin-search', {
      method: 'POST',
      body: JSON.stringify({ keyword })
    })
    const lines = Array.isArray(data.textLines) ? data.textLines : []
    const controls = Array.isArray(data.controls) ? data.controls : []
    state.sourceDebugVisible = true
    state.sourceDebugLines = [
      `[微信搜索诊断] ${keyword}
窗口: ${data.windowTitle || data.reason || '未知'}
聚焦: ${data.searchFocusMethod || '未知'}
OCR区域: ${data.searchOcrCrop || '默认'}
OCR像素: ${data.searchOcrPixelCrop || '未知'}
OCR截图: ${data.searchOcrImagePath || '未保存'}
OCR状态: ${data.searchOcrSkipped ? '已关闭' : '已启用'}
OCR引擎: ${data.searchOcrProvider || state.config?.ocrProvider || '未知'}
OCR错误: ${data.searchOcrError || '无'}
OCR:
${data.searchOcrText || '无'}

文本:
${lines.slice(0, 80).join('\n') || '无'}

控件:
${controls.slice(0, 80).map((item) => `${item.controlType} | ${item.name || '(空)'} | ${item.x},${item.y},${item.width},${item.height}`).join('\n') || '无'}`
    ]
    renderSourceDebug()
    setStatus('微信搜索诊断完成，已展开调试结果。', 'ok')
  } catch (error) {
    setStatus(`微信搜索诊断失败：${error.message}`, 'error')
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
        autoTaskEnabled: elements.autoTaskEnabledInput.checked,
        autoTaskIntervalMs: Number(elements.autoTaskIntervalMsInput.value || 300) * 1000,
        aiAutoSkipTimeoutMs: Number(elements.aiAutoSkipTimeoutMsInput.value || 45000),
        advanceNextShortcut: elements.advanceNextShortcutInput.value.trim() || 'Ctrl+Alt+N',
        pauseTaskShortcut: elements.pauseTaskShortcutInput.value.trim() || 'Ctrl+Alt+P',
        manualSendWatchTimeoutMs: Number(elements.manualSendWatchTimeoutMsInput.value || 120000),
        manualSendPollMs: Number(elements.manualSendPollMsInput.value || 3000),
        advanceDelayAfterSendMs: Number(elements.advanceDelayAfterSendMsInput.value || 800),
        activateAssistantAfterSend: elements.activateAssistantAfterSendInput.checked,
        autoSendAfterDraftInput: elements.autoSendAfterDraftInputInput.checked,
        weixinSendMode: elements.weixinSendModeInput.value,
        weixinSearchMode: elements.weixinSearchModeInput.value,
        clearInputBeforePaste: elements.clearInputBeforePasteInput.checked,
        weixinWindowTitleKeyword: elements.weixinWindowTitleKeywordInput.value.trim(),
        weixinAccountUiKeyword: elements.weixinAccountUiKeywordInput.value.trim(),
        weixinTargetPid: Number(elements.weixinTargetPidInput.value || 0),
        ...readWeixinSearchBoxRatio(),
        weixinSearchOcrEnabled: elements.weixinSearchOcrEnabledInput.checked,
        ocrProvider: elements.ocrProviderInput.value,
        ocrPythonPath: elements.ocrPythonPathInput.value.trim() || 'python',
        cleanupWeixinPopupsAfterTask: elements.cleanupWeixinPopupsAfterTaskInput.checked
      })
    })
    state.config = data.config
    notifyDesktopConfigChanged()
    restartAutoTaskScheduler()
    setStatus('配置已保存。', 'ok')
    closeConfigModal()
    await checkHealth()
    restartWeFlowSourcePolling()
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
  const normalized = normalizeScenarioConfig(scenarios, { keepBlank: true })
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

function normalizeScenarioConfig(scenarios, options = {}) {
  const keepBlank = options.keepBlank === true
  const list = Array.isArray(scenarios) ? scenarios : defaultScenarios
  const normalized = list.map((scenario) => ({
    type: String(scenario?.type || '').trim(),
    description: String(scenario?.description || '').trim(),
    prompt: String(scenario?.prompt || '').trim()
  })).filter((scenario) => keepBlank || scenario.type || scenario.description || scenario.prompt)
  return normalized.length ? normalized : defaultScenarios
}

function normalizeSessions(data) {
  const list = data.sessions || data.data || data.items || []
  const sessions = Array.isArray(list) ? list.map((item, index) => {
    const id = item.sessionId || item.username || item.talker || item.id || item.userName || ''
    const name = item.displayName || item.name || item.nickName || item.remark || item.nickname || id
    const preview = item.lastMessage || item.lastContent || item.content || item.preview || ''
    const rawTime = item.lastTimestamp || item.lastTime || item.updateTime || item.createTime || item.timestamp || item.msgTime || item.lastMsgTime || ''
    const time = normalizeSessionTime(rawTime)
    const sessionType = String(item.sessionType || '').trim().toLowerCase()
    return {
      raw: item,
      id,
      name,
      preview,
      time,
      hasRecentActivity: Boolean(preview || time > 0),
      unreadCount: Number(item.unreadCount || 0),
      sessionType,
      originalIndex: index
    }
  }).filter((item) => item.id && !isFilteredSessionType(item)) : []

  return sessions.sort((left, right) => {
    if (left.hasRecentActivity !== right.hasRecentActivity) return left.hasRecentActivity ? -1 : 1
    if (left.time !== right.time) return right.time - left.time
    return left.originalIndex - right.originalIndex
  })
}

function isFilteredSessionType(session) {
  const sessionType = String(session?.sessionType || '').trim().toLowerCase()
  const id = String(session?.id || '').trim().toLowerCase()
  return sessionType === 'channel' ||
    sessionType === 'group' ||
    sessionType === 'chatroom' ||
    id.endsWith('@chatroom')
}

function getRawSessionCount(data) {
  const list = data.sessions || data.data || data.items || []
  return Array.isArray(list) ? list.length : 0
}

function renderSessions(sessions) {
  if (!sessions.length) {
    elements.sessions.innerHTML = '<div class="status">没有匹配会话。</div>'
    return
  }
  elements.sessions.innerHTML = sessions.map((session) => `
    <div class="session-item${state.selected?.id === session.id ? ' active' : ''}" data-id="${escapeHtml(session.id)}">
      <div class="session-name">${escapeHtml(session.name)}</div>
      <div class="session-id">${escapeHtml(session.id)}</div>
      <div class="session-id">${escapeHtml(session.time ? formatRelativeTime(session.time) : '无最近时间')}${session.unreadCount > 0 ? ` · 未读 ${session.unreadCount}` : ''}${session.sessionType ? ` · ${escapeHtml(session.sessionType)}` : ''}</div>
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
  startContactWatchdog(session)
  state.selected = session
  persistSelectedSession(session)
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
  elements.advanceNextBtn.disabled = false
  elements.copyTalkerBtn.disabled = false
  elements.loadMessagesBtn.disabled = false
  elements.analyzeBtn.disabled = false
  elements.draftBtn.disabled = false
}

async function restoreSelectedSession({ silent = true } = {}) {
  if (state.selected || !state.sessions.length) return
  const stored = readStoredSelectedSession()
  if (!stored?.id) {
    if (!silent) setStatus('未选择会话，请先点击左侧会话。', 'error')
    return
  }
  const session = state.sessions.find((item) => item.id === stored.id)
  if (!session) {
    if (!silent) setStatus(`上次会话 ${stored.name || stored.id} 不在当前列表，请手动选择。`, 'error')
    return
  }
  selectSession(session)
  await loadMessages({ autoAnalyze: false })
  setStatus(`已恢复上次会话：${session.name}`, 'ok')
}

function persistSelectedSession(session) {
  try {
    localStorage.setItem(selectedSessionStorageKey, JSON.stringify({
      id: session.id,
      name: session.name,
      savedAt: Date.now()
    }))
  } catch {
    // localStorage may be unavailable in hardened browser contexts
  }
}

function readStoredSelectedSession() {
  try {
    return JSON.parse(localStorage.getItem(selectedSessionStorageKey) || 'null')
  } catch {
    return null
  }
}

function clearStoredSelectedSession() {
  try {
    localStorage.removeItem(selectedSessionStorageKey)
  } catch {
    // ignore storage failures
  }
}

function resetSessionView(message = 'WeFlow 数据源已变化，正在重载最近会话...') {
  stopManualSendWatch()
  state.sourceDebugLines = [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`, ...state.sourceDebugLines].slice(0, 8)
  renderSourceDebug()
  state.selected = null
  state.sessions = []
  state.messages = []
  state.loadingMessages = false
  elements.sessions.innerHTML = ''
  elements.sessionTitle.textContent = '未选择会话'
  elements.sessionMeta.textContent = '点击左侧会话后会自动读取最近消息。'
  elements.messages.innerHTML = '<div class="status">请等待会话列表重载。</div>'
  elements.analysisScenario.classList.add('hidden')
  elements.analysisScenario.textContent = ''
  elements.analysis.textContent = '分析结果会显示在这里。'
  elements.draftOutput.value = ''
  elements.openWeFlowBtn.disabled = true
  elements.advanceNextBtn.disabled = true
  elements.copyTalkerBtn.disabled = true
  elements.loadMessagesBtn.disabled = true
  elements.analyzeBtn.disabled = true
  elements.draftBtn.disabled = true
  setStatus(message, 'ok')
}

async function loadMessages({ autoAnalyze = false } = {}) {
  if (!state.selected) return
  if (state.loadingMessages) {
    if (autoAnalyze) {
      await delay(500)
      return loadMessages({ autoAnalyze })
    }
    return
  }
  state.loadingMessages = true
  setStatus('正在读取消息...')
  try {
    const selectedId = state.selected.id
    const limit = Number(elements.limitInput.value || 80)
    const messages = await fetchMessagesWithRetry(selectedId, limit, autoAnalyze)
    if (!state.selected || state.selected.id !== selectedId) return
    state.messages = messages
    renderMessages(state.messages)
    setStatus(`已读取 ${state.messages.length} 条消息。`, 'ok')
    if (autoAnalyze) {
      await analyzeSession()
    }
  } catch (error) {
    setStatus(`读取失败：${error.message}`, 'error')
  } finally {
    state.loadingMessages = false
  }
}

async function fetchMessagesWithRetry(talkerId, limit, shouldRetryEmpty) {
  const attempts = shouldRetryEmpty ? 2 : 1
  for (let index = 0; index < attempts; index += 1) {
    const data = await requestJsonWithTimeout(`/api/messages?talker=${encodeURIComponent(talkerId)}&limit=${encodeURIComponent(limit)}&_=${Date.now()}`, {}, 5000, '读取消息')
    const messages = Array.isArray(data.messages) ? data.messages : []
    if (messages.length || index === attempts - 1) return messages
    setStatus(`暂未读到消息，等待刷新后重试 ${index + 1}/${attempts - 1}...`, 'ok')
    await delay(600)
  }
  return []
}

function shouldSkipEmptySession() {
  return state.autoTaskRunning || state.config?.autoSkipEmptySession !== false
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
  const selectedId = state.selected.id
  if (!state.loadingMessages) {
    const limit = Number(elements.limitInput.value || 80)
    state.messages = await fetchMessagesWithRetry(selectedId, limit, true)
    if (!state.selected || state.selected.id !== selectedId) return
    renderMessages(state.messages)
  }
  if (shouldWaitForPeerReply(state.messages)) {
    const lastMessage = getLatestMessage(state.messages)
    setStatus(`最后一条消息是我发送的（${formatTime(lastMessage.createTime || lastMessage.timestamp || lastMessage.time)}），当前联系人暂不生成回复。`, 'ok')
    elements.analysis.textContent = '最后一条消息是我发送的，暂不生成回复。'
    return
  }
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
    if (error.data?.waitForPeerReply) {
      elements.analysis.textContent = '最后一条消息是我发送的，暂不生成回复。'
      setStatus('最后一条消息是我发送的，当前联系人暂不生成回复。', 'ok')
      return
    }
    elements.analysis.textContent = `分析失败：${error.message}`
    setStatus(`分析失败：${error.message}`, 'error')
    if (error.name === 'AbortError' || error.message.includes('超时')) {
      setStatus('AI 长时间无响应，请稍后重试。', 'error')
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
  if (shouldWaitForPeerReply(state.messages)) {
    const lastMessage = getLatestMessage(state.messages)
    setStatus(`最后一条消息是我发送的（${formatTime(lastMessage.createTime || lastMessage.timestamp || lastMessage.time)}），等待对方回复后再生成。`, 'ok')
    elements.draftOutput.value = '最后一条消息是我发送的，暂不生成回复。'
    return
  }
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
    if (error.data?.waitForPeerReply) {
      elements.draftOutput.value = '最后一条消息是我发送的，暂不生成回复。'
      setStatus(error.message, 'ok')
      return
    }
    elements.draftOutput.value = `生成失败：${error.message}`
    setStatus(`草稿失败：${error.message}`, 'error')
  }
}

async function processCurrentTaskSession() {
  if (!state.autoTaskRunning || state.automationStopped) return
  const session = state.taskSnapshot[state.taskCursor]
  if (!session) {
    await finishTaskRunAtStart()
    return
  }

  selectSession(session)
  setStatus(`任务处理中 ${state.taskCursor + 1}/${state.taskSnapshot.length}：${session.name}`, 'ok')
  try {
    const limit = Number(elements.limitInput.value || 80)
    state.messages = await fetchMessagesWithRetry(session.id, limit, true)
    if (!state.autoTaskRunning || state.automationStopped || state.selected?.id !== session.id) return
    renderMessages(state.messages)

    const skipReason = getTaskSkipReason(state.messages)
    if (skipReason) {
      setStatus(`${skipReason}，任务继续下一个。`, 'ok')
      await delay(800)
      await advanceTaskCursor()
      return
    }

    elements.analysis.textContent = '正在分析...'
    const data = await requestJsonWithTimeout('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        talker: session.id,
        limit,
        purpose: elements.purposeInput.value
      })
    }, Number(state.config?.aiAutoSkipTimeoutMs ?? 45000))
    if (!state.autoTaskRunning || state.automationStopped || state.selected?.id !== session.id) return
    elements.analysis.textContent = data.analysis || '无分析结果。'
    renderAnalysisScenario(data.scenario)
    setStatus(`AI 分析完成，准备发送给：${session.name}`, 'ok')
    await handlePostWechatActions(elements.analysis.textContent, 'AI 回复已准备到微信输入框。')
  } catch (error) {
    const message = error.data?.waitForPeerReply ? '最后一条消息是我发送的' : `处理失败：${error.message}`
    setStatus(`${message}，任务继续下一个。`, 'error')
    await delay(800)
    await advanceTaskCursor()
  }
}

function getTaskSkipReason(messages) {
  if (!messages.length && shouldSkipEmptySession()) return '没有聊天记录'
  if (shouldWaitForPeerReply(messages)) return '最后一条消息是我发送的'
  if (shouldSkipHandledPeerMessage(messages)) return '对方没有新消息'
  return ''
}

async function handlePostWechatActions(text, fallbackMessage) {
  if (!state.selected) await restoreSelectedSession({ silent: false })
  if (!state.selected || !state.config || !text) return
  const taskMode = state.autoTaskRunning
  if (state.config.autoOpenChatAfterDraft) {
    try {
      const searchText = state.selected.name || state.selected.id
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
          sendMode: normalizeWeixinSendMode(state.config.weixinSendMode),
          clearInputBeforePaste: state.config.clearInputBeforePaste !== false
        })
      })
      if (!result.prepared) {
        if (taskMode) {
          setStatus(`${formatWeixinPrepareError(result)}，任务继续下一个。`, 'error')
          await delay(800)
          await continueTaskAfterFailure(taskMode)
        } else {
          setStatus(formatWeixinPrepareError(result), 'error')
        }
      } else {
        await handlePreparedWeixinDraft(text, result, fallbackMessage, taskMode)
      }
    } catch (error) {
      if (taskMode) {
        setStatus(`微信搜索/填入失败：${error.message}，任务继续下一个。`, 'error')
        await delay(800)
        await continueTaskAfterFailure(taskMode)
      } else {
        setStatus(`微信搜索/填入失败：${error.message}`, 'error')
      }
    }
  } else if (state.config.autoCopyDraftAfterDraft) {
    await copyText(text, '内容已复制。请人工切到对应会话后发送。')
  }
}

async function handlePreparedWeixinDraft(text, result, fallbackMessage, taskMode = false) {
  if (result.autoSent) {
    const sent = await waitForSentDraft(state.selected.id, text)
    if (!sent) {
      if (taskMode) {
        setStatus('未确认微信已发送成功，当前联系人跳过，任务继续下一个。', 'error')
        await delay(800)
        await continueTaskAfterFailure(taskMode)
      } else {
        setStatus('未确认微信已发送成功。请检查微信输入框/发送按钮状态。', 'error')
      }
      return
    }
    markLatestPeerMessageHandled(state.selected?.id, sent.messages)
    setStatus('已确认微信发送成功，准备切回助手并处理下一个联系人。', 'ok')
    await delay(Number(state.config?.advanceDelayAfterSendMs ?? 800))
    if (state.automationStopped) return
    if (state.config?.activateAssistantAfterSend !== false) {
      await requestJson('/api/activate-assistant', { method: 'POST' }).catch(() => ({}))
    }
    if (taskMode) {
      await advanceTaskCursor()
    } else {
      await advanceToNextSession()
    }
    return
  }

  setStatus(fallbackMessage, 'ok')
  startManualSendWatch(text)
}

async function continueTaskAfterFailure(taskMode) {
  if (!taskMode || state.automationStopped) return
  if (state.taskSnapshot.length && !state.autoTaskPaused) {
    state.autoTaskRunning = true
    await advanceTaskCursor()
    return
  }
  await advanceToNextSession({ autoAnalyze: true, reason: 'task-failure' })
}

function normalizeWeixinSendMode(value) {
  if (value === 'click') return 'button'
  return ['enter', 'button', 'mouse'].includes(value) ? value : 'enter'
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

async function waitForSentDraft(sessionId, draftText) {
  const timeoutMs = Number(state.config?.manualSendWatchTimeoutMs ?? 120000)
  const pollMs = Math.max(800, Number(state.config?.manualSendPollMs ?? 3000))
  const startedAt = Date.now()
  setStatus('正在监控微信发送结果...', 'ok')
  while (Date.now() - startedAt <= timeoutMs) {
    if (state.automationStopped) return null
    const limit = Math.max(10, Number(elements.limitInput.value || 80))
    const data = await requestJsonWithTimeout(`/api/messages?talker=${encodeURIComponent(sessionId)}&limit=${encodeURIComponent(limit)}&_=${Date.now()}`, {}, 5000, '发送确认')
    const messages = Array.isArray(data.messages) ? data.messages : []
    if (hasManualSentDraft(messages, draftText)) return { messages }
    await delay(pollMs)
  }
  return null
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
      markLatestPeerMessageHandled(watch.sessionId, messages)
      setStatus('检测到已发送，准备切回助手并处理下一个联系人。', 'ok')
      await delay(Number(state.config?.advanceDelayAfterSendMs ?? 800))
      await requestJson('/api/activate-assistant', { method: 'POST' }).catch(() => ({}))
      await advanceToNextSession({ autoAnalyze: state.autoTaskRunning, reason: state.autoTaskRunning ? 'task-manual-sent' : 'manual-sent' })
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

async function advanceToNextSession({ autoAnalyze, reason = 'manual' } = {}) {
  if (state.automationStopped) return
  if (!state.selected) return
  if (state.autoTaskRunning) {
    await advanceTaskCursor()
    return
  }
  const currentIndex = state.sessions.findIndex((session) => session.id === state.selected.id)
  if (currentIndex < 0) {
    setStatus('当前联系人不在左侧列表中，请重新加载会话后再切换。', 'error')
    return
  }
  const nextSession = state.sessions[currentIndex + 1]
  if (!nextSession) {
    if (state.autoTaskRunning && state.sessions.length) {
      selectSession(state.sessions[0])
      await loadMessages({ autoAnalyze: false })
      setStatus('本轮定时任务已处理到最后，已回到第一个联系人，等待下次定时执行。', 'ok')
      finishAutoTaskRun()
      return
    }
    setStatus('当前列表已处理到最后一个联系人。', 'ok')
    return
  }
  selectSession(nextSession)
  const shouldAutoAnalyze = autoAnalyze ?? ((reason === 'manual' || reason === 'task') && state.config?.autoAnalyzeAfterAdvance !== false)
  setStatus(`已切到下一个联系人：${nextSession.name}${shouldAutoAnalyze ? '，准备自动分析。' : '，已停止自动发送链路。'}`, 'ok')
  await loadMessages({ autoAnalyze: shouldAutoAnalyze })
}

async function advanceTaskCursor() {
  state.taskCursor += 1
  await processTaskCursor()
}

async function finishTaskRunAtStart() {
  stopContactWatchdog()
  state.autoTaskRunning = false
  await cleanupWeixinPopupsIfEnabled()
  if (state.taskSnapshot.length) {
    selectSession(state.taskSnapshot[0])
    await loadMessages({ autoAnalyze: false })
  }
  setStatus('本轮定时任务已扫完整个列表，已回到第一个联系人，等待下次定时执行。', 'ok')
  finishAutoTaskRun()
}

function finishAutoTaskRun() {
  stopContactWatchdog()
  state.autoTaskRunning = false
  state.autoTaskPaused = false
  state.taskSnapshot = []
  state.taskCursor = 0
  restartWeFlowSourcePolling()
  scheduleNextAutoTaskRun()
}

async function runAutoTaskNow() {
  await startTaskRun({ source: 'timer' })
}

async function startTaskRun({ source = 'manual' } = {}) {
  state.automationStopped = false
  if (state.autoTaskPaused && state.taskSnapshot.length) {
    state.autoTaskRunning = true
    state.autoTaskPaused = false
    stopWeFlowSourcePolling()
    setStatus(`继续任务：从第 ${state.taskCursor + 1}/${state.taskSnapshot.length} 个联系人恢复。`, 'ok')
    await processTaskCursor()
    return
  }
  if (state.autoTaskRunning) return
  if (source === 'timer' && !state.config?.autoTaskEnabled) return
  if (source === 'timer' || !state.sessions.length) {
    await searchSessions()
  }
  if (!state.sessions.length) {
    setStatus('定时任务未找到可处理的联系人列表。', 'error')
    return
  }

  state.autoTaskRunning = true
  state.autoTaskPaused = false
  stopWeFlowSourcePolling()
  state.autoTaskRunId += 1
  state.taskSnapshot = state.sessions.slice()
  state.taskCursor = 0
  setStatus(`${source === 'timer' ? '定时任务' : '手动任务'}开始第 ${state.autoTaskRunId} 轮，共 ${state.taskSnapshot.length} 个联系人。`, 'ok')
  await processTaskCursor()
}

async function processTaskCursor() {
  if (!state.autoTaskRunning || state.automationStopped || state.autoTaskPaused) return
  if (state.taskCursor >= state.taskSnapshot.length) {
    await finishTaskRunAtStart()
    return
  }
  await processCurrentTaskSession()
}

function restartAutoTaskScheduler() {
  stopAutoTaskScheduler()
  if (!state.config?.autoTaskEnabled) return
  scheduleNextAutoTaskRun()
  const intervalMs = getAutoTaskIntervalMs()
  setStatus(`定时任务已启用，每 ${formatDuration(intervalMs)} 执行一轮。`, 'ok')
}

function stopAutoTaskScheduler() {
  if (state.autoTaskTimer) {
    window.clearTimeout(state.autoTaskTimer)
    state.autoTaskTimer = null
  }
}

function startContactWatchdog(session) {
  stopContactWatchdog()
  if (!state.autoTaskRunning || !session?.id) return
  const sessionId = session.id
  state.currentContactWatchdogTimer = window.setTimeout(() => {
    if (!state.autoTaskRunning || state.automationStopped || state.selected?.id !== sessionId) return
    state.loadingMessages = false
    setStatus(`处理联系人 ${session.name || session.id} 超时，自动跳过。`, 'error')
    advanceTaskCursor().catch((error) => {
      setStatus(`跳过超时联系人失败：${error.message}`, 'error')
    })
  }, 30000)
}

function stopContactWatchdog() {
  if (state.currentContactWatchdogTimer) {
    window.clearTimeout(state.currentContactWatchdogTimer)
    state.currentContactWatchdogTimer = null
  }
}

function scheduleNextAutoTaskRun(delayMs = getAutoTaskIntervalMs()) {
  stopAutoTaskScheduler()
  if (!state.config?.autoTaskEnabled) return
  state.autoTaskTimer = window.setTimeout(() => {
    state.autoTaskTimer = null
    runAutoTaskNow().catch((error) => {
      state.autoTaskRunning = false
      scheduleNextAutoTaskRun()
      setStatus(`定时任务执行失败：${error.message}`, 'error')
    })
  }, delayMs)
}

function getAutoTaskIntervalMs() {
  return Math.max(60000, Number(state.config?.autoTaskIntervalMs ?? 300000))
}

function stopAllAutomation() {
  stopManualSendWatch()
  stopContactWatchdog()
  stopAutoTaskScheduler()
  cleanupWeixinPopupsIfEnabled().catch(() => {})
  state.automationStopped = true
  state.autoTaskRunning = false
  state.autoTaskPaused = false
  state.taskSnapshot = []
  state.taskCursor = 0
  state.loadingMessages = false
  if (state.config) state.config.autoTaskEnabled = false
  if (elements.autoTaskEnabledInput) elements.autoTaskEnabledInput.checked = false
  setStatus('已停止定时任务、当前自动轮询和发送监控。如需重新启用，请在配置中打开定时任务并保存。', 'ok')
}

async function cleanupWeixinPopupsIfEnabled() {
  if (state.config?.cleanupWeixinPopupsAfterTask === false) return {}
  return requestJson('/api/cleanup-weixin-popups', { method: 'POST' }).catch(() => ({}))
}

function togglePauseTaskRun() {
  if (state.autoTaskPaused) {
    startTaskRun({ source: 'manual' }).catch((error) => setStatus(`继续任务失败：${error.message}`, 'error'))
    return
  }
  if (!state.autoTaskRunning) {
    setStatus('当前没有正在运行的任务。', 'ok')
    return
  }
  stopManualSendWatch()
  stopContactWatchdog()
  state.autoTaskRunning = false
  state.autoTaskPaused = true
  state.loadingMessages = false
  restartWeFlowSourcePolling()
  setStatus(`任务已暂停，当前进度 ${state.taskCursor + 1}/${state.taskSnapshot.length}。点击“开始任务”或“暂停任务”可继续。`, 'ok')
}

function shouldWaitForPeerReply(messages) {
  const latestMessage = getLatestMessage(messages)
  return latestMessage?.isSend === 1
}

function shouldSkipHandledPeerMessage(messages) {
  if (!state.selected?.id) return false
  const fingerprint = getLatestPeerMessageFingerprint(messages)
  if (!fingerprint) return false
  return state.handledPeerMessageFingerprints[state.selected.id] === fingerprint
}

function markLatestPeerMessageHandled(sessionId, messages) {
  if (!sessionId) return
  const fingerprint = getLatestPeerMessageFingerprint(messages)
  if (!fingerprint) return
  state.handledPeerMessageFingerprints[sessionId] = fingerprint
  saveHandledPeerMessageFingerprints()
}

function getLatestPeerMessageFingerprint(messages) {
  const latestPeerMessage = getLatestPeerMessage(messages)
  if (!latestPeerMessage) return ''
  const time = getMessageTimeValue(latestPeerMessage)
  const content = normalizeComparableText(latestPeerMessage.content || latestPeerMessage.parsedContent || latestPeerMessage.rawContent || '')
  return `${time}:${content}`
}

function getLatestPeerMessage(messages) {
  if (!Array.isArray(messages) || !messages.length) return null
  return messages
    .filter((message) => message.isSend !== 1)
    .sort((left, right) => Number(getMessageTimeValue(right)) - Number(getMessageTimeValue(left)))[0] || null
}

function getLatestMessage(messages) {
  if (!Array.isArray(messages) || !messages.length) return null
  return messages
    .slice()
    .sort((left, right) => Number(getMessageTimeValue(right)) - Number(getMessageTimeValue(left)))[0]
}

function getMessageTimeValue(message) {
  return message?.createTime || message?.timestamp || message?.time || 0
}

function readHandledPeerMessageFingerprints() {
  try {
    return JSON.parse(localStorage.getItem(handledPeerMessageStorageKey) || '{}') || {}
  } catch {
    return {}
  }
}

function saveHandledPeerMessageFingerprints() {
  try {
    localStorage.setItem(handledPeerMessageStorageKey, JSON.stringify(state.handledPeerMessageFingerprints))
  } catch {
    // ignore storage failures
  }
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function delay(ms) {
  return new Promise((resolvePromise) => window.setTimeout(resolvePromise, Math.max(0, ms)))
}

function formatDuration(ms) {
  const totalSeconds = Math.round(Number(ms || 0) / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
}

function formatWeixinPrepareError(result) {
  if (result?.searchOcrSkipped) {
    return `微信搜索已关闭 OCR 校验，但未能打开联系人“${result.searchText || ''}”。请检查微信是否在前台或搜索框位置是否校准。`
  }
  if (result?.reason === 'weixin_search_no_match') {
    if (result?.searchFocusMethod === 'relative_click_fallback' && result?.hasReadableSearchText === false) {
      return `微信搜索结果无法读取文本“${result.searchText || ''}”，已跳过；可改用坐标兜底模式或确认搜索框是否已聚焦。`
    }
    return `微信搜索没有匹配到联系人“${result.searchText || ''}”，已跳过，避免误回车打开搜一搜。`
  }
  if (result?.reason === 'target_weixin_window_not_found') {
    const titles = Array.isArray(result.candidates) ? result.candidates.filter(Boolean).join('；') : ''
    return `未找到目标微信窗口。请先手动打开正确微信${result.titleKeyword ? `，并确认窗口标题包含“${result.titleKeyword}”` : ''}${titles ? `。当前候选：${titles}` : '。不会自动启动新微信。'}`
  }
  return `微信窗口准备失败：${result?.reason || '未能定位微信窗口'}`
}

function startWeFlowSourcePolling() {
  if (state.autoTaskRunning) return
  stopWeFlowSourcePolling()
  state.sourcePollTimer = window.setInterval(() => {
    pollWeFlowSource().catch(() => {})
  }, 8000)
}

function stopWeFlowSourcePolling() {
  if (state.sourcePollTimer) {
    window.clearInterval(state.sourcePollTimer)
    state.sourcePollTimer = null
  }
}

function restartWeFlowSourcePolling() {
  stopWeFlowSourcePolling()
  if (state.autoTaskRunning) return
  startWeFlowSourcePolling()
}

async function ensureWeFlowSourceFingerprint() {
  if (state.sourceFingerprint) return
  try {
    const data = await requestJson('/api/sessions?limit=5')
    const sessions = normalizeSessions(data)
    state.sourceFingerprint = buildSessionFingerprint(sessions)
    appendSourceDebugLog('初始化指纹', sessions)
  } catch {
    // ignore bootstrap failures; normal polling will retry
  }
}

async function pollWeFlowSource() {
  if (state.autoTaskRunning) return
  if (state.sourcePollInFlight) return
  state.sourcePollInFlight = true
  try {
    const data = await requestJson('/api/sessions?limit=5')
    const sessions = normalizeSessions(data)
    const nextFingerprint = buildSessionFingerprint(sessions)
    appendSourceDebugLog('轮询采样', sessions)
    if (!nextFingerprint) return
    if (!state.sourceFingerprint) {
      state.sourceFingerprint = nextFingerprint
      return
    }
    if (nextFingerprint !== state.sourceFingerprint) {
      appendSourceDebugLog('检测到会话源变化', sessions)
      state.sourceFingerprint = nextFingerprint
      await searchSessions({ silent: true, source: 'background' })
    }
  } catch {
    // health/status area already shows failures elsewhere
  } finally {
    state.sourcePollInFlight = false
  }
}

function buildSessionFingerprint(sessions) {
  return sessions
    .slice(0, 5)
    .map((session) => `${session.id}:${session.time}:${session.unreadCount}`)
    .join('|')
}

function appendSourceDebugLog(reason, sessions) {
  const topNames = sessions.slice(0, 5).map((session, index) => `${index + 1}. ${session.name}`).join(' | ')
  const hasHupiJiao = sessions.some((session) => session.name.includes('虎皮椒'))
  const hasYuanBao = sessions.some((session) => session.name.includes('元宝团子'))
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${reason}
前5: ${topNames || '空'}
命中: 虎皮椒=${hasHupiJiao ? 'Y' : 'N'} / 元宝团子=${hasYuanBao ? 'Y' : 'N'}`
  state.sourceDebugLines = [line, ...state.sourceDebugLines].slice(0, 8)
  renderSourceDebug()
}

function renderSourceDebug() {
  if (!state.sourceDebugVisible || !state.sourceDebugLines.length) {
    elements.sourceDebug.classList.add('hidden')
    elements.sourceDebug.textContent = ''
    elements.toggleDebugBtn.textContent = '调试'
    return
  }
  elements.sourceDebug.classList.remove('hidden')
  elements.sourceDebug.textContent = state.sourceDebugLines.join('\n\n')
  elements.toggleDebugBtn.textContent = '收起调试'
}

function toggleSourceDebug() {
  state.sourceDebugVisible = !state.sourceDebugVisible
  renderSourceDebug()
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
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || response.statusText)
    error.data = data
    error.status = response.status
    throw error
  }
  return data
}

async function requestJsonWithTimeout(url, options = {}, timeoutMs = 45000, label = 'AI 请求') {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(new Error(`${label}超时`)), Math.max(1000, timeoutMs))
  try {
    return await requestJson(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${label}超时（${timeoutMs}ms）`)
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

function notifyDesktopConfigChanged() {
  try {
    window.weflowAssistantConfigSaved?.()
  } catch {
    // desktop shell may not be present in browser mode
  }
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

function normalizeSessionTime(value) {
  const number = Number(value)
  if (Number.isFinite(number) && number > 0) {
    if (number > 1000000000000) return number
    if (number > 1000000000) return number * 1000
    return number
  }

  const parsed = Date.parse(String(value || '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function formatRelativeTime(value) {
  const milliseconds = normalizeSessionTime(value)
  if (!milliseconds) return '无最近时间'

  const diff = Date.now() - milliseconds
  if (diff < 0) return formatTime(milliseconds)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatTime(milliseconds)
}
