// Most Box Desktop - Renderer Process
// Uses Electron's preload IPC bridge (window.mostBox)

// IPC message type constants (must match main process)
const IPC = {
  GET_NODE_ID: 'get-node-id',
  NODE_ID: 'node-id',
  PUBLISH_FILE: 'publish-file',
  PUBLISH_SUCCESS: 'publish-success',
  DOWNLOAD_FILE: 'download-file',
  DOWNLOAD_STATUS: 'download-status',
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_FILE_RECEIVED: 'download-file-received',
  DOWNLOAD_SUCCESS: 'download-success',
  LIST_PUBLISHED_FILES: 'list-published-files',
  DELETE_PUBLISHED_FILE: 'delete-published-file',
  GET_NETWORK_STATUS: 'get-network-status',
  PUBLISHED_FILES_LIST: 'published-files-list',
  NETWORK_STATUS: 'network-status',
  ERROR: 'error'
}

// --- Toast 通知组件 ---
const ToastManager = {
  container: null,
  
  init() {
    if (this.container) return
    this.container = document.createElement('div')
    this.container.id = 'toast-container'
    this.container.style.cssText = `
      position: fixed;
      top: 52px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
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
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
      max-width: 350px;
    `
    toast.textContent = message
    
    // Add animation keyframes
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style')
      style.id = 'toast-styles'
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `
      document.head.appendChild(style)
    }
    
    this.container.appendChild(toast)
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards'
      setTimeout(() => toast.remove(), 300)
    }, duration)
  },
  
  success(msg) { this.show(msg, 'success') },
  error(msg) { this.show(msg, 'error', 6000) },
  warning(msg) { this.show(msg, 'warning') },
  info(msg) { this.show(msg, 'info') }
}

// --- 主题管理 ---
const ThemeManager = {
  currentTheme: 'system',
  
  init() {
    const saved = localStorage.getItem('theme')
    if (saved) {
      this.currentTheme = saved
    }
    
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
    
    if (themeSystem) {
      themeSystem.addEventListener('click', () => this.setTheme('system'))
    }
    if (themeLight) {
      themeLight.addEventListener('click', () => this.setTheme('light'))
    }
    if (themeDark) {
      themeDark.addEventListener('click', () => this.setTheme('dark'))
    }
  },
  
  setTheme(theme) {
    this.currentTheme = theme
    localStorage.setItem('theme', theme)
    this.applyTheme(theme)
    this.updateButtonStates()
  },
  
  applyTheme(theme) {
    let effectiveTheme = theme
    
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    
    document.documentElement.setAttribute('data-theme', effectiveTheme)
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
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.currentTheme === 'system') {
        this.applyTheme('system')
      }
    })
  }
}

ThemeManager.init()

// --- 窗口控制 ---
const WindowControls = {
  init() {
    const closeBtn = document.getElementById('closeBtn')
    const minimizeBtn = document.getElementById('minimizeBtn')
    const maximizeBtn = document.getElementById('maximizeBtn')
    
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.close()
      })
    }
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.minimize()
      })
    }
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.toggleMaximize()
      })
    }
  },
  
  close() {
    window.mostBox.closeWindow()
  },
  
  minimize() {
    window.mostBox.minimizeWindow()
  },
  
  toggleMaximize() {
    window.mostBox.maximizeWindow()
  }
}

// 监听 engine 初始化完成事件
let initCalled = false
window.mostBox.onEngineReady(() => {
  if (!initCalled) {
    initCalled = true
    init()
  }
})

// 初始化窗口控制
WindowControls.init()

// 延迟检查，以防事件已经发送过了
setTimeout(() => {
  if (!initCalled) {
    initCalled = true
    init()
  }
}, 1000)

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

let currentFile = null

// --- 监听主进程推送的事件 ---

window.mostBox.onDownloadProgress((data) => {
  updateProgressBar(data.percent)
  if (taskStatus) {
    taskStatus.style.display = 'block'
    taskStatus.innerText = `正在下载... ${data.percent}%`
  }
})

window.mostBox.onDownloadStatus((data) => {
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
})

window.mostBox.onDownloadSuccess((data) => {
  downloadBtn.disabled = false
  downloadResult.innerHTML += `<p class="success">已接收文件: ${escapeHtml(data.fileName)}</p>`
  downloadResult.innerHTML += `<p class="success">保存路径: ${escapeHtml(data.savedPath)}</p>`
  ProgressBar.setPercent(100)
  ToastManager.success('文件下载完成!')
})

window.mostBox.onPublishSuccess((data) => {
  publishBtn.disabled = false
  const link = data.link
  publishResult.innerHTML = `
    <p class="success">发布成功！</p>
    <p>文件: ${escapeHtml(data.fileName)}</p>
    <p>链接: <code>${escapeHtml(link)}</code></p>
    <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
  `
  ToastManager.success('文件发布成功!')
  refreshPublishedFilesList()
})

window.mostBox.onPublishProgress((data) => {
  if (data.stage === 'calculating-cid') {
    publishResult.innerHTML = '正在计算文件哈希...'
  } else if (data.stage === 'uploading') {
    publishResult.innerHTML = '正在上传到 P2P 网络...'
  }
})

window.mostBox.onNetworkStatus((data) => {
  if (networkStatusEl) {
    const statusText = data.peers > 0 ? `已连接 ${data.peers} 个节点` : '等待连接中...'
    networkStatusEl.innerText = statusText
    networkStatusEl.style.color = data.peers > 0 ? '#34c759' : '#ff9500'
  }
})

// --- 初始化 ---

async function init() {
  try {
    const nodeResult = await window.mostBox.getNodeId()
    if (nodeIdEl && nodeResult.id) {
      nodeIdEl.innerText = `P2P 节点 ID: ${nodeResult.id}`
    }
  } catch (err) {
    console.error('获取节点 ID 失败:', err)
    if (nodeIdEl) nodeIdEl.innerText = 'P2P 节点初始化失败'
  }
  
  refreshPublishedFilesList()
  
  // 启动网络诊断
  await checkNetworkOnStartup()
  
  // 定期刷新网络状态
  setInterval(refreshNetworkStatus, 10000)
}

// --- 启动时网络检测 ---

async function checkNetworkOnStartup() {
  if (networkStatusEl) {
    networkStatusEl.innerText = '正在初始化 P2P 网络...'
    networkStatusEl.style.color = '#ff9500'
  }
  
  try {
    // 等待一下让引擎初始化
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const status = await window.mostBox.getNetworkStatus()
    
    if (status.peers > 0) {
      networkStatusEl.innerText = `已连接 ${status.peers} 个节点`
      networkStatusEl.style.color = '#34c759'
    } else {
      networkStatusEl.innerText = 'P2P 网络已启动，等待连接...'
      networkStatusEl.style.color = '#ff9500'
      ToastManager.info('P2P 网络已启动，发布或下载文件后将自动连接')
    }
  } catch (err) {
    console.error('网络检测失败:', err)
    if (networkStatusEl) {
      networkStatusEl.innerText = '网络检测失败'
      networkStatusEl.style.color = '#ff3b30'
    }
  }
  
  // 继续刷新状态
  refreshNetworkStatus()
}

// --- 网络状态刷新 ---

async function refreshNetworkStatus() {
  try {
    const status = await window.mostBox.getNetworkStatus()
    if (networkStatusEl) {
      if (status.peers > 0) {
        networkStatusEl.innerText = `已连接 ${status.peers} 个节点`
        networkStatusEl.style.color = '#34c759'
      } else {
        networkStatusEl.innerText = 'P2P 网络已启动，等待节点发现...'
        networkStatusEl.style.color = '#ff9500'
      }
    }
  } catch (err) {
    console.error('获取网络状态失败:', err)
  }
}

// --- 文件选择与发布 ---

function selectFile() {
  if (fileInput) fileInput.click()
}

async function handleFileSelection(event) {
  const file = event.target.files[0]
  if (!file) return

  try {
    // 使用 Electron 33+ 的 webUtils.getPathForFile 获取文件路径
    const filePath = window.mostBox.getFilePath(file)
    
    currentFile = { path: filePath, name: file.name }
    
    if (selectedFileInfo) {
      selectedFileInfo.style.display = 'block'
      selectedFileInfo.innerText = `已选择: ${file.name}\n路径: ${filePath}`
    }
    publishBtn.disabled = false
  } catch (err) {
    console.error('获取文件路径失败:', err)
    ToastManager.error('无法获取文件路径: ' + err.message)
  }
}

async function publish() {
  if (!currentFile) {
    ToastManager.warning('请先选择文件')
    return
  }

  publishBtn.disabled = true
  publishResult.innerHTML = '正在发布...'
  ToastManager.info('正在计算文件哈希并发布...')

  try {
    const result = await window.mostBox.publishFile(currentFile.path, currentFile.name)
    
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
      throw new Error(result.error || result.code || '未知错误')
    }
  } catch (err) {
    console.error('发布错误:', err)
    publishBtn.disabled = false
    publishResult.innerHTML = `<p class="error">发布失败: ${escapeHtml(err.message)}</p>`
    ToastManager.error('发布失败: ' + err.message)
  } finally {
    publishBtn.disabled = false
  }
}

// --- 文件下载 ---

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
    const result = await window.mostBox.downloadFile(link)
    
    if (result.success) {
      if (result.alreadyExists) {
        downloadResult.innerHTML = `
          <p class="success">文件已存在！</p>
          <p>文件: ${escapeHtml(result.fileName)}</p>
          <p>该文件已在已发布文件列表中</p>
        `
        ToastManager.info('文件已存在，无需重复下载')
      } else {
        downloadResult.innerHTML = `
          <p class="success">下载成功！</p>
          <p>文件: ${escapeHtml(result.fileName)}</p>
          <p>已添加到已发布文件列表</p>
        `
        ToastManager.success('文件下载完成!')
        refreshPublishedFilesList()
      }
    } else {
      throw new Error(result.error || result.code || '下载失败')
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

// --- 已发布文件列表功能 ---

async function refreshPublishedFilesList() {
  try {
    const result = await window.mostBox.listPublishedFiles()
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
          <button class="btn-save-as" data-cid="${escapeHtml(file.cid)}">另存为</button>
          <button class="btn-delete" data-cid="${escapeHtml(file.cid)}">删除</button>
        </div>
      </li>
    `
  }
  html += '</ul>'
  publishedFilesList.innerHTML = html

  // 绑定复制按钮事件
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

  // 绑定另存为按钮事件
  publishedFilesList.querySelectorAll('.btn-save-as').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.getAttribute('data-cid')
      try {
        const result = await window.mostBox.saveAsFile(cid)
        if (result.success) {
          ToastManager.success('文件已保存到: ' + result.savedPath)
        } else {
          ToastManager.error('保存失败: ' + result.error)
        }
      } catch (err) {
        ToastManager.error('保存失败: ' + err.message)
      }
    })
  })

  // 绑定删除按钮事件
  publishedFilesList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.getAttribute('data-cid')
      if (confirm('确定要从列表中删除该发布记录吗？')) {
        try {
          await window.mostBox.deletePublishedFile(cid)
          ToastManager.info('已删除发布记录')
          refreshPublishedFilesList()
        } catch (err) {
          ToastManager.error('删除失败: ' + err.message)
        }
      }
    })
  })
}

// --- 进度条工具函数 ---

const ProgressBar = {
  element: null,
  
  getOrCreate() {
    if (this.element) return this.element
    
    let progressContainer = document.getElementById('progress-container')
    if (!progressContainer) {
      progressContainer = document.createElement('div')
      progressContainer.id = 'progress-container'
      progressContainer.style.cssText = `
        margin-top: 12px;
        width: 100%;
      `
      
      const progressBar = document.createElement('div')
      progressBar.id = 'progress-bar'
      progressBar.style.cssText = `
        height: 8px;
        background: #e5e5ea;
        border-radius: 4px;
        overflow: hidden;
      `
      
      const progressFill = document.createElement('div')
      progressFill.id = 'progress-fill'
      progressFill.style.cssText = `
        height: 100%;
        width: 0%;
        background: #0071e3;
        border-radius: 4px;
        transition: width 0.3s ease;
      `
      
      progressBar.appendChild(progressFill)
      progressContainer.appendChild(progressBar)
      
      const downloadResultEl = document.getElementById('downloadResult')
      if (downloadResultEl && downloadResultEl.parentNode) {
        downloadResultEl.parentNode.insertBefore(progressContainer, downloadResultEl.nextSibling)
      }
    }
    
    this.element = document.getElementById('progress-fill')
    return this.element
  },
  
  setPercent(percent) {
    const el = this.getOrCreate()
    if (el) {
      el.style.width = Math.min(100, Math.max(0, percent)) + '%'
    }
  },
  
  reset() {
    this.setPercent(0)
  },
  
  hide() {
    const container = document.getElementById('progress-container')
    if (container) container.style.display = 'none'
  },
  
  show() {
    const container = document.getElementById('progress-container')
    if (container) container.style.display = 'block'
  }
}

function updateProgressBar(percent) {
  ProgressBar.setPercent(percent)
}

// --- 工具函数 ---

function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// --- 事件绑定 ---

if (selectFileBtn) selectFileBtn.addEventListener('click', selectFile)
if (fileInput) fileInput.addEventListener('change', handleFileSelection)
if (publishBtn) publishBtn.addEventListener('click', publish)
if (downloadBtn) downloadBtn.addEventListener('click', download)
if (refreshPublishedBtn) refreshPublishedBtn.addEventListener('click', refreshPublishedFilesList)