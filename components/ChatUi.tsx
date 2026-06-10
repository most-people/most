'use client'

import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react'
import {
  ArrowRight,
  Edit2,
  FileText,
  Film,
  Image as ImageIcon,
  Loader,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react'
import { ActionMenu } from '~/components/ui'

export type ChatMessageVariant = 'self' | 'other'

export type ChannelMemberView = {
  id: string
  name: string
  avatarSrc: string
}

const ATTACHMENT_MENU_OPTIONS = [
  {
    key: 'image',
    label: '图片',
    accept: 'image/*',
    icon: ImageIcon,
  },
  {
    key: 'video',
    label: '视频',
    accept: 'video/*',
    icon: Film,
  },
  {
    key: 'file',
    label: '文件',
    accept: '',
    icon: FileText,
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
  pinned = false,
  unread = false,
  title,
  onSelect,
  onTogglePin,
  onRename,
  onLeave,
}: {
  active?: boolean
  pinned?: boolean
  unread?: boolean
  title: string
  onSelect?: () => void
  onTogglePin?: () => void
  onRename?: () => void
  onLeave?: () => void
}) {
  const hasActions = Boolean(onTogglePin || onRename || onLeave)
  const className = [
    'sidebar-nav-btn',
    active ? 'active' : '',
    pinned ? 'pinned' : '',
    unread ? 'unread' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter') return
        onSelect?.()
      }}
    >
      <span className="chat-channel-icon-wrap">
        <MessageSquare size={16} />
        {unread && (
          <span
            className="chat-channel-unread-dot"
            title="有新消息"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="chat-channel-title">
        <span className="chat-channel-title-text">{title}</span>
      </span>
      {hasActions && (
        <ActionMenu
          ariaLabel="频道操作"
          className="channel-actions-anchor"
          placement="bottom-end"
          items={[
            {
              key: 'pin',
              label: pinned ? '取消置顶' : '置顶',
              icon: pinned ? <PinOff size={16} /> : <Pin size={16} />,
              onSelect: () => onTogglePin?.(),
            },
            {
              key: 'rename',
              label: '重命名',
              icon: <Edit2 size={16} />,
              onSelect: () => onRename?.(),
            },
            {
              key: 'delete',
              label: '删除',
              icon: <Trash2 size={16} />,
              onSelect: () => onLeave?.(),
            },
          ]}
          renderTrigger={triggerProps => (
            <button
              {...triggerProps}
              className="leave-channel-btn channel-actions-trigger"
              title="更多操作"
              aria-label="更多操作"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        />
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

  function openAttachmentPicker(accept: string) {
    if (toolsDisabled) return
    const input = attachmentInputRef?.current
    if (!input) return
    input.accept = accept
    input.click()
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
      <ActionMenu
        ariaLabel="附件类型"
        placement="top-start"
        disabled={toolsDisabled}
        items={ATTACHMENT_MENU_OPTIONS.map(option => {
          const Icon = option.icon
          return {
            key: option.key,
            label: option.label,
            icon: <Icon size={16} />,
            onSelect: () => openAttachmentPicker(option.accept),
          }
        })}
        renderTrigger={triggerProps => (
          <button
            {...triggerProps}
            className="btn btn-circle chat-tool-btn"
            aria-label={attachmentButtonTitle}
          >
            {isPublishingAttachment ? (
              <Loader size={18} className="ui-spinner chat-attachment-spinner" />
            ) : (
              <Plus size={18} />
            )}
          </button>
        )}
      />
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
