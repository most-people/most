import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  normalizeConversationState,
  type ConversationState,
} from './conversationModel'
import {
  loadConversationState,
  saveConversationState,
} from './conversationStorage'

type ScopedState = { scope: string; value: ConversationState }

export function useConversationState(scope: string, onSaveError: () => void) {
  const [stored, setStored] = useState<ScopedState | null>(null)
  const current = useRef<ScopedState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorHandler = useRef(onSaveError)
  errorHandler.current = onSaveError

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const state = current.current
    if (state)
      void saveConversationState(state.scope, state.value).catch(() =>
        errorHandler.current()
      )
  }, [])

  useEffect(() => {
    let active = true
    current.current = null
    void loadConversationState(scope).then(value => {
      if (!active) return
      const next = { scope, value }
      current.current = next
      setStored(next)
    })
    return () => {
      active = false
      flush()
    }
  }, [flush, scope])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') flush()
    })
    return () => subscription.remove()
  }, [flush])

  const update = useCallback(
    (change: (state: ConversationState) => ConversationState) => {
      const previous = current.current
      if (!previous || previous.scope !== scope) return
      const value = change(previous.value)
      if (value === previous.value) return
      const next = { scope, value }
      current.current = next
      setStored(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, 250)
    },
    [flush, scope]
  )

  return {
    ready: stored?.scope === scope,
    state:
      stored?.scope === scope ? stored.value : normalizeConversationState(null),
    update,
    flush,
  }
}
