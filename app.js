import ui from 'pear-electron'
import message from 'pear-message'
import messages from 'pear-messages'

console.log('App.js UI 逻辑加载中 (IPC 模式)...')

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

let currentFile = null

// --- 使用 pear-messages 基于模式匹配监听来自主进程的消息 ---

messages({ type: 'node-id' }, (msg) => {
    if (nodeIdEl) nodeIdEl.innerText = `P2P 节点 ID: ${msg.id}`
})

messages({ type: 'publish-success' }, (msg) => {
    publishBtn.disabled = false
    const link = `most://${msg.key}`
    publishResult.innerHTML = `
        <p class="success">发布成功！</p>
        <p>文件: ${msg.fileName}</p>
        <p>链接: <code>${link}</code></p>
        <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
    `
    // 发布成功后自动刷新已发布文件列表
    refreshPublishedFilesList()
})

messages({ type: 'download-status' }, (msg) => {
    const statusDiv = document.getElementById('taskStatus')
    if (statusDiv) {
        statusDiv.style.display = 'block'
        statusDiv.innerText = msg.status
    }
})

messages({ type: 'download-file-received' }, (msg) => {
    downloadResult.innerHTML += `<p class="success">已接收文件: ${msg.fileName}</p>`
    downloadResult.innerHTML += `<p class="success">保存路径: ${msg.savedPath}</p>`
})

messages({ type: 'download-success' }, () => {
    downloadBtn.disabled = false
    downloadResult.innerHTML += `<p class="success">所有文件下载完成！</p>`
    if (taskStatus) taskStatus.innerText = '下载任务完成'
})

messages({ type: 'published-files-list' }, (msg) => {
    renderPublishedFiles(msg.files || [])
})

messages({ type: 'error' }, (msg) => {
    publishBtn.disabled = false
    downloadBtn.disabled = false
    alert('主进程错误: ' + (msg.message || msg.error))
    publishResult.innerHTML = `<p class="error">操作失败</p>`
})

// --- 初始化 ---

async function init() {
    await message({ type: 'get-node-id' })
    // 初始化时自动加载已发布文件列表
    refreshPublishedFilesList()
}

init()

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
    if (!currentFile) return alert('请先选择文件')

    publishBtn.disabled = true
    publishResult.innerHTML = '正在发布...'

    try {
        await message({
            type: 'publish-file',
            payload: {
                name: currentFile.name,
                filePath: currentFile.path
            }
        })
    } catch (err) {
        console.error('UI 发布错误:', err)
        publishBtn.disabled = false
        publishResult.innerHTML = `<p class="error">发布失败: ${err.message}</p>`
    }
}

// --- 文件下载 ---

async function download() {
    const link = linkInput.value.trim()
    if (!link) return alert('请输入 most:// 链接')

    downloadBtn.disabled = true
    downloadResult.innerHTML = '正在请求下载...'
    if (taskStatus) {
        taskStatus.style.display = 'block'
        taskStatus.innerText = '准备开始...'
    }

    try {
        await message({
            type: 'download-file',
            payload: { link }
        })
    } catch (err) {
        console.error('UI 下载错误:', err)
        downloadBtn.disabled = false
        downloadResult.innerHTML = `<p class="error">请求失败: ${err.message}</p>`
    }
}

// --- 已发布文件列表功能 ---

async function refreshPublishedFilesList() {
    await message({ type: 'list-published-files' })
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
        // 使用 data 属性存储 link 和 cid，避免 XSS
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
                const originalText = btn.innerText
                btn.innerText = '已复制!'
                btn.style.background = '#34c759'
                setTimeout(() => {
                    btn.innerText = originalText
                    btn.style.background = ''
                }, 1500)
            })
        })
    })

    // 绑定删除按钮事件
    publishedFilesList.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cid = btn.getAttribute('data-cid')
            if (confirm('确定要从列表中删除该发布记录吗？')) {
                await message({ type: 'delete-published-file', payload: { cid } })
            }
        })
    })
}

function escapeHtml(str) {
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
