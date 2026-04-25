'use client'

import React, { useState } from 'react'
import { ArrowLeft, Sun, Moon } from 'lucide-react'
import AppShell from '~/components/AppShell'
import { useApp } from '~/app/app/AppProvider'
import { LotteryDashboard } from '~/components/lottery/LotteryDashboard'
import { BuyTickets } from '~/components/lottery/BuyTickets'
import { TicketCard } from '~/components/lottery/TicketCard'
import { PrizeTier } from '~/components/lottery/PrizeTier'
import { HistoryPanel } from '~/components/lottery/HistoryPanel'

type TabId = 'dashboard' | 'tickets' | 'history'

export default function LotteryPage() {
  const { isDarkMode, setIsDarkMode } = useApp()
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  const tabs = [
    { id: 'dashboard' as TabId, label: '仪表盘' },
    { id: 'tickets' as TabId, label: '我的彩票' },
    { id: 'history' as TabId, label: '开奖历史' },
  ]

  return (
    <AppShell
      showBackendWarning={false}
      sidebar={({ closeSidebar }) => (
        <>
          <div className="sidebar-header">
            <button
              className="back-btn"
              onClick={() => (window.location.href = '/')}
              title="返回首页"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <nav className="sidebar-nav">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  closeSidebar()
                }}
                className={`sidebar-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      headerTitle={<h2 className="header-title">去中心化彩票</h2>}
      headerRight={
        <button
          className="icon-btn"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="切换主题"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      }
    >
      <div className="lottery-page">
        <div className="lottery-container">
          {/* Tab Switcher */}
          <div className="lottery-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`lottery-tab ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="lottery-tab-content">
              <LotteryDashboard />
              <PrizeTier />
              <BuyTickets />
            </div>
          )}

          {/* My Tickets Tab */}
          {activeTab === 'tickets' && (
            <div className="lottery-tab-content">
              <TicketCard />
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="lottery-tab-content">
              <HistoryPanel />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
