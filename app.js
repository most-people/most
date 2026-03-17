/* global Pear */

import ui from 'pear-electron'

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

let currentFile = null

Pear.messages((msg) => {
    const { type, key, id, message, error, fileName, filePath, status } = msg

    if (type === 'node-id') {
        if (nodeIdEl) nodeIdEl.innerText = `P2P 节点 ID: ${id}`
    }

    if (type === 'publish-success') {
        publishBtn.disabled = false
        const link = `most://${key}`
        publishResult.innerHTML = `
            <p class="success">发布成功！</p>
            <p>文件: ${fileName}</p>
            <p>链接: <code>${link}</code></p>
            <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
        `
    }

    if (type === 'download-status') {
        const statusDiv = document.getElementById('taskStatus')
        if (statusDiv) {
            statusDiv.style.display = 'block'
            statusDiv.innerText = status
        }
    }

    if (type === 'download-file-received') {
        downloadResult.innerHTML += `<p class="success">已接收文件: ${fileName}</p>`
        downloadResult.innerHTML += `<p class="success">保存路径: ${msg.savedPath}</p>`
    }

    if (type === 'download-success') {
        downloadBtn.disabled = false
        downloadResult.innerHTML += `<p class="success">所有文件下载完成！</p>`
        if (taskStatus) taskStatus.innerText = '下载任务完成'
    }

    if (type === 'error') {
        publishBtn.disabled = false
        downloadBtn.disabled = false
        alert('主进程错误: ' + (message || error))
        publishResult.innerHTML = `<p class="error">操作失败</p>`
    }
})

async function init() {
    Pear.message({ type: 'get-node-id' })
}

init()

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
        Pear.message({
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
        Pear.message({
            type: 'download-file',
            payload: { link }
        })
    } catch (err) {
        console.error('UI 下载错误:', err)
        downloadBtn.disabled = false
        downloadResult.innerHTML = `<p class="error">请求失败: ${err.message}</p>`
    }
}

if (selectFileBtn) selectFileBtn.addEventListener('click', selectFile)
if (fileInput) fileInput.addEventListener('change', handleFileSelection)
if (publishBtn) publishBtn.addEventListener('click', publish)
if (downloadBtn) downloadBtn.addEventListener('click', download)
