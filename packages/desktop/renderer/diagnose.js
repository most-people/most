// Most Box Network Diagnostics - Renderer Process

// --- Theme Management ---
const ThemeManager = {
  currentTheme: 'system',
  
  init() {
    const saved = localStorage.getItem('theme');
    if (saved) {
      this.currentTheme = saved;
    }
    
    this.applyTheme(this.currentTheme);
    this.bindButtons();
    
    if (this.currentTheme === 'system') {
      this.watchSystemTheme();
    }
  },
  
  bindButtons() {
    const themeSystem = document.getElementById('themeSystem');
    const themeLight = document.getElementById('themeLight');
    const themeDark = document.getElementById('themeDark');
    
    if (themeSystem) {
      themeSystem.addEventListener('click', () => this.setTheme('system'));
    }
    if (themeLight) {
      themeLight.addEventListener('click', () => this.setTheme('light'));
    }
    if (themeDark) {
      themeDark.addEventListener('click', () => this.setTheme('dark'));
    }
  },
  
  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme(theme);
    this.updateButtonStates();
  },
  
  applyTheme(theme) {
    let effectiveTheme = theme;
    
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    this.updateButtonStates();
  },
  
  updateButtonStates() {
    const themeSystem = document.getElementById('themeSystem');
    const themeLight = document.getElementById('themeLight');
    const themeDark = document.getElementById('themeDark');
    
    if (themeSystem) themeSystem.classList.toggle('active', this.currentTheme === 'system');
    if (themeLight) themeLight.classList.toggle('active', this.currentTheme === 'light');
    if (themeDark) themeDark.classList.toggle('active', this.currentTheme === 'dark');
  },
  
  watchSystemTheme() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.currentTheme === 'system') {
        this.applyTheme('system');
      }
    });
  }
}

ThemeManager.init();

// --- Window Controls ---
const WindowControls = {
  init() {
    const closeBtn = document.getElementById('closeBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.minimize();
      });
    }
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMaximize();
      });
    }
  },
  
  close() {
    window.mostBox.closeWindow();
  },
  
  minimize() {
    window.mostBox.minimizeWindow();
  },
  
  toggleMaximize() {
    window.mostBox.maximizeWindow();
  }
}

WindowControls.init();

// --- Diagnostic Functions ---
const Diagnostics = {
  results: null,
  
  async run() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsContent = document.getElementById('resultsContent');
    const logArea = document.getElementById('logArea');
    const runBtn = document.getElementById('runDiagnosis');
    
    loadingIndicator.classList.remove('hidden');
    resultsContent.classList.add('hidden');
    logArea.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.textContent = '诊断中...';
    
    try {
      this.results = await window.mostBox.diagnoseNetwork();
      this.displayResults();
      this.showSolutions();
    } catch (err) {
      console.error('Diagnosis failed:', err);
      logArea.textContent = `诊断失败: ${err.message}`;
      logArea.classList.remove('hidden');
    } finally {
      loadingIndicator.classList.add('hidden');
      runBtn.disabled = false;
      runBtn.textContent = '开始诊断';
    }
  },
  
  displayResults() {
    const resultsContent = document.getElementById('resultsContent');
    resultsContent.classList.remove('hidden');
    
    // Update peer count
    const peerCount = document.getElementById('peerCount');
    const peerStatus = document.getElementById('peerStatus');
    peerCount.textContent = this.results.peerCount;
    
    if (this.results.peerCount > 0) {
      peerStatus.textContent = '已连接';
      peerStatus.className = 'status-badge status-success';
    } else {
      peerStatus.textContent = '未连接';
      peerStatus.className = 'status-badge status-warning';
    }
    
    // Build results HTML
    let html = '';
    
    // Basic connectivity
    html += this.createDiagnosticItem(
      '基本网络连接',
      this.results.basicConnectivity?.success,
      this.results.basicConnectivity?.success ? '正常' : '异常'
    );
    
    // DNS resolution
    html += this.createDiagnosticItem(
      'DNS 解析',
      this.results.dnsResolution?.success,
      this.results.dnsResolution?.success ? '正常' : '失败'
    );
    
    // DHT bootstrap nodes
    html += this.createDiagnosticItem(
      'DHT 引导节点',
      this.results.dhtBootstrap?.success,
      this.results.dhtBootstrap?.success ? 
        `${this.results.dhtBootstrap.reachableNodes.length}/${this.results.dhtBootstrap.totalNodes} 可达` : 
        '全部不可达'
    );
    
    // Show suggestions if any
    if (this.results.suggestions && this.results.suggestions.length > 0) {
      html += `
        <div class="diagnostic-item">
          <div class="diagnostic-label">建议</div>
          <div class="diagnostic-value">
            <ul class="suggestion-list">
              ${this.results.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }
    
    resultsContent.innerHTML = html;
  },
  
  createDiagnosticItem(label, isSuccess, statusText) {
    const statusClass = isSuccess ? 'status-success' : 'status-error';
    return `
      <div class="diagnostic-item">
        <div class="diagnostic-label">${label}</div>
        <div class="diagnostic-value">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  },
  
  showSolutions() {
    const solutionsCard = document.getElementById('solutionsCard');
    const solutionsContent = document.getElementById('solutionsContent');
    
    const solutions = [];
    
    if (!this.results.basicConnectivity?.success) {
      solutions.push({
        title: '网络连接问题',
        items: [
          '检查网线是否连接正常',
          '尝试重启路由器',
          '联系网络运营商'
        ]
      });
    }
    
    if (!this.results.dnsResolution?.success) {
      solutions.push({
        title: 'DNS 解析失败',
        items: [
          '更改 DNS 服务器为 8.8.8.8 或 114.114.114.114',
          '打开命令提示符运行: ipconfig /flushdns',
          '重启网络适配器'
        ]
      });
    }
    
    if (!this.results.dhtBootstrap?.success) {
      solutions.push({
        title: 'DHT 引导节点不可达',
        items: [
          '检查防火墙设置，允许 MostBox 通过',
          '在防火墙中添加端口 49737 和 6881 的入站规则',
          '尝试暂时禁用防火墙测试连接',
          '如果使用公司网络，联系网络管理员'
        ]
      });
    }
    
    if (this.results.peerCount === 0) {
      solutions.push({
        title: '未找到发布者节点',
        items: [
          '确保文件发布者在线',
          '等待几分钟后重试（节点发现需要时间）',
          '检查链接是否正确',
          '尝试使用其他网络（如手机热点）'
        ]
      });
    }
    
    if (solutions.length === 0) {
      solutionsCard.style.display = 'none';
      return;
    }
    
    let html = '';
    for (const solution of solutions) {
      html += `
        <div class="solution-card">
          <div class="solution-title">${solution.title}</div>
          <ul class="solution-list">
            ${solution.items.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    solutionsContent.innerHTML = html;
    solutionsCard.style.display = 'block';
  },
  
  async checkFirewall() {
    const logArea = document.getElementById('logArea');
    logArea.classList.remove('hidden');
    logArea.textContent = '正在检查防火墙规则...\n';
    
    try {
      const results = await window.mostBox.checkFirewall();
      
      logArea.textContent += '\n=== 防火墙规则检查结果 ===\n\n';
      logArea.textContent += `Node.js 规则: ${results.nodeJsRule ? '✓ 已配置' : '✗ 未配置'}\n`;
      logArea.textContent += `端口 49737 规则: ${results.port49737Rule ? '✓ 已配置' : '✗ 未配置'}\n`;
      logArea.textContent += `端口 6881 规则: ${results.port6881Rule ? '✓ 已配置' : '✗ 未配置'}\n`;
      
      if (!results.nodeJsRule || !results.port49737Rule || !results.port6881Rule) {
        logArea.textContent += '\n建议:\n';
        if (!results.nodeJsRule) {
          logArea.textContent += '- 需要添加 Node.js 到防火墙允许列表\n';
        }
        if (!results.port49737Rule) {
          logArea.textContent += '- 需要允许端口 49737 (Hyperswarm)\n';
        }
        if (!results.port6881Rule) {
          logArea.textContent += '- 需要允许端口 6881 (DHT)\n';
        }
      }
      
      // Add general firewall advice
      logArea.textContent += '\n=== 防火墙配置建议 ===\n\n';
      logArea.textContent += '1. 打开 Windows 防火墙高级设置\n';
      logArea.textContent += '2. 创建入站规则允许以下端口:\n';
      logArea.textContent += '   - TCP 49737 (Hyperswarm)\n';
      logArea.textContent += '   - UDP 6881 (DHT)\n';
      logArea.textContent += '3. 创建出站规则允许相同端口\n';
      logArea.textContent += '4. 允许 Node.js 应用程序通过防火墙\n';
      
    } catch (err) {
      logArea.textContent += `\n检查失败: ${err.message}\n`;
      logArea.textContent += '\n手动检查防火墙:\n';
      logArea.textContent += '1. 打开控制面板 -> 系统和安全 -> Windows Defender 防火墙\n';
      logArea.textContent += '2. 点击"允许应用或功能通过 Windows Defender 防火墙"\n';
      logArea.textContent += '3. 确保 MostBox 或 Node.js 在允许列表中\n';
    }
  },
  
};

// --- Event Bindings ---
document.getElementById('runDiagnosis').addEventListener('click', () => Diagnostics.run());
document.getElementById('checkFirewall').addEventListener('click', () => Diagnostics.checkFirewall());

// --- Initialization ---
async function init() {
  try {
    // Get network status
    const status = await window.mostBox.getNetworkStatus();
    const peerCount = document.getElementById('peerCount');
    const peerStatus = document.getElementById('peerStatus');
    
    peerCount.textContent = status.peers;
    
    if (status.peers > 0) {
      peerStatus.textContent = '已连接';
      peerStatus.className = 'status-badge status-success';
    } else {
      peerStatus.textContent = '未连接';
      peerStatus.className = 'status-badge status-warning';
    }
  } catch (err) {
    console.error('Initialization failed:', err);
  }
}

init();