import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref,
} from 'react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export type ActionMenuPlacement =
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'

export type ActionMenuItem = {
  key: string
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type ActionMenuTriggerProps = {
  ref: Ref<HTMLButtonElement>
  type: 'button'
  disabled: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
}

export type ActionMenuProps = {
  ariaLabel: string
  items: ActionMenuItem[]
  renderTrigger: (props: ActionMenuTriggerProps) => ReactNode
  placement?: ActionMenuPlacement
  disabled?: boolean
  className?: string
  menuClassName?: string
}

type MenuPosition = {
  top: number
  left: number
}
const MENU_GAP = 8
const VIEWPORT_PADDING = 8

export function ActionMenu({
  ariaLabel,
  items,
  renderTrigger,
  placement = 'bottom-end',
  disabled = false,
  className = '',
  menuClassName = '',
}: ActionMenuProps) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isMounted, setIsMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isPositioned, setIsPositioned] = useState(false)

  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node
  }, [])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setIsPositioned(false)
  }, [])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const triggerRect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const isTop = placement.startsWith('top')
    const isEnd = placement.endsWith('end')
    const rawTop = isTop
      ? triggerRect.top - menuRect.height - MENU_GAP
      : triggerRect.bottom + MENU_GAP
    const rawLeft = isEnd
      ? triggerRect.right - menuRect.width
      : triggerRect.left

    const maxLeft = Math.max(
      VIEWPORT_PADDING,
      viewportWidth - menuRect.width - VIEWPORT_PADDING
    )
    const maxTop = Math.max(
      VIEWPORT_PADDING,
      viewportHeight - menuRect.height - VIEWPORT_PADDING
    )

    const position: MenuPosition = {
      top: Math.min(Math.max(rawTop, VIEWPORT_PADDING), maxTop),
      left: Math.min(Math.max(rawLeft, VIEWPORT_PADDING), maxLeft),
    }

    menu.style.setProperty('--action-menu-top', `${position.top}px`)
    menu.style.setProperty('--action-menu-left', `${position.left}px`)
    setIsPositioned(true)
  }, [placement])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!disabled) return
    closeMenu()
  }, [closeMenu, disabled])

  useLayoutEffect(() => {
    if (!isOpen) return
    setIsPositioned(false)
    updatePosition()
  }, [isOpen, items.length, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const animationId = window.requestAnimationFrame(() => {
      const firstItem =
        menuRef.current?.querySelector<HTMLButtonElement>(
          '.ui-action-menu-item:not(:disabled)'
        )
      firstItem?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(animationId)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      closeMenu()
      triggerRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('keydown', handleDocumentKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [closeMenu, isOpen, updatePosition])

  function handleTriggerClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (disabled) return
    setIsOpen(open => !open)
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    if (!disabled) setIsOpen(true)
  }

  const menu =
    isMounted && isOpen
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={[
              'ui-action-menu',
              isPositioned ? 'is-positioned' : '',
              menuClassName,
            ]
              .filter(Boolean)
              .join(' ')}
            role="menu"
            aria-label={ariaLabel}
            onClick={event => event.stopPropagation()}
          >
            {items.map(item => (
              <button
                key={item.key}
                type="button"
                className={[
                  'ui-action-menu-item',
                  item.icon ? 'has-icon' : '',
                  item.description ? 'has-description' : '',
                  item.danger ? 'danger' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="menuitem"
                disabled={item.disabled}
                onClick={event => {
                  event.stopPropagation()
                  closeMenu()
                  item.onSelect()
                }}
              >
                {item.icon && (
                  <span className="ui-action-menu-item-icon">{item.icon}</span>
                )}
                <span className="ui-action-menu-item-label">{item.label}</span>
                {item.description && (
                  <span className="ui-action-menu-item-description">
                    {item.description}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <span className={['ui-action-menu-anchor', className].filter(Boolean).join(' ')}>
      {renderTrigger({
        ref: setTriggerRef,
        type: 'button',
        disabled,
        onClick: handleTriggerClick,
        onKeyDown: handleTriggerKeyDown,
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
        'aria-controls': menuId,
      })}
      {menu}
    </span>
  )
}
