'use client'

import { useState } from 'react'
import { useClipboard } from '../hooks'

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="square">
      <path d="M3 8.5L6.5 12L13 4.5" />
    </svg>
  )
}

const tabs = [
  { id: 'npx', label: 'npx', command: 'npx most-box@latest' },
  { id: 'curl', label: 'curl', command: 'curl -fsSL https://most.box/install | bash' },
  { id: 'docker', label: 'Docker', command: 'docker run -p 1976:1976 most-box' },
]

export function InstallTabs() {
  const [activeTab, setActiveTab] = useState('npx')
  const { copy, copied } = useClipboard({ timeout: 1500 })

  const activeCommand = tabs.find(t => t.id === activeTab)!.command

  const handleCopy = () => {
    copy(activeCommand)
  }

  return (
    <div className="mkt-install-tabs">
      <div className="mkt-tab-bar" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mkt-tab-panel" role="tabpanel">
        <code>{activeCommand}</code>
        <button className={`mkt-copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} aria-label="复制命令">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}