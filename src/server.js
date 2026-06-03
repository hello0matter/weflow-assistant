import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const publicDir = join(rootDir, 'public')
const envFilePath = join(rootDir, '.env')

loadEnv(envFilePath)

const defaultAnalysisSystemPrompt = '你是公司内部微信回复助手。只基于用户授权的本地聊天记录，直接生成一段适合发给对方的微信回复正文。不要做总结，不要解释思路，不要分点，不要加标题，不要出现“建议回复”这类提示语，只输出最终可发送的话。语气自然，贴近真实聊天，避免过长。'
const defaultDraftSystemPrompt = '你是公司内部微信回复助手。只基于用户授权的本地聊天记录起草回复。只输出适合直接发给对方的微信正文，不要解释，不要分点，不要加标题，不要出现系统提示语。语气自然，像真人聊天。'
const defaultReplyScenarios = [
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

const config = {
  port: readNumber(process.env.ASSISTANT_PORT, 5088),
  weflowBaseUrl: trimTrailingSlash(process.env.WEFLOW_BASE_URL || 'http://127.0.0.1:5031'),
  weflowAccessToken: process.env.WEFLOW_ACCESS_TOKEN || '',
  openaiBaseUrl: trimTrailingSlash(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  analysisSystemPrompt: process.env.ANALYSIS_SYSTEM_PROMPT || defaultAnalysisSystemPrompt,
  draftSystemPrompt: process.env.DRAFT_SYSTEM_PROMPT || defaultDraftSystemPrompt,
  replyScenarios: normalizeReplyScenarios(parseJsonValue(process.env.REPLY_SCENARIOS), defaultReplyScenarios),
  autoOpenChatAfterDraft: readBoolean(process.env.AUTO_OPEN_CHAT_AFTER_DRAFT, true),
  autoCopyDraftAfterDraft: readBoolean(process.env.AUTO_COPY_DRAFT_AFTER_DRAFT, true),
  autoCopyDraftDelayMs: readNumber(process.env.AUTO_COPY_DRAFT_DELAY_MS, 1200),
  weixinDraftInputMode: normalizeDraftInputMode(process.env.WEIXIN_DRAFT_INPUT_MODE),
  weixinTypingIntervalMs: readNumber(process.env.WEIXIN_TYPING_INTERVAL_MS, 80),
  weixinTypingJitterMs: readNumber(process.env.WEIXIN_TYPING_JITTER_MS, 40),
  autoAdvanceAfterManualSend: readBoolean(process.env.AUTO_ADVANCE_AFTER_MANUAL_SEND, false),
  autoAnalyzeAfterAdvance: readBoolean(process.env.AUTO_ANALYZE_AFTER_ADVANCE, true),
  autoSkipEmptySession: readBoolean(process.env.AUTO_SKIP_EMPTY_SESSION, true),
  aiAutoSkipTimeoutMs: readNumber(process.env.AI_AUTO_SKIP_TIMEOUT_MS, 45000),
  advanceNextShortcut: process.env.ADVANCE_NEXT_SHORTCUT || 'Ctrl+Alt+N',
  pauseTaskShortcut: process.env.PAUSE_TASK_SHORTCUT || 'Ctrl+Alt+P',
  manualSendWatchTimeoutMs: readNumber(process.env.MANUAL_SEND_WATCH_TIMEOUT_MS, 120000),
  manualSendPollMs: readNumber(process.env.MANUAL_SEND_POLL_MS, 3000),
  advanceDelayAfterSendMs: readNumber(process.env.ADVANCE_DELAY_AFTER_SEND_MS, 800),
  activateAssistantAfterSend: readBoolean(process.env.ACTIVATE_ASSISTANT_AFTER_SEND, true),
  autoSendAfterDraftInput: readBoolean(process.env.AUTO_SEND_AFTER_DRAFT_INPUT, false),
  weixinSendMode: normalizeSendMode(process.env.WEIXIN_SEND_MODE),
  weixinSearchMode: normalizeSearchMode(process.env.WEIXIN_SEARCH_MODE),
  clearInputBeforePaste: readBoolean(process.env.CLEAR_INPUT_BEFORE_PASTE, true),
  weixinWindowTitleKeyword: process.env.WEIXIN_WINDOW_TITLE_KEYWORD || '',
  weixinAccountUiKeyword: process.env.WEIXIN_ACCOUNT_UI_KEYWORD || '',
  weixinSearchBoxRatioX: readNumber(process.env.WEIXIN_SEARCH_BOX_RATIO_X, 0.19),
  weixinSearchBoxRatioY: readNumber(process.env.WEIXIN_SEARCH_BOX_RATIO_Y, 0.071),
  weixinSearchOcrEnabled: readBoolean(process.env.WEIXIN_SEARCH_OCR_ENABLED, false),
  ocrProvider: normalizeOcrProvider(process.env.OCR_PROVIDER),
  ocrPythonPath: process.env.OCR_PYTHON_PATH || 'python',
  cleanupWeixinPopupsAfterTask: readBoolean(process.env.CLEANUP_WEIXIN_POPUPS_AFTER_TASK, true),
  autoTaskEnabled: readBoolean(process.env.AUTO_TASK_ENABLED, false),
  autoTaskIntervalMs: readNumber(process.env.AUTO_TASK_INTERVAL_MS, 300000)
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
}

export function startServer(overrides = {}) {
  const runtimeConfig = { ...config, ...overrides }
  Object.assign(config, runtimeConfig)

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

      if (request.method === 'OPTIONS') {
        response.writeHead(204, corsHeaders())
        response.end()
        return
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        await handleApi(request, response, requestUrl)
        return
      }

      serveStatic(response, requestUrl.pathname)
    } catch (error) {
      sendJson(response, 500, { success: false, error: String(error?.message || error) })
    }
  })

  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(config.port, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : config.port
      console.log(`WeFlow Assistant: http://127.0.0.1:${port}`)
      console.log(`WeFlow API: ${config.weflowBaseUrl}`)
      resolveServer({ server, port })
    })
  })
}

const entryUrl = process.argv[1] ? new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href : ''

if (import.meta.url === entryUrl) {
  startServer().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

async function handleApi(request, response, requestUrl) {
  if (request.method === 'GET' && requestUrl.pathname === '/api/config') {
    sendJson(response, 200, { success: true, config: buildPublicConfig() })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/config') {
    const body = await readJsonBody(request)
    const nextWeFlowBaseUrl = normalizeBaseUrl(body.weflowBaseUrl || 'http://127.0.0.1:5031')
    const nextWeFlowAccessToken = normalizeToken(body.weflowAccessToken)
    const nextAiBaseUrl = normalizeBaseUrl(body.openaiBaseUrl || 'https://api.openai.com/v1')
    const nextAiApiKey = normalizeToken(body.openaiApiKey)
    const nextAiModel = normalizeModel(body.openaiModel)
    const nextAnalysisSystemPrompt = normalizePrompt(body.analysisSystemPrompt, defaultAnalysisSystemPrompt)
    const nextDraftSystemPrompt = normalizePrompt(body.draftSystemPrompt, defaultDraftSystemPrompt)
    const nextReplyScenarios = normalizeReplyScenarios(body.replyScenarios, defaultReplyScenarios)
    const nextAutoOpenChatAfterDraft = readBoolean(body.autoOpenChatAfterDraft, true)
    const nextAutoCopyDraftAfterDraft = readBoolean(body.autoCopyDraftAfterDraft, true)
    const nextAutoCopyDraftDelayMs = clampInt(body.autoCopyDraftDelayMs, 1200, 0, 10000)
    const nextWeixinDraftInputMode = normalizeDraftInputMode(body.weixinDraftInputMode)
    const nextWeixinTypingIntervalMs = clampInt(body.weixinTypingIntervalMs, 80, 0, 2000)
    const nextWeixinTypingJitterMs = clampInt(body.weixinTypingJitterMs, 40, 0, 2000)
    const nextAutoAdvanceAfterManualSend = readBoolean(body.autoAdvanceAfterManualSend, false)
    const nextAutoAnalyzeAfterAdvance = readBoolean(body.autoAnalyzeAfterAdvance, true)
    const nextAutoSkipEmptySession = readBoolean(body.autoSkipEmptySession, true)
    const nextAiAutoSkipTimeoutMs = clampInt(body.aiAutoSkipTimeoutMs, 45000, 5000, 600000)
    const nextAdvanceNextShortcut = normalizeShortcut(body.advanceNextShortcut, 'Ctrl+Alt+N')
    const nextPauseTaskShortcut = normalizeShortcut(body.pauseTaskShortcut, 'Ctrl+Alt+P')
    const nextManualSendWatchTimeoutMs = clampInt(body.manualSendWatchTimeoutMs, 120000, 5000, 600000)
    const nextManualSendPollMs = clampInt(body.manualSendPollMs, 3000, 1000, 30000)
    const nextAdvanceDelayAfterSendMs = clampInt(body.advanceDelayAfterSendMs, 800, 0, 30000)
    const nextActivateAssistantAfterSend = readBoolean(body.activateAssistantAfterSend, true)
    const nextAutoSendAfterDraftInput = readBoolean(body.autoSendAfterDraftInput, false)
    const nextWeixinSendMode = normalizeSendMode(body.weixinSendMode)
    const nextWeixinSearchMode = normalizeSearchMode(body.weixinSearchMode)
    const nextClearInputBeforePaste = readBoolean(body.clearInputBeforePaste, true)
    const nextWeixinWindowTitleKeyword = String(body.weixinWindowTitleKeyword || '').trim()
    const nextWeixinAccountUiKeyword = String(body.weixinAccountUiKeyword || '').trim()
    const nextWeixinSearchBoxRatioX = clampFloat(body.weixinSearchBoxRatioX, config.weixinSearchBoxRatioX, 0.05, 0.95)
    const nextWeixinSearchBoxRatioY = clampFloat(body.weixinSearchBoxRatioY, config.weixinSearchBoxRatioY, 0.02, 0.95)
    const nextWeixinSearchOcrEnabled = readBoolean(body.weixinSearchOcrEnabled, false)
    const nextOcrProvider = normalizeOcrProvider(body.ocrProvider || config.ocrProvider)
    const nextOcrPythonPath = String(body.ocrPythonPath || config.ocrPythonPath || 'python').trim()
    const nextCleanupWeixinPopupsAfterTask = readBoolean(body.cleanupWeixinPopupsAfterTask, true)
    const nextAutoTaskEnabled = readBoolean(body.autoTaskEnabled, false)
    const nextAutoTaskIntervalMs = clampInt(body.autoTaskIntervalMs, 300000, 60000, 86400000)

    config.weflowBaseUrl = nextWeFlowBaseUrl
    config.weflowAccessToken = nextWeFlowAccessToken
    config.openaiBaseUrl = nextAiBaseUrl
    config.openaiApiKey = nextAiApiKey
    config.openaiModel = nextAiModel
    config.analysisSystemPrompt = nextAnalysisSystemPrompt
    config.draftSystemPrompt = nextDraftSystemPrompt
    config.replyScenarios = nextReplyScenarios
    config.autoOpenChatAfterDraft = nextAutoOpenChatAfterDraft
    config.autoCopyDraftAfterDraft = nextAutoCopyDraftAfterDraft
    config.autoCopyDraftDelayMs = nextAutoCopyDraftDelayMs
    config.weixinDraftInputMode = nextWeixinDraftInputMode
    config.weixinTypingIntervalMs = nextWeixinTypingIntervalMs
    config.weixinTypingJitterMs = nextWeixinTypingJitterMs
    config.autoAdvanceAfterManualSend = nextAutoAdvanceAfterManualSend
    config.autoAnalyzeAfterAdvance = nextAutoAnalyzeAfterAdvance
    config.autoSkipEmptySession = nextAutoSkipEmptySession
    config.aiAutoSkipTimeoutMs = nextAiAutoSkipTimeoutMs
    config.advanceNextShortcut = nextAdvanceNextShortcut
    config.pauseTaskShortcut = nextPauseTaskShortcut
    config.manualSendWatchTimeoutMs = nextManualSendWatchTimeoutMs
    config.manualSendPollMs = nextManualSendPollMs
    config.advanceDelayAfterSendMs = nextAdvanceDelayAfterSendMs
    config.activateAssistantAfterSend = nextActivateAssistantAfterSend
    config.autoSendAfterDraftInput = nextAutoSendAfterDraftInput
    config.weixinSendMode = nextWeixinSendMode
    config.weixinSearchMode = nextWeixinSearchMode
    config.clearInputBeforePaste = nextClearInputBeforePaste
    config.weixinWindowTitleKeyword = nextWeixinWindowTitleKeyword
    config.weixinAccountUiKeyword = nextWeixinAccountUiKeyword
    config.weixinSearchBoxRatioX = nextWeixinSearchBoxRatioX
    config.weixinSearchBoxRatioY = nextWeixinSearchBoxRatioY
    config.weixinSearchOcrEnabled = nextWeixinSearchOcrEnabled
    config.ocrProvider = nextOcrProvider
    config.ocrPythonPath = nextOcrPythonPath
    config.cleanupWeixinPopupsAfterTask = nextCleanupWeixinPopupsAfterTask
    config.autoTaskEnabled = nextAutoTaskEnabled
    config.autoTaskIntervalMs = nextAutoTaskIntervalMs

    process.env.WEFLOW_BASE_URL = nextWeFlowBaseUrl
    process.env.WEFLOW_ACCESS_TOKEN = nextWeFlowAccessToken
    process.env.OPENAI_BASE_URL = nextAiBaseUrl
    process.env.OPENAI_API_KEY = nextAiApiKey
    process.env.OPENAI_MODEL = nextAiModel
    process.env.ANALYSIS_SYSTEM_PROMPT = nextAnalysisSystemPrompt
    process.env.DRAFT_SYSTEM_PROMPT = nextDraftSystemPrompt
    process.env.REPLY_SCENARIOS = JSON.stringify(nextReplyScenarios)
    process.env.AUTO_OPEN_CHAT_AFTER_DRAFT = String(nextAutoOpenChatAfterDraft)
    process.env.AUTO_COPY_DRAFT_AFTER_DRAFT = String(nextAutoCopyDraftAfterDraft)
    process.env.AUTO_COPY_DRAFT_DELAY_MS = String(nextAutoCopyDraftDelayMs)
    process.env.WEIXIN_DRAFT_INPUT_MODE = nextWeixinDraftInputMode
    process.env.WEIXIN_TYPING_INTERVAL_MS = String(nextWeixinTypingIntervalMs)
    process.env.WEIXIN_TYPING_JITTER_MS = String(nextWeixinTypingJitterMs)
    process.env.AUTO_ADVANCE_AFTER_MANUAL_SEND = String(nextAutoAdvanceAfterManualSend)
    process.env.AUTO_ANALYZE_AFTER_ADVANCE = String(nextAutoAnalyzeAfterAdvance)
    process.env.AUTO_SKIP_EMPTY_SESSION = String(nextAutoSkipEmptySession)
    process.env.AI_AUTO_SKIP_TIMEOUT_MS = String(nextAiAutoSkipTimeoutMs)
    process.env.ADVANCE_NEXT_SHORTCUT = nextAdvanceNextShortcut
    process.env.PAUSE_TASK_SHORTCUT = nextPauseTaskShortcut
    process.env.MANUAL_SEND_WATCH_TIMEOUT_MS = String(nextManualSendWatchTimeoutMs)
    process.env.MANUAL_SEND_POLL_MS = String(nextManualSendPollMs)
    process.env.ADVANCE_DELAY_AFTER_SEND_MS = String(nextAdvanceDelayAfterSendMs)
    process.env.ACTIVATE_ASSISTANT_AFTER_SEND = String(nextActivateAssistantAfterSend)
    process.env.AUTO_SEND_AFTER_DRAFT_INPUT = String(nextAutoSendAfterDraftInput)
    process.env.WEIXIN_SEND_MODE = nextWeixinSendMode
    process.env.WEIXIN_SEARCH_MODE = nextWeixinSearchMode
    process.env.CLEAR_INPUT_BEFORE_PASTE = String(nextClearInputBeforePaste)
    process.env.WEIXIN_WINDOW_TITLE_KEYWORD = nextWeixinWindowTitleKeyword
    process.env.WEIXIN_ACCOUNT_UI_KEYWORD = nextWeixinAccountUiKeyword
    process.env.WEIXIN_SEARCH_BOX_RATIO_X = String(nextWeixinSearchBoxRatioX)
    process.env.WEIXIN_SEARCH_BOX_RATIO_Y = String(nextWeixinSearchBoxRatioY)
    process.env.WEIXIN_SEARCH_OCR_ENABLED = String(nextWeixinSearchOcrEnabled)
    process.env.OCR_PROVIDER = nextOcrProvider
    process.env.OCR_PYTHON_PATH = nextOcrPythonPath
    process.env.CLEANUP_WEIXIN_POPUPS_AFTER_TASK = String(nextCleanupWeixinPopupsAfterTask)
    process.env.AUTO_TASK_ENABLED = String(nextAutoTaskEnabled)
    process.env.AUTO_TASK_INTERVAL_MS = String(nextAutoTaskIntervalMs)

    saveEnvValues({
      WEFLOW_BASE_URL: nextWeFlowBaseUrl,
      WEFLOW_ACCESS_TOKEN: nextWeFlowAccessToken,
      OPENAI_BASE_URL: nextAiBaseUrl,
      OPENAI_API_KEY: nextAiApiKey,
      OPENAI_MODEL: nextAiModel,
      ANALYSIS_SYSTEM_PROMPT: nextAnalysisSystemPrompt,
      DRAFT_SYSTEM_PROMPT: nextDraftSystemPrompt,
      REPLY_SCENARIOS: JSON.stringify(nextReplyScenarios),
      AUTO_OPEN_CHAT_AFTER_DRAFT: String(nextAutoOpenChatAfterDraft),
      AUTO_COPY_DRAFT_AFTER_DRAFT: String(nextAutoCopyDraftAfterDraft),
      AUTO_COPY_DRAFT_DELAY_MS: String(nextAutoCopyDraftDelayMs),
      WEIXIN_DRAFT_INPUT_MODE: nextWeixinDraftInputMode,
      WEIXIN_TYPING_INTERVAL_MS: String(nextWeixinTypingIntervalMs),
      WEIXIN_TYPING_JITTER_MS: String(nextWeixinTypingJitterMs),
      AUTO_ADVANCE_AFTER_MANUAL_SEND: String(nextAutoAdvanceAfterManualSend),
      AUTO_ANALYZE_AFTER_ADVANCE: String(nextAutoAnalyzeAfterAdvance),
      AUTO_SKIP_EMPTY_SESSION: String(nextAutoSkipEmptySession),
      AI_AUTO_SKIP_TIMEOUT_MS: String(nextAiAutoSkipTimeoutMs),
      ADVANCE_NEXT_SHORTCUT: nextAdvanceNextShortcut,
      PAUSE_TASK_SHORTCUT: nextPauseTaskShortcut,
      MANUAL_SEND_WATCH_TIMEOUT_MS: String(nextManualSendWatchTimeoutMs),
      MANUAL_SEND_POLL_MS: String(nextManualSendPollMs),
      ADVANCE_DELAY_AFTER_SEND_MS: String(nextAdvanceDelayAfterSendMs),
      ACTIVATE_ASSISTANT_AFTER_SEND: String(nextActivateAssistantAfterSend),
      AUTO_SEND_AFTER_DRAFT_INPUT: String(nextAutoSendAfterDraftInput),
      WEIXIN_SEND_MODE: nextWeixinSendMode,
      WEIXIN_SEARCH_MODE: nextWeixinSearchMode,
      CLEAR_INPUT_BEFORE_PASTE: String(nextClearInputBeforePaste),
      WEIXIN_WINDOW_TITLE_KEYWORD: nextWeixinWindowTitleKeyword,
      WEIXIN_ACCOUNT_UI_KEYWORD: nextWeixinAccountUiKeyword,
      WEIXIN_SEARCH_BOX_RATIO_X: String(nextWeixinSearchBoxRatioX),
      WEIXIN_SEARCH_BOX_RATIO_Y: String(nextWeixinSearchBoxRatioY),
      WEIXIN_SEARCH_OCR_ENABLED: String(nextWeixinSearchOcrEnabled),
      OCR_PROVIDER: nextOcrProvider,
      OCR_PYTHON_PATH: nextOcrPythonPath,
      CLEANUP_WEIXIN_POPUPS_AFTER_TASK: String(nextCleanupWeixinPopupsAfterTask),
      AUTO_TASK_ENABLED: String(nextAutoTaskEnabled),
      AUTO_TASK_INTERVAL_MS: String(nextAutoTaskIntervalMs)
    })

    sendJson(response, 200, { success: true, config: buildPublicConfig() })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    const health = await inspectWeFlow()
    sendJson(response, 200, { success: true, weflow: health })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/sessions') {
    const params = pickSearchParams(requestUrl, ['keyword', 'limit', 'offset'])
    const data = await weflowGet('/api/v1/sessions', params)
    sendJson(response, 200, data)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/messages') {
    const params = pickSearchParams(requestUrl, ['talker', 'limit', 'offset', 'start', 'end', 'keyword'])
    if (!params.talker) return sendJson(response, 400, { success: false, error: 'Missing talker' })
    const data = await weflowGet('/api/v1/messages', params)
    sendJson(response, 200, data)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/activate-weixin') {
    const result = await activateWeixinWindow()
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/weixin-windows') {
    const result = await listWeixinWindows()
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/debug-weixin-search') {
    const body = await readJsonBody(request)
    const keyword = String(body.keyword || '').trim()
    if (!keyword) return sendJson(response, 400, { success: false, error: 'Missing keyword' })
    const result = await debugWeixinSearch(keyword)
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/calibrate-weixin-search-box') {
    const result = await calibrateWeixinSearchBox()
    if (result.calibrated) {
      config.weixinSearchBoxRatioX = result.ratioX
      config.weixinSearchBoxRatioY = result.ratioY
      process.env.WEIXIN_SEARCH_BOX_RATIO_X = String(result.ratioX)
      process.env.WEIXIN_SEARCH_BOX_RATIO_Y = String(result.ratioY)
      saveEnvValues({
        WEIXIN_SEARCH_BOX_RATIO_X: String(result.ratioX),
        WEIXIN_SEARCH_BOX_RATIO_Y: String(result.ratioY)
      })
    }
    sendJson(response, 200, { success: true, config: buildPublicConfig(), ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/cleanup-weixin-popups') {
    const result = await cleanupWeixinPopups()
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/activate-assistant') {
    const result = await activateAssistantWindow()
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/prepare-weixin-draft') {
    const body = await readJsonBody(request)
    const sessionName = String(body.sessionName || '').trim()
    const talkerId = String(body.talkerId || '').trim()
    const searchText = String(body.searchText || '').trim()
    const draft = String(body.draft || '').trim()
    const shouldPaste = readBoolean(body.shouldPaste, true)
    const delayMs = clampInt(body.delayMs, config.autoCopyDraftDelayMs, 0, 10000)
    const inputMode = normalizeDraftInputMode(body.inputMode || config.weixinDraftInputMode)
    const typingIntervalMs = clampInt(body.typingIntervalMs, config.weixinTypingIntervalMs, 0, 2000)
    const typingJitterMs = clampInt(body.typingJitterMs, config.weixinTypingJitterMs, 0, 2000)
    const autoSend = readBoolean(body.autoSend, config.autoSendAfterDraftInput)
    const sendMode = normalizeSendMode(body.sendMode || config.weixinSendMode)
    const clearInputBeforePaste = readBoolean(body.clearInputBeforePaste, config.clearInputBeforePaste)

    if (!searchText && !sessionName && !talkerId) return sendJson(response, 400, { success: false, error: 'Missing searchText/sessionName/talkerId' })
    if (shouldPaste && !draft) return sendJson(response, 400, { success: false, error: 'Missing draft' })

    const result = await prepareWeixinDraft({
      searchText,
      sessionName,
      talkerId,
      draft,
      shouldPaste,
      delayMs,
      inputMode,
      typingIntervalMs,
      typingJitterMs,
      autoSend,
      sendMode,
      clearInputBeforePaste
    })
    sendJson(response, 200, { success: true, ...result })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/analyze') {
    const body = await readJsonBody(request)
    const talker = String(body.talker || '').trim()
    if (!talker) return sendJson(response, 400, { success: false, error: 'Missing talker' })
    if (!config.openaiApiKey) return sendJson(response, 400, { success: false, error: '未配置 AI。请先在配置弹窗填写 AI Base URL、API Key、模型和提示词。' })

    const limit = clampInt(body.limit, 80, 1, 500)
    const purpose = String(body.purpose || '请总结近期对话，提取待办、风险和建议回复。').trim()
    const messageData = await weflowGet('/api/v1/messages', { talker, limit: String(limit), offset: '0' })
    const messages = Array.isArray(messageData.messages) ? messageData.messages : []
    if (shouldWaitForPeerReply(messages)) return sendJson(response, 409, { success: false, error: '最后一条消息是自己发送的，等待对方回复后再生成。', waitForPeerReply: true })
    const transcript = buildTranscript(messages)
    const { reply: analysis, scenario } = await generateScenarioReplyFast({
      transcript,
      purpose,
      scenarios: config.replyScenarios
    })
    sendJson(response, 200, { success: true, mode: 'ai', analysis, scenario })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/draft') {
    const body = await readJsonBody(request)
    const talker = String(body.talker || '').trim()
    const intent = String(body.intent || '').trim()
    if (!talker) return sendJson(response, 400, { success: false, error: 'Missing talker' })
    if (!intent) return sendJson(response, 400, { success: false, error: 'Missing intent' })
    if (!config.openaiApiKey) return sendJson(response, 400, { success: false, error: '未配置 AI。请先在配置弹窗填写 AI Base URL、API Key、模型和提示词。' })

    const limit = clampInt(body.limit, 50, 1, 200)
    const messageData = await weflowGet('/api/v1/messages', { talker, limit: String(limit), offset: '0' })
    const messages = Array.isArray(messageData.messages) ? messageData.messages : []
    if (shouldWaitForPeerReply(messages)) return sendJson(response, 409, { success: false, error: '最后一条消息是自己发送的，等待对方回复后再生成。', waitForPeerReply: true })
    const transcript = buildTranscript(messages)
    const draft = await analyzeWithOpenAI({
      transcript,
      systemPrompt: config.draftSystemPrompt,
      userPrompt: `回复目标：${intent}\n\n聊天记录：\n${transcript.slice(0, 24000)}`
    })
    sendJson(response, 200, { success: true, mode: 'ai', draft: draft.trim() })
    return
  }

  sendJson(response, 404, { success: false, error: 'Not found' })
}

function buildPublicConfig() {
  return {
    weflowBaseUrl: config.weflowBaseUrl,
    weflowAccessToken: config.weflowAccessToken,
    openaiBaseUrl: config.openaiBaseUrl,
    openaiApiKey: config.openaiApiKey,
    assistantPort: config.port,
    hasWeFlowToken: Boolean(config.weflowAccessToken),
    hasAiKey: Boolean(config.openaiApiKey),
    model: config.openaiModel,
    analysisSystemPrompt: config.analysisSystemPrompt,
    draftSystemPrompt: config.draftSystemPrompt,
    replyScenarios: config.replyScenarios,
    autoOpenChatAfterDraft: config.autoOpenChatAfterDraft,
    autoCopyDraftAfterDraft: config.autoCopyDraftAfterDraft,
    autoCopyDraftDelayMs: config.autoCopyDraftDelayMs,
    weixinDraftInputMode: config.weixinDraftInputMode,
    weixinTypingIntervalMs: config.weixinTypingIntervalMs,
    weixinTypingJitterMs: config.weixinTypingJitterMs,
    autoAdvanceAfterManualSend: config.autoAdvanceAfterManualSend,
    autoAnalyzeAfterAdvance: config.autoAnalyzeAfterAdvance,
    autoSkipEmptySession: config.autoSkipEmptySession,
    aiAutoSkipTimeoutMs: config.aiAutoSkipTimeoutMs,
    advanceNextShortcut: config.advanceNextShortcut,
    pauseTaskShortcut: config.pauseTaskShortcut,
    manualSendWatchTimeoutMs: config.manualSendWatchTimeoutMs,
    manualSendPollMs: config.manualSendPollMs,
    advanceDelayAfterSendMs: config.advanceDelayAfterSendMs,
    activateAssistantAfterSend: config.activateAssistantAfterSend,
    autoSendAfterDraftInput: config.autoSendAfterDraftInput,
    weixinSendMode: config.weixinSendMode,
    weixinSearchMode: config.weixinSearchMode,
    clearInputBeforePaste: config.clearInputBeforePaste,
    weixinWindowTitleKeyword: config.weixinWindowTitleKeyword,
    weixinAccountUiKeyword: config.weixinAccountUiKeyword,
    weixinSearchBoxRatioX: config.weixinSearchBoxRatioX,
    weixinSearchBoxRatioY: config.weixinSearchBoxRatioY,
    weixinSearchOcrEnabled: config.weixinSearchOcrEnabled,
    ocrProvider: config.ocrProvider,
    ocrPythonPath: config.ocrPythonPath,
    cleanupWeixinPopupsAfterTask: config.cleanupWeixinPopupsAfterTask,
    autoTaskEnabled: config.autoTaskEnabled,
    autoTaskIntervalMs: config.autoTaskIntervalMs
  }
}

async function weflowGet(pathname, params = {}) {
  const { response, data } = await rawWeFlowGet(pathname, params)
  if (!response.ok) throw new Error(`WeFlow API ${response.status}: ${data?.error || response.statusText}`)
  return data
}

async function inspectWeFlow() {
  const health = await rawWeFlowGet('/api/v1/health')
  const sessions = await rawWeFlowGet('/api/v1/sessions', { limit: '1' })
  return {
    baseUrl: config.weflowBaseUrl,
    hasTokenConfigured: Boolean(config.weflowAccessToken),
    reachable: true,
    authRequired: Boolean(sessions.authRequired),
    healthStatus: health.data?.status || 'ok',
    sessionsStatus: sessions.response.status,
    sessionsError: sessions.authRequired ? (sessions.data?.error || 'Unauthorized') : ''
  }
}

async function rawWeFlowGet(pathname, params = {}) {
  const url = new URL(pathname, config.weflowBaseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') url.searchParams.set(key, String(value))
  }

  const headers = {}
  if (config.weflowAccessToken) headers.Authorization = `Bearer ${config.weflowAccessToken}`

  const response = await fetch(url, { headers })
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (pathname === '/api/v1/sessions' && response.status === 401) {
    return { response, data, authRequired: true }
  }

  if (!response.ok) throw new Error(`WeFlow API ${response.status}: ${data?.error || text || response.statusText}`)
  return { response, data, authRequired: false }
}

async function analyzeWithOpenAI({ systemPrompt, userPrompt }) {
  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`AI API ${response.status}: ${data?.error?.message || response.statusText}`)
  return data?.choices?.[0]?.message?.content || ''
}

async function classifyReplyScenario({ transcript, scenarios }) {
  const scenarioList = normalizeReplyScenarios(scenarios, defaultReplyScenarios)
  const scenarioText = scenarioList.map((scenario, index) => `${index + 1}. ${scenario.type}：${scenario.description}`).join('\n')
  const raw = await analyzeWithOpenAI({
    systemPrompt: '你是微信聊天场景分类器。只能根据聊天记录判断最匹配的一个场景。必须只输出 JSON，不要输出解释。',
    userPrompt: `可选场景：\n${scenarioText}\n\n聊天记录：\n${transcript.slice(0, 18000)}\n\n请输出 JSON：{"type":"场景类型","reason":"一句话判断理由"}`
  })
  const parsed = parseJsonFromText(raw)
  const matched = scenarioList.find((scenario) => scenario.type === parsed?.type) || scenarioList[0]
  return {
    type: matched.type,
    description: matched.description,
    prompt: matched.prompt,
    reason: String(parsed?.reason || '').trim()
  }
}

async function generateScenarioReplyFast({ transcript, purpose, scenarios }) {
  const scenarioList = normalizeReplyScenarios(scenarios, defaultReplyScenarios)
  const scenarioText = scenarioList.map((scenario, index) => `${index + 1}. ${scenario.type}：${scenario.description}；回复要求：${scenario.prompt}`).join('\n')
  const raw = await analyzeWithOpenAI({
    systemPrompt: config.analysisSystemPrompt,
    userPrompt: `任务：${purpose}

请先从下面场景中选出最匹配的一个，再直接生成最终可发送的微信回复正文。
可选场景：
${scenarioText}

输出必须是 JSON，不要输出解释：
{"scenario":{"type":"场景类型","reason":"一句话理由"},"reply":"最终可发送微信正文"}

聊天记录：
${transcript.slice(0, 18000)}`
  })
  const parsed = parseJsonFromText(raw)
  const matched = scenarioList.find((scenario) => scenario.type === parsed?.scenario?.type || scenario.type === parsed?.type) || scenarioList[0]
  const reply = String(parsed?.reply || parsed?.analysis || raw || '').trim()
  return {
    reply,
    scenario: {
      type: matched.type,
      description: matched.description,
      prompt: matched.prompt,
      reason: String(parsed?.scenario?.reason || parsed?.reason || '').trim()
    }
  }
}

async function generateScenarioReply({ transcript, purpose, scenario }) {
  return analyzeWithOpenAI({
    transcript,
    systemPrompt: config.analysisSystemPrompt,
    userPrompt: `任务：${purpose}

当前聊天场景：${scenario.type}
场景判断理由：${scenario.reason || '未提供'}
该场景回复要求：${scenario.prompt}

请基于聊天记录，直接输出一段适合发给对方的微信回复正文。不要解释，不要分点，不要加标题，不要出现“建议回复”等提示语。

聊天记录：
${transcript.slice(0, 24000)}`
  })
}

function buildTranscript(messages) {
  return messages
    .slice()
    .reverse()
    .map((message) => {
      const time = formatTime(message.createTime || message.timestamp || message.time)
      const sender = message.isSend === 1 ? '我' : (message.senderName || message.senderUsername || message.sourceName || '对方')
      const content = String(message.content || message.parsedContent || message.rawContent || '').replace(/\s+/g, ' ').trim()
      return `[${time}] ${sender}: ${content || '[非文本消息]'}`
    })
    .join('\n')
}

function shouldWaitForPeerReply(messages) {
  const latestMessage = getLatestMessage(messages)
  return latestMessage?.isSend === 1
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

function serveStatic(response, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname
  const filePath = resolve(publicDir, `.${decodeURIComponent(safePath)}`)
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendText(response, 404, 'Not found')
    return
  }
  const ext = extname(filePath)
  response.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
  response.end(readFileSync(filePath))
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(text)
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5088',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolveBody({})
      try {
        resolveBody(JSON.parse(text))
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`))
      }
    })
    request.on('error', reject)
  })
}

function pickSearchParams(requestUrl, names) {
  const output = {}
  for (const name of names) {
    const value = requestUrl.searchParams.get(name)
    if (value !== null) output[name] = value
  }
  return output
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

function saveEnvValues(values) {
  const existingText = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : ''
  const lines = existingText ? existingText.split(/\r?\n/) : []
  const nextLines = []
  const pendingKeys = new Set(Object.keys(values))

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      nextLines.push(line)
      continue
    }

    const index = line.indexOf('=')
    const key = line.slice(0, index).trim()
    if (!pendingKeys.has(key)) {
      nextLines.push(line)
      continue
    }

    nextLines.push(`${key}=${values[key] ?? ''}`)
    pendingKeys.delete(key)
  }

  for (const key of pendingKeys) {
    nextLines.push(`${key}=${values[key] ?? ''}`)
  }

  writeFileSync(envFilePath, `${nextLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8')
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function normalizeBaseUrl(value) {
  const normalized = trimTrailingSlash(String(value || 'http://127.0.0.1:5031').trim() || 'http://127.0.0.1:5031')
  try {
    const url = new URL(normalized)
    if (!/^https?:$/.test(url.protocol)) throw new Error('Unsupported protocol')
    return normalized
  } catch {
    throw new Error('URL 格式无效')
  }
}

function normalizeToken(value) {
  return String(value || '').trim()
}

function normalizeModel(value) {
  return String(value || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
}

function normalizePrompt(value, fallback) {
  return String(value || '').trim() || fallback
}

function normalizeReplyScenarios(value, fallback = defaultReplyScenarios) {
  const source = Array.isArray(value) ? value : fallback
  const normalized = source.map((item) => ({
    type: String(item?.type || '').trim(),
    description: String(item?.description || '').trim(),
    prompt: String(item?.prompt || '').trim()
  })).filter((item) => item.type && item.prompt)
  return normalized.length ? normalized : fallback
}

function normalizeSearchMode(value) {
  const normalized = String(value || 'name').trim().toLowerCase()
  return ['name', 'id'].includes(normalized) ? normalized : 'name'
}

function normalizeShortcut(value, fallback) {
  return String(value || fallback).trim() || fallback
}

function normalizeDraftInputMode(value) {
  const normalized = String(value || 'paste').trim().toLowerCase()
  return ['paste', 'typing'].includes(normalized) ? normalized : 'paste'
}

function normalizeSendMode(value) {
  const normalized = String(value || 'enter').trim().toLowerCase()
  if (normalized === 'click') return 'button'
  return ['enter', 'button', 'mouse'].includes(normalized) ? normalized : 'enter'
}

function normalizeOcrProvider(value) {
  const normalized = String(value || 'tesseract').trim().toLowerCase()
  return ['tesseract', 'paddle'].includes(normalized) ? normalized : 'tesseract'
}


function getTesseractPath() {
  return process.env.TESSERACT_EXE || 'D:\\Program Files\\Tesseract-OCR\\tesseract.exe'
}


function parseJsonValue(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function parseJsonFromText(value) {
  const text = String(value || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function cleanToolLog(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('Creating model:'))
    .filter((line) => !line.includes('Model files already exist'))
    .filter((line) => !line.includes('To redownload'))
    .filter((line) => !line.includes('.paddlex'))
    .filter((line) => !line.includes('Could not find files for the given pattern'))
    .join('\n')
}

async function activateWeixinWindow() {
  return runWeixinPython(['activate-window'], 30000)
}


function runWeixinPython(args, timeout = 60000) {
  return new Promise((resolvePromise) => {
    const scriptPath = join(rootDir, 'scripts', 'weixin_search.py')
    execFile(config.ocrPythonPath || 'python', [scriptPath, ...args], { windowsHide: true, timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
      const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const jsonLine = [...lines].reverse().find((line) => line.startsWith('{'))
      if (!jsonLine) {
        const cleanStderr = cleanToolLog(stderr)
        resolvePromise({
          reason: 'python_invocation_failed',
          error: [cleanStderr, error?.message, stdout?.trim()].filter(Boolean).join('\n')
        })
        return
      }
      try {
        const parsed = JSON.parse(jsonLine)
        const cleanStderr = cleanToolLog(stderr)
        if (cleanStderr && !parsed.searchOcrError) parsed.searchOcrError = cleanStderr.slice(0, 1000)
        resolvePromise(parsed)
      } catch (parseError) {
        const cleanStderr = cleanToolLog(stderr)
        resolvePromise({
          reason: 'python_invocation_failed',
          error: [parseError.message, cleanStderr, stdout?.trim()].filter(Boolean).join('\n')
        })
      }
    })
  })
}

async function listWeixinWindows() {
  const result = await runWeixinPython(['list-windows'], 30000)
  return { windows: result.windows || [] }
}


async function calibrateWeixinSearchBox() {
  return runWeixinPython(['calibrate-search-box'], 30000)
}


async function cleanupWeixinPopups() {
  return runWeixinPython(['cleanup-search-panel'], 30000)
}


async function debugWeixinSearch(keyword) {
  const result = await runWeixinPython([
    'debug-search',
    '--keyword',
    keyword,
    '--ratio-x',
    String(clampFloat(config.weixinSearchBoxRatioX, 0.19, 0.05, 0.95)),
    '--ratio-y',
    String(clampFloat(config.weixinSearchBoxRatioY, 0.071, 0.02, 0.95)),
    '--ocr-provider',
    normalizeOcrProvider(config.ocrProvider),
    '--tesseract-exe',
    getTesseractPath()
  ], 90000)
  await activateAssistantWindow().catch(() => ({}))
  return result
}

async function activateAssistantWindow() {
  return runWeixinPython(['activate-assistant', '--port', String(config.port)], 30000)
}


async function prepareWeixinDraft({ searchText, sessionName, talkerId, draft, shouldPaste, delayMs, inputMode, typingIntervalMs, typingJitterMs, autoSend, sendMode, clearInputBeforePaste }) {
  const effectiveSearchText = searchText || sessionName || talkerId
  const args = [
    'prepare-draft',
    '--keyword',
    effectiveSearchText,
    '--draft',
    draft || '',
    '--delay-ms',
    String(clampInt(delayMs, config.autoCopyDraftDelayMs, 0, 10000)),
    '--ratio-x',
    String(clampFloat(config.weixinSearchBoxRatioX, 0.19, 0.05, 0.95)),
    '--ratio-y',
    String(clampFloat(config.weixinSearchBoxRatioY, 0.071, 0.02, 0.95)),
    '--ocr-provider',
    normalizeOcrProvider(config.ocrProvider),
    '--tesseract-exe',
    getTesseractPath()
  ]
  if (!config.weixinSearchOcrEnabled) args.push('--skip-ocr')
  if (shouldPaste) args.push('--should-paste')
  if (autoSend) args.push('--auto-send')
  const result = await runWeixinPython(args, 120000)
  if (!result?.prepared) await activateAssistantWindow().catch(() => ({}))
  return result
}


function readBoolean(value, fallback) {
  if (typeof value === 'boolean') return value
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function readNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function clampFloat(value, fallback, min, max) {
  const number = Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function formatTime(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '未知时间'
  const milliseconds = number > 1000000000000 ? number : number * 1000
  return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
}
