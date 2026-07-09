import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from 'react'
import {
  ArrowRight,
  Edit2,
  FileText,
  Film,
  Image as ImageIcon,
  Loader,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react'
import { SafeImage } from '~/components/SafeImage'
import { ActionMenu } from '~/components/ui'
import { useI18n, type MessageKey } from '~/lib/i18n'

export type ChatMessageVariant = 'self' | 'other'

export type ChannelMemberView = {
  id: string
  name: string
  tag?: string
  avatarSrc: string
  online?: boolean
}

const ATTACHMENT_MENU_OPTIONS = [
  {
    key: 'image',
    labelKey: 'chat.attachment.image',
    accept: 'image/*',
    icon: ImageIcon,
  },
  {
    key: 'video',
    labelKey: 'chat.attachment.video',
    accept: 'video/*',
    icon: Film,
  },
  {
    key: 'file',
    labelKey: 'chat.attachment.file',
    accept: '',
    icon: FileText,
  },
] as const satisfies ReadonlyArray<{
  key: string
  labelKey: MessageKey
  accept: string
  icon: typeof ImageIcon
}>

const VOICE_MENU_OPTION = {
  key: 'voice',
  labelKey: 'chat.voice.menu',
  icon: Mic,
} as const satisfies {
  key: string
  labelKey: MessageKey
  icon: typeof ImageIcon
}

const DEFAULT_ATTACHMENT_ACCEPT = ATTACHMENT_MENU_OPTIONS.map(
  option => option.accept
).join(',')

export function ChatTextBubble({ children }: { children: ReactNode }) {
  return (
    <div className="message-bubble" translate="no">
      {children}
    </div>
  )
}

export function ChatAttachmentBubble({ children }: { children: ReactNode }) {
  return <div className="message-bubble has-attachment">{children}</div>
}

export function ChatSystemMessageItem({ children }: { children: ReactNode }) {
  return <div className="chat-system-message">{children}</div>
}

export function ChatMessageItem({
  variant,
  pending = false,
  avatarSrc,
  isOnline = false,
  author,
  authorTag = '',
  mentioned = false,
  time,
  children,
}: {
  variant: ChatMessageVariant
  pending?: boolean
  avatarSrc: string
  isOnline?: boolean
  author: string
  authorTag?: string
  mentioned?: boolean
  time: string
  children: ReactNode
}) {
  const className = [
    'chat-message',
    variant,
    pending ? 'pending' : '',
    mentioned ? 'mentioned' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <span className="chat-avatar-wrap">
        <SafeImage
          className="msg-avatar"
          src={avatarSrc}
          alt="avatar"
          referrerPolicy="no-referrer"
        />
        {isOnline && <span className="chat-online-dot" aria-hidden="true" />}
      </span>
      <div className="msg-content">
        <span className="message-header">
          <span className="message-author" translate="no">
            {author}
          </span>
          {authorTag && (
            <span className="message-author-tag" translate="no">
              [{authorTag}]
            </span>
          )}
        </span>
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
  mentionUnread = false,
  mentionPreview = '',
  title,
  menuClassName,
  onSelect,
  onTogglePin,
  onRename,
  onLeave,
}: {
  active?: boolean
  pinned?: boolean
  unread?: boolean
  mentionUnread?: boolean
  mentionPreview?: string
  title: string
  menuClassName?: string
  onSelect?: () => void
  onTogglePin?: () => void
  onRename?: () => void
  onLeave?: () => void
}) {
  const { t } = useI18n()
  const hasActions = Boolean(onTogglePin || onRename || onLeave)
  const className = [
    'sidebar-nav-btn',
    active ? 'active' : '',
    pinned ? 'pinned' : '',
    unread ? 'unread' : '',
    mentionUnread ? 'mention-unread' : '',
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
        <MessagesSquare size={16} />
        {mentionUnread ? (
          <span
            className="chat-channel-mention-badge"
            title={t('chat.mentionUnread')}
            aria-hidden="true"
          >
            @
          </span>
        ) : unread ? (
          <span
            className="chat-channel-unread-dot"
            title={t('chat.unread')}
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="chat-channel-title">
        <span className="chat-channel-title-text" translate="no">
          {title}
        </span>
        {mentionUnread && (
          <span className="chat-channel-subtitle">
            <span className="chat-channel-mention-label">
              [{t('chat.mentionUnreadTag')}]
            </span>
            {mentionPreview && (
              <span className="chat-channel-preview" translate="no">
                {mentionPreview}
              </span>
            )}
          </span>
        )}
      </span>
      {hasActions && (
        <ActionMenu
          ariaLabel={t('chat.channelActions')}
          className="channel-actions-anchor"
          menuClassName={menuClassName}
          placement="bottom-end"
          items={[
            {
              key: 'pin',
              label: pinned ? t('chat.unpin') : t('chat.pin'),
              icon: pinned ? <PinOff size={16} /> : <Pin size={16} />,
              onSelect: () => onTogglePin?.(),
            },
            {
              key: 'rename',
              label: t('chat.rename'),
              icon: <Edit2 size={16} />,
              onSelect: () => onRename?.(),
            },
            {
              key: 'delete',
              label: t('chat.delete'),
              icon: <Trash2 size={16} />,
              onSelect: () => onLeave?.(),
            },
          ]}
          renderTrigger={triggerProps => (
            <button
              {...triggerProps}
              className="leave-channel-btn channel-actions-trigger"
              title={t('common.moreActions')}
              aria-label={t('common.moreActions')}
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
}: {
  members: ChannelMemberView[]
}) {
  const { t } = useI18n()

  if (members.length === 0) {
    return (
      <div className="ui-empty-inline channel-members-empty">
        {t('chat.noMembers')}
      </div>
    )
  }

  return (
    <div className="channel-members-grid">
      {members.map(member => (
        <div className="channel-member" key={member.id}>
          <span className="channel-member-avatar-wrap">
            <SafeImage
              className="channel-member-avatar"
              src={member.avatarSrc}
              alt="avatar"
              referrerPolicy="no-referrer"
            />
            {member.online && (
              <span className="chat-online-dot" aria-hidden="true" />
            )}
          </span>
          <span className="channel-member-name" translate="no">
            {member.name}
          </span>
          {member.tag && (
            <span className="channel-member-tag" translate="no">
              [{member.tag}]
            </span>
          )}
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
  attachmentButtonTitle,
  attachmentInputRef,
  inputRef,
  mentionMenu,
  attachmentMenuClassName,
  showVoiceRoom = true,
  onMessageChange,
  onSelectionChange,
  onCompositionChange,
  onComposerKeyDown,
  onSend,
  onOpenVoiceRoom,
  onSelectAttachmentFiles,
}: {
  message: string
  placeholder: string
  disabled?: boolean
  isPublishingAttachment?: boolean
  attachmentButtonTitle?: string
  attachmentInputRef?: RefObject<HTMLInputElement | null>
  inputRef?: RefObject<HTMLTextAreaElement | null>
  mentionMenu?: ReactNode
  attachmentMenuClassName?: string
  showVoiceRoom?: boolean
  onMessageChange: (
    value: string,
    selectionStart?: number,
    selectionEnd?: number
  ) => void
  onSelectionChange?: (selectionStart: number, selectionEnd: number) => void
  onCompositionChange?: (isComposing: boolean) => void
  onComposerKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean | void
  onSend: () => void
  onOpenVoiceRoom?: () => void
  onSelectAttachmentFiles?: (files: File[] | null) => void
}) {
  const { t } = useI18n()
  const toolsDisabled = disabled || isPublishingAttachment
  const sendDisabled = disabled || !message.trim()
  const attachmentTitle = attachmentButtonTitle || t('chat.attachment.add')

  function handleFileInput(
    event: ChangeEvent<HTMLInputElement>,
    onSelect?: (files: File[] | null) => void
  ) {
    const selectedFiles = event.currentTarget.files
      ? Array.from(event.currentTarget.files)
      : null
    onSelect?.(selectedFiles)
    event.currentTarget.value = ''
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (onComposerKeyDown?.(event)) return
    if (event.key !== 'Enter') return
    if (event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (message.trim()) onSend()
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
        ariaLabel={t('chat.attachmentType')}
        placement="top-start"
        disabled={toolsDisabled}
        menuClassName={attachmentMenuClassName}
        items={[
          ...ATTACHMENT_MENU_OPTIONS.map(option => {
            const Icon = option.icon
            return {
              key: option.key,
              label: t(option.labelKey),
              icon: <Icon size={16} />,
              onSelect: () => openAttachmentPicker(option.accept),
            }
          }),
          ...(showVoiceRoom
            ? [
                {
                  key: VOICE_MENU_OPTION.key,
                  label: t(VOICE_MENU_OPTION.labelKey),
                  icon: <Mic size={16} />,
                  onSelect: () => onOpenVoiceRoom?.(),
                },
              ]
            : []),
        ]}
        renderTrigger={triggerProps => (
          <button
            {...triggerProps}
            className="btn btn-circle chat-tool-btn"
            aria-label={attachmentTitle}
          >
            {isPublishingAttachment ? (
              <Loader
                size={18}
                className="ui-spinner chat-attachment-spinner"
              />
            ) : (
              <Plus size={18} />
            )}
          </button>
        )}
      />
      {mentionMenu}
      <textarea
        ref={inputRef}
        className="textarea chat-composer-input"
        placeholder={placeholder}
        value={message}
        disabled={disabled}
        rows={1}
        onChange={event =>
          onMessageChange(
            event.target.value,
            event.target.selectionStart,
            event.target.selectionEnd
          )
        }
        onSelect={event =>
          onSelectionChange?.(
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd
          )
        }
        onKeyUp={event =>
          onSelectionChange?.(
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd
          )
        }
        onCompositionStart={() => onCompositionChange?.(true)}
        onCompositionEnd={event => {
          onCompositionChange?.(false)
          onSelectionChange?.(
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd
          )
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="btn btn-circle btn-primary send-btn"
        onClick={onSend}
        disabled={sendDisabled}
        title={t('chat.sendMessage')}
      >
        <ArrowRight size={18} />
      </button>
    </div>
  )
}
