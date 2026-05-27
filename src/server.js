import { readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const publicDir = join(rootDir, 'public')

loadEnv(join(rootDir, '.env'))

const config = {
  port: readNumber(process.env.ASSISTANT_PORT, 5088),
  weflowBaseUrl: trimTrailingSlash(process.env.WEFLOW_BASE_URL || 'http://127.0.0.1:5031'),
  weflowAccessToken: process.env.WEFLOW_ACCESS_TOKEN || '',
  openaiBaseUrl: trimTrailingSlash(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
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
    sendJson(response, 200, {
      success: true,
      config: {
        weflowBaseUrl: config.weflowBaseUrl,
        assistantPort: config.port,
        hasWeFlowToken: Boolean(config.weflowAccessToken),
        hasAiKey: Boolean(config.openaiApiKey),
        model: config.openaiModel
      }
    })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    const health = await weflowGet('/api/v1/health')
    sendJson(response, 200, { success: true, weflow: health })
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/sessions') {
    const params = pickSearchParams(requestUrl, ['keyword', 'limit', 'offset'])
    const data = await weflowGet('/api/v1/sessions', params)
    sendJson(response, 200, data)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/contacts') {
    const params = pickSearchParams(requestUrl, ['keyword', 'limit', 'offset'])
    const data = await weflowGet('/api/v1/contacts', params)
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

  if (request.method === 'POST' && requestUrl.pathname === '/api/analyze') {
    const body = await readJsonBody(request)
    const talker = String(body.talker || '').trim()
    if (!talker) return sendJson(response, 400, { success: false, error: 'Missing talker' })

    const limit = clampInt(body.limit, 80, 1, 500)
    const purpose = String(body.purpose || '请总结近期对话，提取待办、风险和建议回复。').trim()
    const messageData = await weflowGet('/api/v1/messages', { talker, limit: String(limit), offset: '0' })
    const messages = Array.isArray(messageData.messages) ? messageData.messages : []
    const transcript = buildTranscript(messages)

    if (!config.openaiApiKey) {
      sendJson(response, 200, {
        success: true,
        mode: 'local',
        analysis: localAnalyze(messages, purpose),
        transcriptPreview: transcript.slice(0, 4000)
      })
      return
    }

    const analysis = await analyzeWithOpenAI(transcript, purpose)
    sendJson(response, 200, { success: true, mode: 'ai', analysis })
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/draft') {
    const body = await readJsonBody(request)
    const talker = String(body.talker || '').trim()
    const intent = String(body.intent || '').trim()
    if (!talker) return sendJson(response, 400, { success: false, error: 'Missing talker' })
    if (!intent) return sendJson(response, 400, { success: false, error: 'Missing intent' })

    const limit = clampInt(body.limit, 50, 1, 200)
    const messageData = await weflowGet('/api/v1/messages', { talker, limit: String(limit), offset: '0' })
    const messages = Array.isArray(messageData.messages) ? messageData.messages : []
    const transcript = buildTranscript(messages)

    if (!config.openaiApiKey) {
      sendJson(response, 200, {
        success: true,
        mode: 'local',
        draft: `【待人工确认】${intent}`,
        note: '未配置 OPENAI_API_KEY，仅生成本地占位草稿。'
      })
      return
    }

    const draft = await analyzeWithOpenAI(transcript, `根据对话上下文起草一条微信回复。要求：只输出回复正文；不要自动发送；语气自然；目标：${intent}`)
    sendJson(response, 200, { success: true, mode: 'ai', draft: draft.trim() })
    return
  }

  sendJson(response, 404, { success: false, error: 'Not found' })
}

async function weflowGet(pathname, params = {}) {
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
  if (!response.ok) {
    throw new Error(`WeFlow API ${response.status}: ${data?.error || text || response.statusText}`)
  }
  return data
}

async function analyzeWithOpenAI(transcript, purpose) {
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
        {
          role: 'system',
          content: '你是公司内部微信测试辅助分析助手。只基于用户授权的本地聊天记录做总结和草稿，不要求也不执行自动发送。输出简洁、可操作，涉及发送内容必须提醒人工确认。'
        },
        {
          role: 'user',
          content: `任务：${purpose}\n\n聊天记录：\n${transcript.slice(0, 24000)}`
        }
      ]
    })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`AI API ${response.status}: ${data?.error?.message || response.statusText}`)
  return data?.choices?.[0]?.message?.content || ''
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

function localAnalyze(messages, purpose) {
  const total = messages.length
  const sent = messages.filter((item) => item.isSend === 1).length
  const received = total - sent
  const latest = messages[0]
  const keywords = collectKeywords(messages)
  return [
    `本地简析：共读取最近 ${total} 条，发送 ${sent} 条，接收 ${received} 条。`,
    latest ? `最近一条：${latest.isSend === 1 ? '我' : '对方'}：${String(latest.content || latest.parsedContent || latest.rawContent || '[非文本消息]').slice(0, 120)}` : '暂无消息。',
    keywords.length ? `高频关键词：${keywords.join('、')}` : '未提取到明显关键词。',
    `分析目标：${purpose}`,
    '如需 AI 深度总结，请在 .env 配置 OPENAI_API_KEY。'
  ].join('\n')
}

function collectKeywords(messages) {
  const stopWords = new Set(['我们', '你们', '他们', '这个', '那个', '可以', '就是', '没有', '什么', '一下', '已经', '不是', '还是', '如果', '因为', '所以'])
  const counts = new Map()
  for (const message of messages) {
    const content = String(message.content || message.parsedContent || message.rawContent || '')
    for (const word of content.match(/[\u4e00-\u9fa5]{2,6}|[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || []) {
      const normalized = word.toLowerCase()
      if (stopWords.has(normalized)) continue
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word]) => word)
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

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
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

function formatTime(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '未知时间'
  const milliseconds = number > 1000000000000 ? number : number * 1000
  return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
}
