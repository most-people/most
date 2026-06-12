import '~/styles/portal.css'
import '~/styles/marketing.css'
import '~/styles/chat.css'
import '~/styles/demo.css'

import { type ReactNode, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Cloud,
  Code,
  Eye,
  FileText,
  Folder,
  Info,
  LogIn,
  MessageSquare,
  Moon,
  MousePointerClick,
  Palette,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Sun,
  Type,
  Wifi,
} from 'lucide-react'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { CopyButton } from '~/components/CopyButton'
import { ChatAttachmentCard } from '~/components/ChatAttachmentCard'
import {
  ChannelMemberGrid,
  ChatAttachmentBubble,
  ChatChannelNavItem,
  ChatComposer,
  ChatMessageItem,
  ChatTextBubble,
} from '~/components/ChatUi'
import ConnectModal from '~/components/ConnectModal'
import { EmptyState } from '~/components/EmptyState'
import { Footer } from '~/components/Footer'
import { FileCard, FolderCard } from '~/components/AppFileCards'
import { LogoIcon } from '~/components/icons/LogoIcon'
import { KeyCard } from '~/components/KeyCard'
import { MoveModal } from '~/components/MoveModal'
import { Nav } from '~/components/Nav'
import { NoteMoreMenu } from '~/components/NoteMoreMenu'
import { NoteMoveModal } from '~/components/NoteMoveModal'
import { NoteSidebar } from '~/components/NoteSidebar'
import { PemBlock } from '~/components/PemBlock'
import { ConfirmModal, InputModal, ModalOverlay, Toast } from '~/components/ui'
import UserLoginModal from '~/components/UserLoginModal'
import { generateAvatar } from '~/server/src/utils/avatar.js'

type DemoToast = {
  id: number
  message: string
  type: string
}

const demoNoteTarget = {
  name: '产品计划.md',
  cid: 'bafy-demo-note',
  path: '产品/计划',
  content: '# MostBox Demo',
  size: 2048,
  type: 'file' as const,
  created_at: 1764547200000,
  updated_at: 1764547200000,
}

const demoNoteDirectories = [
  { path: '产品', name: '产品', parentPath: '', depth: 0 },
  { path: '产品/计划', name: '计划', parentPath: '产品', depth: 1 },
  { path: '产品/摘录', name: '摘录', parentPath: '产品', depth: 1 },
  { path: '灵感', name: '灵感', parentPath: '', depth: 0 },
]

function DemoSection({
  id,
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  icon: ReactNode
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="demo-section" id={id}>
      <div className="demo-section-heading">
        <div className="demo-section-icon">{icon}</div>
        <div>
          <p className="demo-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function DemoCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const cardClassName = className
    ? `demo-surface ${className}`
    : 'demo-surface'

  return (
    <article className={cardClassName}>
      <h3>{title}</h3>
      {children}
    </article>
  )
}

export default function DemoPage() {
  const [demoDownloadSource, setDemoDownloadSource] = useState<'r2' | 'github'>(
    'r2'
  )
  const [demoChatMessage, setDemoChatMessage] = useState('今晚同步频道状态')
  const [showOverlay, setShowOverlay] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showNoteMoveModal, setShowNoteMoveModal] = useState(false)
  const [toasts, setToasts] = useState<DemoToast[]>([])
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  function pushToast(type: string, message: string) {
    setToasts(prev => [
      ...prev.slice(-4),
      {
        id: Date.now(),
        type,
        message,
      },
    ])
  }

  function removeToast(id: number) {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <main className="demo-page">
      <header className="demo-topbar">
        <a className="mkt-nav-logo" href="/">
          <ArrowLeft size={18} />
          <span>MOST PEOPLE</span>
        </a>
        <button
          type="button"
          className="mkt-theme-toggle"
          onClick={() => setIsDarkMode(!isDarkMode)}
          aria-label="切换主题"
          title="切换主题"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <section className="demo-hero">
        <div className="demo-hero-copy">
          <p className="demo-eyebrow">Shared Component Library</p>
          <h1>共享组件检查页</h1>
          <p>
            把基础样式、全局 UI 片段和已迁入 components 的共享组件按用途集中展示，
            方便以后改 UI 时直接从这里检查联动效果。
          </p>
        </div>
      </section>

      <DemoSection
        id="foundation"
        icon={<Palette size={18} />}
        eyebrow="Foundation"
        title="基础样式"
        description="全局按钮、输入框、开关、分段控件和状态反馈。"
      >
        <div className="demo-grid demo-grid-two">
          <DemoCard title="默认按钮">
            <div className="demo-control-row">
              <button className="btn btn-primary">
                <CheckCircle2 size={16} />
                Primary
              </button>
              <button className="btn btn-secondary">
                <Info size={16} />
                Secondary
              </button>
              <button className="btn btn-ghost">
                <Sparkles size={16} />
                Ghost
              </button>
              <button className="btn btn-danger">
                <ShieldAlert size={16} />
                Danger
              </button>
              <button className="btn btn-primary" disabled>
                Disabled
              </button>
              <button type="button" className="ui-action-dashed">
                <Plus size={16} />
                Dashed
              </button>
            </div>
          </DemoCard>

          <DemoCard title="小号按钮">
            <div className="demo-control-row">
              <button className="btn btn-sm btn-primary">
                <CheckCircle2 size={14} />
                Primary
              </button>
              <button className="btn btn-sm btn-secondary">
                <Info size={14} />
                Secondary
              </button>
              <button className="btn btn-sm btn-ghost">
                <Sparkles size={14} />
                Ghost
              </button>
              <button className="btn btn-sm btn-danger">
                <ShieldAlert size={14} />
                Danger
              </button>
              <button className="btn btn-sm btn-icon" aria-label="小号图标按钮">
                <Bell size={14} />
              </button>
              <button className="btn btn-sm btn-primary" disabled>
                Disabled
              </button>
              <button type="button" className="ui-action-dashed ui-action-dashed-sm">
                <Plus size={14} />
                Dashed
              </button>
            </div>
          </DemoCard>

          <DemoCard title="输入控件">
            <div className="demo-input-grid">
              <input className="input" value="标准输入框" readOnly />
              <input
                className="input input-compact"
                value="紧凑输入框"
                readOnly
              />
              <input className="input input-pill" value="胶囊输入框" readOnly />
              <textarea
                className="textarea"
                value="多行输入框"
                rows={3}
                readOnly
              />
              <div className="ui-input-control">
                <Search className="ui-input-icon" size={15} />
                <input
                  className="input input-compact"
                  placeholder="带图标搜索"
                  readOnly
                />
              </div>
            </div>
          </DemoCard>

          <DemoCard title="开关、分段与徽标">
            <div className="demo-stack">
              <label className="setting-switch">
                <span>显示 #地址后四位</span>
                <input type="checkbox" defaultChecked />
              </label>
              <label className="setting-switch">
                <span>自动同步</span>
                <input type="checkbox" />
              </label>
              <div
                className="ui-segmented-control download-source-tabs demo-download-source-tabs"
                role="tablist"
                aria-label="下载来源"
              >
                <button
                  type="button"
                  className={
                    demoDownloadSource === 'r2'
                      ? 'ui-segmented-option download-source-tab is-active'
                      : 'ui-segmented-option download-source-tab'
                  }
                  role="tab"
                  aria-selected={demoDownloadSource === 'r2'}
                  onClick={() => setDemoDownloadSource('r2')}
                >
                  <Cloud size={15} />
                  R2
                </button>
                <button
                  type="button"
                  className={
                    demoDownloadSource === 'github'
                      ? 'ui-segmented-option download-source-tab is-active'
                      : 'ui-segmented-option download-source-tab'
                  }
                  role="tab"
                  aria-selected={demoDownloadSource === 'github'}
                  onClick={() => setDemoDownloadSource('github')}
                >
                  <Code size={15} />
                  GitHub
                </button>
              </div>
              <div className="demo-control-row">
                <span className="ui-badge success">
                  <span className="status-dot success" />
                  已连接
                </span>
                <span className="ui-badge warning">
                  <span className="status-dot warning" />
                  检测中
                </span>
                <span className="ui-badge danger">
                  <span className="status-dot danger" />
                  不可用
                </span>
                <span className="ui-badge info">
                  <span className="status-dot info" />
                  已就绪
                </span>
              </div>
            </div>
          </DemoCard>
        </div>
      </DemoSection>

      <DemoSection
        id="brand"
        icon={<Type size={18} />}
        eyebrow="Brand"
        title="品牌与导航"
        description="Logo、营销导航和页脚放在独立预览面板里，避免和 demo 容器互相挤压。"
      >
        <div className="demo-grid demo-brand-grid">
          <DemoCard title="LogoIcon">
            <div className="demo-logo-row">
              <LogoIcon size={24} />
              <LogoIcon size={36} />
              <LogoIcon size={52} />
            </div>
          </DemoCard>
          <DemoCard title="Nav" className="demo-nav-preview">
            <Nav />
          </DemoCard>
          <DemoCard title="Footer" className="demo-footer-preview">
            <Footer />
          </DemoCard>
        </div>
      </DemoSection>

      <DemoSection
        id="feedback"
        icon={<MousePointerClick size={18} />}
        eyebrow="Feedback"
        title="弹窗与反馈"
        description="弹窗、Toast、连接和登录入口都使用按钮触发，页面加载时不主动打开。"
      >
        <DemoCard title="触发式组件">
          <div className="demo-control-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowOverlay(true)}
            >
              <Eye size={16} />
              ModalOverlay
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConfirm(true)}
            >
              <ShieldAlert size={16} />
              ConfirmModal
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowInput(true)}
            >
              <Type size={16} />
              InputModal
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => pushToast('info', '这是一条本地 demo toast')}
            >
              <Bell size={16} />
              Toast
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openConnectModal}
            >
              <Server size={16} />
              ConnectModal
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openLoginModal}
            >
              <LogIn size={16} />
              UserLoginModal
            </button>
          </div>
        </DemoCard>
      </DemoSection>

      <DemoSection
        id="patterns"
        icon={<Sparkles size={18} />}
        eyebrow="Patterns"
        title="全局样式片段"
        description="页面里反复复用的全局 class 和组合形态。"
      >
        <div className="demo-grid demo-grid-two">
          <DemoCard title="文件行">
            <div className="demo-stack">
              <ChatAttachmentCard
                attachment={{
                  kind: 'text',
                  cid: 'bafy-demo-text',
                  fileName: 'demo-preview.txt',
                  link: 'most://bafy-demo-text?filename=demo-preview.txt',
                  size: 12697,
                }}
                status="available"
              />
              <ChatAttachmentCard
                attachment={{
                  kind: 'video',
                  cid: 'bafy-demo-video',
                  fileName: 'movie-sample.mp4',
                  link: 'most://bafy-demo-video?filename=movie-sample.mp4',
                  size: 0,
                }}
                status="checking"
              />
            </div>
          </DemoCard>

          <DemoCard title="空状态">
            <div className="ui-empty-state demo-empty-preview">
              <div className="ui-empty-icon">
                <MessageSquare size={28} />
              </div>
              <h4 className="ui-empty-title">暂无消息</h4>
              <p className="ui-empty-desc">开始聊天或选择一个频道。</p>
            </div>
          </DemoCard>

          <DemoCard title="列表与元信息">
            <div className="demo-stack">
              <article className="ui-list-item active">
                <button type="button" className="ui-list-item-main">
                  <span className="ui-list-icon">
                    <FileText size={18} />
                  </span>
                  <span className="ui-list-copy">
                    <span className="ui-list-title">产品计划.md</span>
                    <span className="ui-list-desc">CID、下载和做种说明</span>
                  </span>
                  <span className="ui-list-meta">今天</span>
                </button>
              </article>
              <article className="ui-list-item">
                <button type="button" className="ui-list-item-main">
                  <span className="ui-list-icon warning">
                    <Folder size={18} />
                  </span>
                  <span className="ui-list-copy">
                    <span className="ui-list-title">归档</span>
                    <span className="ui-list-desc">文件夹</span>
                  </span>
                  <span className="ui-list-meta">12 篇</span>
                </button>
              </article>
              <div className="ui-meta-box">频道 ID：general</div>
              <div className="ui-empty-inline">暂无成员</div>
            </div>
          </DemoCard>

          <DemoCard title="通知、标签与代码">
            <div className="demo-stack">
              <p className="ui-notice success">
                <CheckCircle2 size={14} />
                同步完成，所有内容已更新。
              </p>
              <p className="ui-notice warning">
                <AlertTriangle size={14} />
                节点正在检测中，请稍候。
              </p>
              <ul className="ui-chip-list demo-chip-preview">
                <li className="ui-chip">MostBox</li>
                <li className="ui-chip">P2P</li>
                <li className="ui-chip">CID</li>
                <li className="ui-chip">Hyperdrive</li>
              </ul>
              <code className="ui-code-box">
                most://bafy-demo-cid?filename=demo.txt
              </code>
              <div className="ui-peer-info demo-peer-info">
                <span className="peer-dot" />
                <span className="peer-id">12D3KooW...demo</span>
                <Wifi size={14} />
              </div>
            </div>
          </DemoCard>
        </div>
      </DemoSection>

      <DemoSection
        id="p2p-chat"
        icon={<MessageSquare size={18} />}
        eyebrow="P2P Chat"
        title="P2P 聊天控件"
        description="频道列表、消息气泡、附件消息、输入栏和成员网格都与真实聊天页共用组件。"
      >
        <div className="demo-grid demo-grid-two">
          <DemoCard title="频道列表项">
            <div className="demo-chat-sidebar-preview">
              <ChatChannelNavItem active title="general" />
              <ChatChannelNavItem title="design-review" />
              <ChatChannelNavItem
                title="launch-room"
                onLeave={() => pushToast('info', '退出频道控件示例')}
              />
              <button type="button" className="ui-action-dashed">
                <Plus size={16} />
                加入频道
              </button>
            </div>
          </DemoCard>

          <DemoCard title="消息气泡">
            <div className="chat-messages demo-chat-messages-preview">
              <ChatMessageItem
                variant="other"
                avatarSrc={generateAvatar('peer-demo')}
                author="Most Peer"
                time="20:16"
              >
                <ChatTextBubble>节点已在线，可以开始同步频道消息。</ChatTextBubble>
              </ChatMessageItem>
              <ChatMessageItem
                variant="self"
                avatarSrc={generateAvatar('self-demo')}
                author="Raina"
                time="20:18"
              >
                <ChatTextBubble>收到，我把控件收进 demo。</ChatTextBubble>
              </ChatMessageItem>
              <ChatMessageItem
                variant="other"
                avatarSrc={generateAvatar('file-demo')}
                author="Most Peer"
                time="20:19"
              >
                <ChatAttachmentBubble>
                  <ChatAttachmentCard
                    attachment={{
                      kind: 'image',
                      cid: 'bafy-chat-demo-image',
                      fileName: 'chat-assets/channel-preview.png',
                      link: 'most://bafy-chat-demo-image?filename=channel-preview.png',
                      size: 186420,
                    }}
                    status="available"
                  />
                </ChatAttachmentBubble>
              </ChatMessageItem>
            </div>
          </DemoCard>

          <DemoCard title="消息输入栏" className="demo-chat-composer-card">
            <ChatComposer
              message={demoChatMessage}
              placeholder="输入消息..."
              onMessageChange={setDemoChatMessage}
              onSend={() => pushToast('success', `发送：${demoChatMessage}`)}
              onSelectAttachmentFiles={() =>
                pushToast('info', '图片、视频和文件选择控件示例')
              }
            />
          </DemoCard>

          <DemoCard title="频道成员">
            <div className="demo-stack">
              <ChannelMemberGrid
                members={[
                  {
                    id: 'raina-demo',
                    name: 'Raina',
                    avatarSrc: generateAvatar('raina-demo'),
                  },
                  {
                    id: 'peer-a-demo',
                    name: 'Alice#1A2B',
                    avatarSrc: generateAvatar('peer-a-demo'),
                  },
                  {
                    id: 'peer-b-demo',
                    name: 'Bob#3C4D',
                    avatarSrc: generateAvatar('peer-b-demo'),
                  },
                ]}
              />
              <div className="ui-meta-box channel-detail-value channel-detail-mono">
                8acdf33076e075168bf889b21d21665b
              </div>
            </div>
          </DemoCard>
        </div>
      </DemoSection>

      <DemoSection
        id="shared"
        icon={<FileText size={18} />}
        eyebrow="Shared Components"
        title="共享组件"
        description="已迁入 components 的页面组件，只展示外观和轻交互。"
      >
        <div className="demo-grid demo-grid-two">
          <DemoCard title="Web3 小组件">
            <div className="demo-stack">
              <KeyCard title="Ed25519 公钥" icon={<ShieldAlert size={18} />}>
                <div className="mono-row">
                  <code className="mono">ed25519-demo-public-key</code>
                  <CopyButton text="ed25519-demo-public-key" />
                </div>
              </KeyCard>
              <EmptyState
                icon={<LogIn size={32} />}
                message="请输入用户名和密码以查看身份信息"
              />
            </div>
          </DemoCard>

          <DemoCard title="PEM 与复制" className="demo-pem-preview">
            <PemBlock
              label="demo.pub"
              filename="demo.pub"
              pem={'-----BEGIN PUBLIC KEY-----\nMOSTBOXDEMO\n-----END PUBLIC KEY-----'}
            />
          </DemoCard>

          <DemoCard title="文件管理卡片">
            <div className="demo-app-card-grid">
              <FolderCard
                folder={{ name: '图片', path: '图片' }}
                onClick={() => pushToast('info', 'FolderCard demo')}
              />
              <FileCard
                file={{
                  cid: 'bafy-demo-file',
                  fileName: '图片/demo.png',
                  starred: true,
                }}
                isSelected
                onSelect={() => pushToast('info', 'FileCard select')}
                onPreview={() => pushToast('info', 'FileCard preview')}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary demo-move-trigger"
              onClick={() => setShowMoveModal(true)}
            >
              <Folder size={16} />
              MoveModal
            </button>
          </DemoCard>

          <DemoCard title="笔记组件">
            <div className="demo-note-shell">
              <div className="demo-note-header">
                <span>笔记</span>
                <NoteMoreMenu
                  sync={{
                    action: null,
                    status: 'synced',
                    statusLabel: '已同步',
                    hasConflict: false,
                    uploadNow: async () => true,
                    restoreFromCloud: async () => true,
                    exportLocalBackup: () => pushToast('info', '本地导出'),
                    importLocalBackup: () => pushToast('info', '本地导入'),
                  }}
                />
              </div>
              <div className="sidebar demo-note-sidebar">
                <NoteSidebar>
                  <div className="sidebar-empty-state">
                    <p>NoteSidebar 已迁入 components</p>
                  </div>
                </NoteSidebar>
              </div>
              <button
                type="button"
                className="btn btn-secondary demo-move-trigger"
                onClick={() => setShowNoteMoveModal(true)}
              >
                <Folder size={16} />
                NoteMoveModal
              </button>
            </div>
          </DemoCard>
        </div>
      </DemoSection>

      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          index={index}
          onDone={() => removeToast(toast.id)}
        />
      ))}

      {showOverlay && (
        <ModalOverlay onClose={() => setShowOverlay(false)}>
          <div className="demo-basic-modal" onClick={e => e.stopPropagation()}>
            <h3>ModalOverlay</h3>
            <p>这是基础容器示例，用来检查玻璃背景、居中和关闭行为。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowOverlay(false)}
            >
              关闭
            </button>
          </div>
        </ModalOverlay>
      )}

      {showConfirm && (
        <ConfirmModal
          title="确认弹窗示例"
          message="用于检查标题、正文、按钮和危险态之外的默认确认状态。"
          confirmText="确认"
          onConfirm={() => {
            setShowConfirm(false)
            pushToast('success', 'ConfirmModal 已确认')
          }}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {showInput && (
        <InputModal
          title="输入弹窗示例"
          placeholder="输入任意文本"
          confirmText="保存"
          defaultValue="MostBox"
          onConfirm={value => {
            setShowInput(false)
            pushToast('success', `InputModal: ${value}`)
          }}
          onClose={() => setShowInput(false)}
          validate={value => (value.length < 2 ? '至少输入 2 个字符' : '')}
        />
      )}

      {showMoveModal && (
        <MoveModal
          items={[{ cid: 'bafy-demo-file' }]}
          allFolders={[
            { name: '图片', path: '图片' },
            { name: '壁纸', path: '图片/壁纸' },
            { name: '文档', path: '文档' },
          ]}
          currentPath="图片"
          onMove={targetPath => {
            setShowMoveModal(false)
            pushToast('success', `MoveModal: ${targetPath || '根目录'}`)
          }}
          onClose={() => setShowMoveModal(false)}
        />
      )}

      {showNoteMoveModal && (
        <NoteMoveModal
          target={demoNoteTarget}
          directories={demoNoteDirectories}
          onMove={targetPath => {
            setShowNoteMoveModal(false)
            pushToast('success', `NoteMoveModal: ${targetPath || '全部笔记'}`)
          }}
          onClose={() => setShowNoteMoveModal(false)}
        />
      )}

      <ConnectModal />
      <UserLoginModal />
    </main>
  )
}
