import ui from 'pear-electron'
import message from 'pear-message'
import messages from 'pear-messages'

// IPC 消息类型常量

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

// --- 窗口控制 ---
const WindowControls = {
  async init() {
    const closeBtn = document.getElementById('closeBtn')
    const minimizeBtn = document.getElementById('minimizeBtn')
    const maximizeBtn = document.getElementById('maximizeBtn')
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close())
    }
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => this.minimize())
    }
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => this.maximize())
    }
  },
  
  async close() {
    try {
      await ui.window.close()
    } catch (err) {
      console.error('关闭窗口失败:', err)
      window.close()
    }
  },
  
  async minimize() {
    try {
      await ui.window.minimize()
    } catch (err) {
      console.error('最小化失败:', err)
    }
  },
  
  async maximize() {
    try {
      const isMaximized = await ui.window.isMaximized()
      if (isMaximized) {
        await ui.window.unmaximize()
      } else {
        await ui.window.maximize()
      }
    } catch (err) {
      console.error('最大化失败:', err)
    }
  }
}

// 初始化窗口控制
WindowControls.init()

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

// --- 使用 pear-messages 基于模式匹配监听来自主进程的消息 ---

messages({ type: IPC.NODE_ID }, (msg) => {
    if (nodeIdEl) nodeIdEl.innerText = `P2P 节点 ID: ${msg.id}`
})

messages({ type: IPC.PUBLISH_SUCCESS }, (msg) => {
    publishBtn.disabled = false
    const link = `most://${msg.key}`
    publishResult.innerHTML = `
        <p class="success">发布成功！</p>
        <p>文件: ${escapeHtml(msg.fileName)}</p>
        <p>链接: <code>${escapeHtml(link)}</code></p>
        <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
    `
    ToastManager.success('文件发布成功!')
    refreshPublishedFilesList()
})

messages({ type: IPC.DOWNLOAD_STATUS }, (msg) => {
    const statusDiv = document.getElementById('taskStatus')
    if (statusDiv) {
        statusDiv.style.display = 'block'
        statusDiv.innerText = msg.status
    }
    // 更新进度条为 0
    updateProgressBar(0)
})

messages({ type: IPC.DOWNLOAD_PROGRESS }, (msg) => {
    const statusDiv = document.getElementById('taskStatus')
    if (statusDiv) {
        statusDiv.style.display = 'block'
        statusDiv.innerText = `正在下载... ${msg.percent}%`
    }
    updateProgressBar(msg.percent)
})

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
            
            const downloadResult = document.getElementById('downloadResult')
            if (downloadResult && downloadResult.parentNode) {
                downloadResult.parentNode.insertBefore(progressContainer, downloadResult.nextSibling)
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

messages({ type: IPC.DOWNLOAD_PROGRESS }, (msg) => {
    // 进度显示 (如需要可添加进度条)
    console.log(`下载进度: ${msg.loaded}/${msg.total} bytes`)
})

messages({ type: IPC.DOWNLOAD_FILE_RECEIVED }, (msg) => {
    downloadResult.innerHTML += `<p class="success">已接收文件: ${escapeHtml(msg.fileName)}</p>`
    downloadResult.innerHTML += `<p class="success">保存路径: ${escapeHtml(msg.savedPath)}</p>`
    ProgressBar.setPercent(100)
})

messages({ type: IPC.DOWNLOAD_SUCCESS }, () => {
    downloadBtn.disabled = false
    downloadResult.innerHTML += `<p class="success">所有文件下载完成！</p>`
    if (taskStatus) taskStatus.innerText = '下载任务完成'
    ToastManager.success('文件下载完成!')
    // 保持进度条显示完成状态
})

messages({ type: IPC.PUBLISHED_FILES_LIST }, (msg) => {
    renderPublishedFiles(msg.files || [])
})

messages({ type: IPC.NETWORK_STATUS }, (msg) => {
    if (networkStatusEl) {
        const statusText = msg.status === 'connected' ? `已连接 ${msg.peers} 个节点` : '等待连接中...'
        networkStatusEl.innerText = statusText
        networkStatusEl.style.color = msg.status === 'connected' ? '#34c759' : '#ff9500'
    }
})

messages({ type: IPC.ERROR }, (msg) => {
    publishBtn.disabled = false
    downloadBtn.disabled = false
    ToastManager.error(`操作失败: ${msg.message || msg.code}`)
    publishResult.innerHTML = `<p class="error">操作失败: ${escapeHtml(msg.message || '未知错误')}</p>`
})

// --- 初始化 ---

async function init() {
    await message({ type: IPC.GET_NODE_ID })
    refreshPublishedFilesList()
    // 定期更新网络状态
    refreshNetworkStatus()
    setInterval(refreshNetworkStatus, 10000)
}

init()

// --- 网络状态刷新 ---

function refreshNetworkStatus() {
    message({ type: IPC.GET_NETWORK_STATUS })
}

// --- 文件选择与发布 ---

function selectFile() {
    if (fileInput) fileInput.click()
}

async function handleFileSelection(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
        const filePath = await ui.media.getPathForFile(file)
        currentFile = { path: filePath, name: file.name }
        
        if (selectedFileInfo) {
            selectedFileInfo.style.display = 'block'
            selectedFileInfo.innerText = `已选择: ${file.name}\n路径: ${filePath}`
        }
        publishBtn.disabled = false
    } catch (err) {
        console.error('获取文件路径失败:', err)
        alert('无法获取文件路径: ' + err.message)
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
        await message({
            type: IPC.PUBLISH_FILE,
            payload: {
                name: currentFile.name,
                filePath: currentFile.path
            }
        })
    } catch (err) {
        console.error('UI 发布错误:', err)
        publishBtn.disabled = false
        publishResult.innerHTML = `<p class="error">发布失败: ${escapeHtml(err.message)}</p>`
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
        await message({
            type: IPC.DOWNLOAD_FILE,
            payload: { link }
        })
    } catch (err) {
        console.error('UI 下载错误:', err)
        downloadBtn.disabled = false
        downloadResult.innerHTML = `<p class="error">请求失败: ${escapeHtml(err.message)}</p>`
        ProgressBar.hide()
    }
}

// --- 已发布文件列表功能 ---

async function refreshPublishedFilesList() {
    await message({ type: IPC.LIST_PUBLISHED_FILES })
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

    // 绑定删除按钮事件
    publishedFilesList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cid = btn.getAttribute('data-cid')
            if (confirm('确定要从列表中删除该发布记录吗？')) {
                await message({ type: IPC.DELETE_PUBLISHED_FILE, payload: { cid } })
                ToastManager.info('已删除发布记录')
            }
        })
    })
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
