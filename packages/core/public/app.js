// MostBox - Browser Client
// Communicates with MostBoxCore daemon via HTTP API + WebSocket

// --- API Client ---
const API = {
  baseUrl: '',
  
  async fetch(url, options = {}) {
    const res = await fetch(this.baseUrl + url, options)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  },
  
  getNodeId() { return this.fetch('/api/node-id') },
  getNetworkStatus() { return this.fetch('/api/network-status') },
  listPublishedFiles() { return this.fetch('/api/files') },
  deletePublishedFile(cid) { return this.fetch(`/api/files/${cid}`, { method: 'DELETE' }) },
  
  async publishFile(file) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/publish', {
      method: 'POST',
      body: formData
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  },
  
  downloadFile(link) {
    return this.fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link })
    })
  },
  
  getFileDownloadUrl(cid) {
    return `/api/files/${cid}/download`
  }
}

// --- WebSocket connection ---
let ws = null
let wsReconnectTimer = null

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws`)
  
  ws.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data)
      handleWSEvent(event, data)
    } catch {}
  }
  
  ws.onclose = () => {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
    wsReconnectTimer = setTimeout(connectWebSocket, 2000)
  }
  
  ws.onerror = () => { try { ws.close() } catch {} }
}

function handleWSEvent(event, data) {
  switch (event) {
    case 'download:progress':
      updateProgressBar(data.percent)
      if (taskStatus) {
        taskStatus.style.display = 'block'
        taskStatus.innerText = `正在下载... ${data.percent}%`
      }
      break
    case 'download:status': {
      const statusDiv = document.getElementById('taskStatus')
      if (statusDiv) {
        statusDiv.style.display = 'block'
        const statusMessages = {
          'connecting': '正在连接 P2P 网络...',
          'finding-peers': '正在寻找发布者节点...',
          'syncing': '正在同步文件数据...',
          'downloading': `正在下载: ${data.file || ''} ${data.size ? `(${data.size})` : ''}`,
          'verifying': '正在验证文件完整性...'
        }
        statusDiv.innerText = statusMessages[data.status] || data.status
      }
      updateProgressBar(0)
      break
    }
    case 'download:success': {
      const downloadBtnEl = document.getElementById('downloadBtn')
      if (downloadBtnEl) downloadBtnEl.disabled = false
      downloadResult.innerHTML += `<p class="success">已接收文件: ${escapeHtml(data.fileName)}</p>`
      downloadResult.innerHTML += `<p class="success">保存路径: ${escapeHtml(data.savedPath)}</p>`
      ProgressBar.setPercent(100)
      ToastManager.success('文件下载完成!')
      refreshPublishedFilesList()
      break
    }
    case 'publish:progress':
      if (data.stage === 'calculating-cid') {
        publishResult.innerHTML = '正在计算文件哈希...'
      } else if (data.stage === 'uploading') {
        publishResult.innerHTML = '正在上传到 P2P 网络...'
      }
      break
    case 'publish:success': {
      const publishBtnEl = document.getElementById('publishBtn')
      if (publishBtnEl) publishBtnEl.disabled = false
      const link = data.link
      publishResult.innerHTML = `
        <p class="success">发布成功！</p>
        <p>文件: ${escapeHtml(data.fileName)}</p>
        <p>链接: <code>${escapeHtml(link)}</code></p>
        <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
      `
      ToastManager.success('文件发布成功!')
      refreshPublishedFilesList()
      break
    }
    case 'network:status': {
      const networkStatusEl = document.getElementById('networkStatus')
      if (networkStatusEl) {
        const statusText = data.peers > 0 ? `已连接 ${data.peers} 个节点` : '等待连接中...'
        networkStatusEl.innerText = statusText
        networkStatusEl.style.color = data.peers > 0 ? 'var(--success)' : '#ff9500'
      }
      break
    }
  }
}

// --- Toast component ---
const ToastManager = {
  container: null,
  
  init() {
    if (this.container) return
    this.container = document.createElement('div')
    this.container.id = 'toast-container'
    this.container.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      display: flex; flex-direction: column; gap: 10px;
    `
    document.body.appendChild(this.container)
  },
  
  show(message, type = 'info', duration = 4000) {
    this.init()
    
    const toast = document.createElement('div')
    const colors = {
      success: '#34c759',
      error: '#ff3b30',
      warning: '#ff9500',
      info: '#0071e3'
    }
    
    toast.style.cssText = `
      background: ${colors[type] || colors.info}; color: white;
      padding: 12px 20px; border-radius: 8px; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: toastSlideIn 0.3s ease; max-width: 350px;
    `
    toast.textContent = message
    
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style')
      style.id = 'toast-styles'
      style.textContent = `
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes toastSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
      `
      document.head.appendChild(style)
    }
    
    this.container.appendChild(toast)
    
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease forwards'
      setTimeout(() => toast.remove(), 300)
    }, duration)
  },
  
  success(msg) { this.show(msg, 'success') },
  error(msg) { this.show(msg, 'error', 6000) },
  warning(msg) { this.show(msg, 'warning') },
  info(msg) { this.show(msg, 'info') }
}

// --- Theme management ---
const ThemeManager = {
  currentTheme: 'system',
  
  init() {
    const saved = localStorage.getItem('theme')
    if (saved) this.currentTheme = saved
    
    this.applyTheme(this.currentTheme)
    this.bindButtons()
    
    if (this.currentTheme === 'system') {
      this.watchSystemTheme()
    }
  },
  
  bindButtons() {
    const themeSystem = document.getElementById('themeSystem')
    const themeLight = document.getElementById('themeLight')
    const themeDark = document.getElementById('themeDark')
    
    if (themeSystem) themeSystem.addEventListener('click', () => this.setTheme('system'))
    if (themeLight) themeLight.addEventListener('click', () => this.setTheme('light'))
    if (themeDark) themeDark.addEventListener('click', () => this.setTheme('dark'))
  },
  
  setTheme(theme) {
    this.currentTheme = theme
    localStorage.setItem('theme', theme)
    this.applyTheme(theme)
    this.updateButtonStates()
  },
  
  applyTheme(theme) {
    let effective = theme
    if (theme === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    document.documentElement.setAttribute('data-theme', effective)
    this.updateButtonStates()
  },
  
  updateButtonStates() {
    const themeSystem = document.getElementById('themeSystem')
    const themeLight = document.getElementById('themeLight')
    const themeDark = document.getElementById('themeDark')
    
    if (themeSystem) themeSystem.classList.toggle('active', this.currentTheme === 'system')
    if (themeLight) themeLight.classList.toggle('active', this.currentTheme === 'light')
    if (themeDark) themeDark.classList.toggle('active', this.currentTheme === 'dark')
  },
  
  watchSystemTheme() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.currentTheme === 'system') this.applyTheme('system')
    })
  }
}

ThemeManager.init()

// --- Progress bar ---
const ProgressBar = {
  element: null,
  
  getOrCreate() {
    if (this.element) return this.element
    
    let container = document.getElementById('progress-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'progress-container'
      container.style.cssText = 'margin-top: 12px; width: 100%; display: none;'
      
      const bar = document.createElement('div')
      bar.id = 'progress-bar'
      bar.style.cssText = 'height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;'
      
      const fill = document.createElement('div')
      fill.id = 'progress-fill'
      fill.style.cssText = 'height: 100%; width: 0%; background: var(--accent); border-radius: 4px; transition: width 0.3s ease;'
      
      bar.appendChild(fill)
      container.appendChild(bar)
      
      const downloadResultEl = document.getElementById('downloadResult')
      if (downloadResultEl?.parentNode) {
        downloadResultEl.parentNode.insertBefore(container, downloadResultEl.nextSibling)
      }
    }
    
    this.element = document.getElementById('progress-fill')
    return this.element
  },
  
  setPercent(percent) {
    const el = this.getOrCreate()
    if (el) el.style.width = Math.min(100, Math.max(0, percent)) + '%'
  },
  
  reset() { this.setPercent(0) },
  hide() {
    const c = document.getElementById('progress-container')
    if (c) c.style.display = 'none'
  },
  show() {
    const c = document.getElementById('progress-container')
    if (c) c.style.display = 'block'
  }
}

function updateProgressBar(percent) {
  ProgressBar.setPercent(percent)
}

// --- DOM references ---
const nodeIdEl = document.getElementById('nodeId')
const fileInput = document.getElementById('fileInput')
const selectFileBtn = document.getElementById('selectFileBtn')
const selectedFileInfo = document.getElementById('selectedFileInfo')
const publishBtn = document.getElementById('publishBtn')
const publishResult = document.getElementById('publishResult')
const linkInput = document.getElementById('linkInput')
const downloadBtn = document.getElementById('downloadBtn')
const downloadResult = document.getElementById('downloadResult')
const taskStatus = document.getElementById('taskStatus')
const publishedFilesList = document.getElementById('publishedFilesList')
const refreshPublishedBtn = document.getElementById('refreshPublishedBtn')
const networkStatusEl = document.getElementById('networkStatus')

let selectedFile = null

// --- Initialize ---
async function init() {
  try {
    const nodeResult = await API.getNodeId()
    if (nodeIdEl && nodeResult.id) {
      nodeIdEl.innerText = `P2P 节点 ID: ${nodeResult.id}`
    }
  } catch (err) {
    console.error('获取节点 ID 失败:', err)
    if (nodeIdEl) nodeIdEl.innerText = 'P2P 节点初始化失败'
  }
  
  refreshPublishedFilesList()
  await checkNetworkOnStartup()
  setInterval(refreshNetworkStatus, 10000)
}

// --- Startup network check ---
async function checkNetworkOnStartup() {
  if (networkStatusEl) {
    networkStatusEl.innerText = '正在初始化 P2P 网络...'
    networkStatusEl.style.color = '#ff9500'
  }
  
  try {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const status = await API.getNetworkStatus()
    
    if (status.peers > 0) {
      networkStatusEl.innerText = `已连接 ${status.peers} 个节点`
      networkStatusEl.style.color = 'var(--success)'
    } else {
      networkStatusEl.innerText = 'P2P 网络已启动，等待连接...'
      networkStatusEl.style.color = '#ff9500'
      ToastManager.info('P2P 网络已启动，发布或下载文件后将自动连接')
    }
  } catch (err) {
    console.error('网络检测失败:', err)
    if (networkStatusEl) {
      networkStatusEl.innerText = '网络检测失败'
      networkStatusEl.style.color = 'var(--error)'
    }
  }
}

async function refreshNetworkStatus() {
  try {
    const status = await API.getNetworkStatus()
    if (networkStatusEl) {
      if (status.peers > 0) {
        networkStatusEl.innerText = `已连接 ${status.peers} 个节点`
        networkStatusEl.style.color = 'var(--success)'
      } else {
        networkStatusEl.innerText = 'P2P 网络已启动，等待节点发现...'
        networkStatusEl.style.color = '#ff9500'
      }
    }
  } catch {}
}

// --- File selection & publish ---
function selectFile() {
  if (fileInput) fileInput.click()
}

function handleFileSelection(event) {
  const file = event.target.files[0]
  if (!file) return
  
  selectedFile = file
  
  if (selectedFileInfo) {
    selectedFileInfo.style.display = 'block'
    selectedFileInfo.innerText = `已选择: ${file.name}\n大小: ${formatSize(file.size)}`
  }
  publishBtn.disabled = false
}

async function publish() {
  if (!selectedFile) {
    ToastManager.warning('请先选择文件')
    return
  }
  
  publishBtn.disabled = true
  publishResult.innerHTML = '正在发布...'
  ToastManager.info('正在上传并发布到 P2P 网络...')
  
  try {
    const result = await API.publishFile(selectedFile)
    
    if (result.success) {
      const link = result.link
      publishResult.innerHTML = `
        <p class="success">发布成功！</p>
        <p>文件: ${escapeHtml(result.fileName)}</p>
        <p>链接: <code>${escapeHtml(link)}</code></p>
        <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
      `
      ToastManager.success('文件发布成功!')
      refreshPublishedFilesList()
    } else {
      throw new Error(result.error || '未知错误')
    }
  } catch (err) {
    console.error('发布错误:', err)
    publishResult.innerHTML = `<p class="error">发布失败: ${escapeHtml(err.message)}</p>`
    ToastManager.error('发布失败: ' + err.message)
  } finally {
    publishBtn.disabled = false
  }
}

// --- File download ---
async function download() {
  const link = linkInput.value.trim()
  if (!link) {
    ToastManager.warning('请输入 most:// 链接')
    return
  }
  
  if (!link.startsWith('most://')) {
    ToastManager.warning('链接格式应为 most://<cid>')
    return
  }
  
  downloadBtn.disabled = true
  downloadResult.innerHTML = '正在请求下载...'
  ProgressBar.reset()
  ProgressBar.show()
  if (taskStatus) {
    taskStatus.style.display = 'block'
    taskStatus.innerText = '准备开始...'
  }
  ToastManager.info('正在连接 P2P 网络...')
  
  try {
    const result = await API.downloadFile(link)
    
    if (result.success) {
      if (result.alreadyExists) {
        downloadResult.innerHTML = `
          <p class="success">文件已存在！</p>
          <p>文件: ${escapeHtml(result.fileName)}</p>
        `
        ToastManager.info('文件已存在，无需重复下载')
      } else {
        downloadResult.innerHTML = `
          <p class="success">下载成功！</p>
          <p>文件: ${escapeHtml(result.fileName)}</p>
        `
        ToastManager.success('文件下载完成!')
        refreshPublishedFilesList()
      }
    } else {
      throw new Error(result.error || '下载失败')
    }
  } catch (err) {
    console.error('下载错误:', err)
    downloadResult.innerHTML = `<p class="error">下载失败: ${escapeHtml(err.message)}</p>`
    ToastManager.error('下载失败: ' + err.message)
  } finally {
    downloadBtn.disabled = false
    ProgressBar.hide()
  }
}

// --- Published files list ---
async function refreshPublishedFilesList() {
  try {
    const result = await API.listPublishedFiles()
    renderPublishedFiles(result || [])
  } catch (err) {
    console.error('获取文件列表失败:', err)
  }
}

function renderPublishedFiles(files) {
  if (!publishedFilesList) return
  
  if (files.length === 0) {
    publishedFilesList.innerHTML = '<div class="empty-state">暂无已发布的文件</div>'
    return
  }
  
  let html = '<ul class="published-list">'
  for (const file of files) {
    const timeStr = file.publishedAt ? new Date(file.publishedAt).toLocaleString('zh-CN') : ''
    html += `
      <li class="published-item">
        <div class="published-item-info">
          <div class="published-item-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</div>
          <div class="published-item-link" title="${escapeHtml(file.link)}">${escapeHtml(file.link)}</div>
          <div class="published-item-time">${escapeHtml(timeStr)}</div>
        </div>
        <div class="published-item-actions">
          <button class="btn-copy" data-link="${escapeHtml(file.link)}">复制链接</button>
          <button class="btn-save-as" data-cid="${escapeHtml(file.cid)}" data-name="${escapeHtml(file.fileName)}">保存文件</button>
          <button class="btn-delete" data-cid="${escapeHtml(file.cid)}">删除</button>
        </div>
      </li>
    `
  }
  html += '</ul>'
  publishedFilesList.innerHTML = html
  
  // Copy link buttons
  publishedFilesList.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const link = btn.getAttribute('data-link')
      navigator.clipboard.writeText(link).then(() => {
        ToastManager.success('链接已复制!')
      }).catch(() => {
        ToastManager.error('复制失败')
      })
    })
  })
  
  // Save/download file buttons
  publishedFilesList.querySelectorAll('.btn-save-as').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.getAttribute('data-cid')
      const name = btn.getAttribute('data-name')
      const url = API.getFileDownloadUrl(cid)
      
      // Use a hidden <a> to trigger browser download
      const a = document.createElement('a')
      a.href = url
      a.download = name || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      ToastManager.info('正在保存文件...')
    })
  })
  
  // Delete buttons
  publishedFilesList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.getAttribute('data-cid')
      if (confirm('确定要从列表中删除该发布记录吗？')) {
        try {
          await API.deletePublishedFile(cid)
          ToastManager.info('已删除发布记录')
          refreshPublishedFilesList()
        } catch (err) {
          ToastManager.error('删除失败: ' + err.message)
        }
      }
    })
  })
}

// --- Utilities ---
function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(2)} ${units[i]}`
}

// --- Event binding ---
if (selectFileBtn) selectFileBtn.addEventListener('click', selectFile)
if (fileInput) fileInput.addEventListener('change', handleFileSelection)
if (publishBtn) publishBtn.addEventListener('click', publish)
if (downloadBtn) downloadBtn.addEventListener('click', download)
if (refreshPublishedBtn) refreshPublishedBtn.addEventListener('click', refreshPublishedFilesList)

// --- Start ---
connectWebSocket()
init()
