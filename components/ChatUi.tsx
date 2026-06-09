'use client'

import type {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react'
import { useState } from 'react'
import {
  ArrowRight,
  Loader,
  MessageSquare,
  MoreHorizontal,
  Plus,
} from 'lucide-react'

export type ChatMessageVariant = 'self' | 'other'

export type ChannelMemberView = {
  id: string
  name: string
  avatarSrc: string
}

const DEFAULT_ATTACHMENT_SIZE_LABEL = '10 GB'
const ATTACHMENT_MENU_OPTIONS = [
  {
    key: 'image',
    label: '图片',
    accept: 'image/*',
    tooltip: `支持 JPG、PNG、GIF、WEBP 等图片，单个文件最大 ${DEFAULT_ATTACHMENT_SIZE_LABEL}`,
  },
  {
    key: 'video',
    label: '视频',
    accept: 'video/*',
    tooltip: `支持视频文件，单个文件最大 ${DEFAULT_ATTACHMENT_SIZE_LABEL}`,
  },
  {
    key: 'file',
    label: '文件',
    accept: '',
    tooltip: `支持任意文件，单个文件最大 ${DEFAULT_ATTACHMENT_SIZE_LABEL}`,
  },
] as const

const DEFAULT_ATTACHMENT_ACCEPT = ATTACHMENT_MENU_OPTIONS.map(
  option => option.accept
).join(',')

export function ChatTextBubble({ children }: { children: ReactNode }) {
  return <div className="message-bubble">{children}</div>
}

export function ChatAttachmentBubble({ children }: { children: ReactNode }) {
  return <div className="message-bubble has-attachment">{children}</div>
}

export function ChatMessageItem({
  variant,
  pending = false,
  avatarSrc,
  author,
  time,
  children,
}: {
  variant: ChatMessageVariant
  pending?: boolean
  avatarSrc: string
  author: string
  time: string
  children: ReactNode
}) {
  const className = ['chat-message', variant, pending ? 'pending' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <img className="msg-avatar" src={avatarSrc} alt="avatar" />
      <div className="msg-content">
        <span className="message-author">{author}</span>
        {children}
        <span className="message-time">{time}</span>
      </div>
    </div>
  )
}

export function ChatChannelNavItem({
  active = false,
  title,
  onSelect,
  onLeave,
}: {
  active?: boolean
  title: string
  onSelect?: () => void
  onLeave?: () => void
}) {
  const hasActions = Boolean(onLeave)

  return (
    <div
      className={`sidebar-nav-btn ${active ? 'active' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter') onSelect?.()
      }}
    >
      <MessageSquare size={16} />
      <span>{title}</span>
      {hasActions && (
        <div
          className="channel-actions-menu"
          onClick={event => event.stopPropagation()}
        >
          <button
            className="leave-channel-btn channel-actions-trigger"
            title="更多操作"
            type="button"
            aria-label="更多操作"
          >
            <MoreHorizontal size={16} />
          </button>
          <div className="channel-actions-dropdown" role="menu">
            {onLeave && (
              <button
                type="button"
                className="channel-actions-item danger"
                onClick={onLeave}
              >
                删除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ChannelMemberGrid({
  members,
  isLoading = false,
}: {
  members: ChannelMemberView[]
  isLoading?: boolean
}) {
  if (isLoading && members.length === 0) {
    return (
      <div className="ui-empty-inline channel-members-empty">
        正在读取成员...
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="ui-empty-inline channel-members-empty">暂无成员</div>
    )
  }

  return (
    <div className="channel-members-grid">
      {members.map(member => (
        <div className="channel-member" key={member.id}>
          <img
            className="channel-member-avatar"
            src={member.avatarSrc}
            alt="avatar"
          />
          <span className="channel-member-name">{member.name}</span>
        </div>
      ))}
    </div>
  )
}

export function ChatComposer({
  message,
  placeholder,
  disabled = false,
  isPublishingAttachment = false,
  attachmentButtonTitle = '添加附件',
  attachmentInputRef,
  onMessageChange,
  onSend,
  onSelectAttachmentFiles,
}: {
  message: string
  placeholder: string
  disabled?: boolean
  isPublishingAttachment?: boolean
  attachmentButtonTitle?: string
  attachmentInputRef?: RefObject<HTMLInputElement | null>
  onMessageChange: (value: string) => void
  onSend: () => void
  onSelectAttachmentFiles?: (files: FileList | null) => void
}) {
  const toolsDisabled = disabled || isPublishingAttachment
  const sendDisabled = disabled || !message.trim()
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false)

  function handleFileInput(
    event: ChangeEvent<HTMLInputElement>,
    onSelect?: (files: FileList | null) => void
  ) {
    onSelect?.(event.currentTarget.files)
    event.currentTarget.value = ''
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && message.trim()) onSend()
  }

  function handleAttachmentMenuBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }
    setIsAttachmentMenuOpen(false)
  }

  function openAttachmentPicker(accept: string) {
    if (toolsDisabled) return
    const input = attachmentInputRef?.current
    if (!input) return
    input.accept = accept
    input.click()
    setIsAttachmentMenuOpen(false)
  }

  return (
    <div className="chat-input-area">
      <input
        ref={attachmentInputRef}
        type="file"
        accept={DEFAULT_ATTACHMENT_ACCEPT}
        className="chat-file-input"
        onChange={event => handleFileInput(event, onSelectAttachmentFiles)}
      />
      <div
        className={`chat-tool-btn-wrap ${isAttachmentMenuOpen ? 'is-open' : ''}`}
        onMouseEnter={() => {
          if (!toolsDisabled) setIsAttachmentMenuOpen(true)
        }}
        onMouseLeave={() => setIsAttachmentMenuOpen(false)}
        onBlur={handleAttachmentMenuBlur}
      >
        <button
          type="button"
          className="btn btn-circle chat-tool-btn"
          onClick={() => {
            if (toolsDisabled) return
            setIsAttachmentMenuOpen(open => !open)
          }}
          disabled={toolsDisabled}
          aria-label={attachmentButtonTitle}
          aria-haspopup="menu"
          aria-expanded={isAttachmentMenuOpen}
        >
          {isPublishingAttachment ? (
            <Loader size={18} className="ui-spinner chat-attachment-spinner" />
          ) : (
            <Plus size={18} />
          )}
        </button>
        <div className="chat-tool-dropdown" role="menu" aria-label="附件类型">
          {ATTACHMENT_MENU_OPTIONS.map(option => (
            <div className="chat-tool-dropdown-item-wrap" key={option.key}>
              <button
                type="button"
                className="chat-tool-dropdown-item"
                role="menuitem"
                onClick={() => openAttachmentPicker(option.accept)}
              >
                {option.label}
              </button>
              <span role="tooltip" className="chat-tool-item-tooltip">
                {option.tooltip}
              </span>
            </div>
          ))}
        </div>
      </div>
      <input
        type="text"
        className="input input-pill"
        placeholder={placeholder}
        value={message}
        disabled={disabled}
        onChange={event => onMessageChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="btn btn-circle btn-primary send-btn"
        onClick={onSend}
        disabled={sendDisabled}
        title="发送消息"
      >
        <ArrowRight size={18} />
      </button>
    </div>
  )
}
