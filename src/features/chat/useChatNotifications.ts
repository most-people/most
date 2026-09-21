/**
 * Chat notification sound.
 *
 * Extracted from `ChatPage.tsx` unchanged. Browsers only allow audio after a
 * user gesture, so the context is created lazily on the first pointer/key event
 * and the sound plays on later incoming messages.
 */
import { useCallback, useEffect, useRef } from 'react'

import { getBrowserAudioContextConstructor } from './chatPageModel'

/**
 * Minimum gap between two notification sounds.
 *
 * A busy channel would otherwise play one sound per message.
 */
export const CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS = 1200

/** Two short sine blips. */
const NOTIFICATION_TONES = [740, 980]

export function useChatNotifications() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const unlockedRef = useRef(false)
  const lastPlayedAtRef = useRef(0)

  const ensureAudioUnlocked = useCallback(() => {
    if (unlockedRef.current) return
    if (typeof window === 'undefined') return
    const AudioContextConstructor = getBrowserAudioContextConstructor()
    if (!AudioContextConstructor) return

    try {
      const audioContext =
        audioContextRef.current || new AudioContextConstructor()
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => {})
      }
      unlockedRef.current = true
    } catch {}
  }, [])

  const playNotificationSound = useCallback(() => {
    if (!unlockedRef.current) return
    const now = Date.now()
    if (
      now - lastPlayedAtRef.current <
      CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS
    ) {
      return
    }
    lastPlayedAtRef.current = now

    const AudioContextConstructor = getBrowserAudioContextConstructor()
    if (!AudioContextConstructor) return

    try {
      const audioContext =
        audioContextRef.current || new AudioContextConstructor()
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') {
        void audioContext.resume().catch(() => {})
        return
      }

      const gain = audioContext.createGain()
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(
        0.08,
        audioContext.currentTime + 0.015
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.18
      )
      gain.connect(audioContext.destination)
      NOTIFICATION_TONES.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
        oscillator.connect(gain)
        oscillator.start(audioContext.currentTime + index * 0.035)
        oscillator.stop(audioContext.currentTime + 0.16 + index * 0.035)
      })
    } catch {}
  }, [])

  // Unlock on the first user gesture; both events are needed because a keyboard
  // user may never click.
  useEffect(() => {
    window.addEventListener('pointerdown', ensureAudioUnlocked, {
      passive: true,
    })
    window.addEventListener('keydown', ensureAudioUnlocked)
    return () => {
      window.removeEventListener('pointerdown', ensureAudioUnlocked)
      window.removeEventListener('keydown', ensureAudioUnlocked)
    }
  }, [ensureAudioUnlocked])

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close().catch(() => {})
      audioContextRef.current = null
      unlockedRef.current = false
    }
  }, [])

  return { playNotificationSound }
}
