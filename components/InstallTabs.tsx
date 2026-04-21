'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useClipboard } from '../hooks'

const tabs = [
  { id: 'npx', label: 'npx', command: 'npx most-box@latest' },
  {
    id: 'curl',
    label: 'curl',
    command: 'curl -fsSL https://most.box/install | bash',
  },
  {
    id: 'docker',
    label: 'Docker',
    command: 'docker run -p 1976:1976 most-box',
  },
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
        <button
          className={`mkt-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          aria-label="复制命令"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}
