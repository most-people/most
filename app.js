/* global Pear */

console.log('App.js UI 逻辑加载中 (IPC 模式)...');

// --- UI 元素引用 ---
const nodeIdEl = document.getElementById('nodeId');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const manualPathInput = document.getElementById('manualPathInput');
const filePathInput = document.getElementById('filePathInput');
const publishBtn = document.getElementById('publishBtn');
const publishResult = document.getElementById('publishResult');
const linkInput = document.getElementById('linkInput');
const downloadBtn = document.getElementById('downloadBtn');
const downloadResult = document.getElementById('downloadResult');
const taskStatus = document.getElementById('taskStatus');

// --- IPC 消息处理 ---
// 监听来自主进程的消息
Pear.messages((msg) => {
    // console.log('(Renderer) 收到主进程消息:', msg);
    const { type, key, id, message, error, fileName, buffer, status } = msg;

    if (type === 'node-id') {
        if (nodeIdEl) nodeIdEl.innerText = `P2P 节点 ID: ${id}`;
    }

    if (type === 'file-selected') {
        const { filePath, fileName } = msg;
        currentFile = { path: filePath, name: fileName }; // 模拟 File 对象
        
        if (selectedFileInfo) {
            selectedFileInfo.style.display = 'block';
            selectedFileInfo.innerText = `已选择: ${fileName} (${filePath})`;
        }
    }

    if (type === 'publish-success') {
        publishBtn.disabled = false;
        const link = `most://${key}`;
        publishResult.innerHTML = `
            <p class="success">发布成功！</p>
            <p>文件: ${fileName}</p>
            <p>链接: <code>${link}</code></p>
            <button onclick="navigator.clipboard.writeText('${link}')">复制链接</button>
        `;
    }

    if (type === 'download-status') {
        const statusDiv = document.getElementById('taskStatus');
        if (statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.innerText = status;
        }
    }

    if (type === 'download-file-received') {
        downloadResult.innerHTML += `<p class="success">已接收文件: ${fileName}</p>`;
        downloadResult.innerHTML += `<p class="success">保存路径: ${msg.savedPath}</p>`;
    }

    if (type === 'download-success') {
        downloadBtn.disabled = false;
        downloadResult.innerHTML += `<p class="success">所有文件下载完成！</p>`;
        if (taskStatus) taskStatus.innerText = '下载任务完成';
    }

    if (type === 'error') {
        publishBtn.disabled = false;
        downloadBtn.disabled = false;
        alert('主进程错误: ' + (message || error));
        publishResult.innerHTML = `<p class="error">操作失败</p>`;
    }
});

// --- 初始化 ---
async function init() {
    // 请求主进程提供节点 ID
    Pear.message({ type: 'get-node-id' });
}

init();

// --- UI 事件函数 ---

let currentFile = null;

if (dropZone) {
    dropZone.addEventListener('click', () => {
        // 先尝试触发 input
        if (fileInput) fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files.length > 0) {
            handleFileSelection(fileInput.files[0]);
        }
    });
}

function handleFileSelection(file) {
    currentFile = file;
    // 尝试获取路径，优先使用 path (Electron/Pear), 其次是 webkitRelativePath
    // 在 Pear 的 drag-and-drop 事件中，File 对象通常会保留 path 属性
    let path = file.path || (file.electron && file.electron.path);
    
    // UI 重置
    if (manualPathInput) manualPathInput.style.display = 'none';
    if (filePathInput) filePathInput.value = '';

    if (selectedFileInfo) {
        selectedFileInfo.style.display = 'block';
        selectedFileInfo.innerText = `已选择: ${file.name}`;
    }

    // 如果没有路径，显示手动输入框
    if (!path) {
        if (manualPathInput) {
            manualPathInput.style.display = 'block';
            if (filePathInput) filePathInput.focus();
        }
    } else {
        // 如果有路径，自动填入（也可以隐藏）
        if (filePathInput) filePathInput.value = path;
    }
}

async function publish() {
    if (!currentFile) return alert('请先选择或拖拽一个文件');

    // 检查路径
    let filePath = currentFile.path || (currentFile.electron && currentFile.electron.path);
    
    // 如果没有自动获取到路径，尝试从手动输入框获取
    if (!filePath && filePathInput && filePathInput.value.trim()) {
        filePath = filePathInput.value.trim().replace(/"/g, ''); // 去除可能包含的引号
    }

    if (!filePath) {
        return alert('无法获取文件路径。请在下方输入框中手动粘贴文件的完整路径。');
    }

    publishBtn.disabled = true;
    publishResult.innerHTML = '正在将文件发送到主进程进行发布...';

    try {
        // 通过 IPC 将文件路径发送给主进程
        Pear.message({
            type: 'publish-file',
            payload: {
                name: currentFile.name,
                filePath: filePath
            }
        });
    } catch (err) {
        console.error('UI 发布错误:', err);
        publishBtn.disabled = false;
        publishResult.innerHTML = `<p class="error">读取文件失败: ${err.message}</p>`;
    }
}

async function download() {
    const link = linkInput.value.trim();
    if (!link) return alert('请输入 most:// 链接');

    downloadBtn.disabled = true;
    downloadResult.innerHTML = '正在请求主进程下载...';
    if (taskStatus) {
        taskStatus.style.display = 'block';
        taskStatus.innerText = '准备开始...';
    }

    try {
        Pear.message({
            type: 'download-file',
            payload: { link }
        });
    } catch (err) {
        console.error('UI 下载错误:', err);
        downloadBtn.disabled = false;
        downloadResult.innerHTML = `<p class="error">请求失败: ${err.message}</p>`;
    }
}

if (publishBtn) publishBtn.addEventListener('click', publish);
if (downloadBtn) downloadBtn.addEventListener('click', download);
