const state = {
  config: null,
  selected: null,
  messages: []
}

const elements = {
  healthBtn: document.querySelector('#healthBtn'),
  keywordInput: document.querySelector('#keywordInput'),
  searchBtn: document.querySelector('#searchBtn'),
  status: document.querySelector('#status'),
  sessions: document.querySelector('#sessions'),
  sessionTitle: document.querySelector('#sessionTitle'),
  sessionMeta: document.querySelector('#sessionMeta'),
  openWeFlowBtn: document.querySelector('#openWeFlowBtn'),
  copyTalkerBtn: document.querySelector('#copyTalkerBtn'),
  limitInput: document.querySelector('#limitInput'),
  loadMessagesBtn: document.querySelector('#loadMessagesBtn'),
  analyzeBtn: document.querySelector('#analyzeBtn'),
  purposeInput: document.querySelector('#purposeInput'),
  analysis: document.querySelector('#analysis'),
  messages: document.querySelector('#messages'),
  intentInput: document.querySelector('#intentInput'),
  draftBtn: document.querySelector('#draftBtn'),
  draftOutput: document.querySelector('#draftOutput'),
  copyDraftBtn: document.querySelector('#copyDraftBtn')
}

init()

async function init() {
  bindEvents()
  await loadConfig()
  await checkHealth()
  await searchSessions()
}

function bindEvents() {
  elements.healthBtn.addEventListener('click', checkHealth)
  elements.searchBtn.addEventListener('click', searchSessions)
  elements.keywordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchSessions()
  })
  elements.loadMessagesBtn.addEventListener('click', loadMessages)
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
}

async function checkHealth() {
  setStatus('正在检测 WeFlow API...')
  try {
    await requestJson('/api/health')
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
    renderSessions(sessions)
    setStatus(`找到 ${sessions.length} 个会话。`, 'ok')
  } catch (error) {
    setStatus(`搜索失败：${error.message}`, 'error')
  }
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
    node.addEventListener('click', () => {
      const session = sessions.find((item) => item.id === node.dataset.id)
      selectSession(session)
    })
  }
}

function selectSession(session) {
  state.selected = session
  state.messages = []
  for (const node of elements.sessions.querySelectorAll('.session-item')) {
    node.classList.toggle('active', node.dataset.id === session.id)
  }
  elements.sessionTitle.textContent = session.name
  elements.sessionMeta.textContent = session.id
  elements.messages.innerHTML = '<div class="status">点击“读取消息”加载最近聊天。</div>'
  elements.analysis.textContent = '分析结果会显示在这里。'
  elements.openWeFlowBtn.disabled = false
  elements.copyTalkerBtn.disabled = false
  elements.loadMessagesBtn.disabled = false
  elements.analyzeBtn.disabled = false
  elements.draftBtn.disabled = false
}

async function loadMessages() {
  if (!state.selected) return
  setStatus('正在读取消息...')
  try {
    const limit = Number(elements.limitInput.value || 80)
    const data = await requestJson(`/api/messages?talker=${encodeURIComponent(state.selected.id)}&limit=${encodeURIComponent(limit)}`)
    state.messages = Array.isArray(data.messages) ? data.messages : []
    renderMessages(state.messages)
    setStatus(`已读取 ${state.messages.length} 条消息。`, 'ok')
  } catch (error) {
    setStatus(`读取失败：${error.message}`, 'error')
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
    const data = await requestJson('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({
        talker: state.selected.id,
        limit: Number(elements.limitInput.value || 80),
        purpose: elements.purposeInput.value
      })
    })
    elements.analysis.textContent = data.analysis || '无分析结果。'
    setStatus(`分析完成：${data.mode === 'ai' ? 'AI' : '本地'} 模式。`, 'ok')
  } catch (error) {
    elements.analysis.textContent = `分析失败：${error.message}`
    setStatus(`分析失败：${error.message}`, 'error')
  }
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
    setStatus(`草稿生成完成：${data.mode === 'ai' ? 'AI' : '本地'} 模式。请人工确认。`, 'ok')
  } catch (error) {
    elements.draftOutput.value = `生成失败：${error.message}`
    setStatus(`草稿失败：${error.message}`, 'error')
  }
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
