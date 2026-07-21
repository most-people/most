import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildDirectChannelId,
  buildDirectInboxChannelId,
  createDirectKeyEnvelope,
  DIRECT_CHANNEL_TYPE,
  DIRECT_INBOX_CHANNEL_TYPE,
  normalizeDirectAddress,
  verifyDirectKeyEnvelope,
} from '~server/src/core/directChat.js'
import { channelApi, type Channel } from '~/lib/channelApi'
import { useChannelMessages } from '~/hooks/useChannelMessages'
import {
  getUserChannelProfile,
  getUserMessageIdentity,
} from '~/lib/userProfile'
import { useUserStore } from '~/stores/userStore'

const DIRECT_CONTACTS_STORAGE_PREFIX = 'mostbox.direct-contacts.v1:'

export interface DirectContact {
  address: string
  publicKey?: string
  displayName?: string
  status: 'pending' | 'ready'
  keySent: boolean
  removed: boolean
  createdAt: number
  updatedAt: number
}

interface UseDirectContactsOptions {
  isReady: boolean
  peerId?: string
  onError?: (error: unknown) => void | Promise<void>
  onDirectChannelReady?: (channel: Channel, contact: DirectContact) => void
}

function getStorageKey(ownerAddress: string) {
  return `${DIRECT_CONTACTS_STORAGE_PREFIX}${normalizeDirectAddress(ownerAddress)}`
}

function readContacts(ownerAddress: string) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getStorageKey(ownerAddress)) || '{}'
    )
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([address, value]) => {
        const normalized = normalizeDirectAddress(address)
        if (!normalized || !value || typeof value !== 'object') return []
        const contact = value as Partial<DirectContact>
        return [
          [
            normalized,
            {
              address: normalized,
              publicKey:
                typeof contact.publicKey === 'string'
                  ? contact.publicKey
                  : undefined,
              displayName:
                typeof contact.displayName === 'string'
                  ? contact.displayName.slice(0, 50)
                  : undefined,
              status: contact.publicKey ? 'ready' : 'pending',
              keySent: Boolean(contact.keySent),
              removed: Boolean(contact.removed),
              createdAt: Number(contact.createdAt) || Date.now(),
              updatedAt: Number(contact.updatedAt) || Date.now(),
            } satisfies DirectContact,
          ],
        ]
      })
    ) as Record<string, DirectContact>
  } catch {
    return {}
  }
}

function writeContacts(
  ownerAddress: string,
  contacts: Record<string, DirectContact>
) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(getStorageKey(ownerAddress), JSON.stringify(contacts))
}

export function useDirectContacts({
  isReady,
  peerId = '',
  onError,
  onDirectChannelReady,
}: UseDirectContactsOptions) {
  const identity = useUserStore(state => state.identity)
  const ownerAddress = normalizeDirectAddress(identity?.address)
  const [contactsByAddress, setContactsByAddress] = useState<
    Record<string, DirectContact>
  >({})
  const [inboxChannelName, setInboxChannelName] = useState('')
  const contactsRef = useRef(contactsByAddress)
  const processingRef = useRef(new Set<string>())
  const onErrorRef = useRef(onError)
  const onDirectChannelReadyRef = useRef(onDirectChannelReady)

  useEffect(() => {
    contactsRef.current = contactsByAddress
  }, [contactsByAddress])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onDirectChannelReadyRef.current = onDirectChannelReady
  }, [onDirectChannelReady])

  useEffect(() => {
    processingRef.current.clear()
    setContactsByAddress(ownerAddress ? readContacts(ownerAddress) : {})
  }, [ownerAddress])

  const updateContact = useCallback(
    (address: string, update: Partial<DirectContact>) => {
      const normalized = normalizeDirectAddress(address)
      if (!ownerAddress || !normalized) return null

      const current = contactsRef.current[normalized]
      const now = Date.now()
      const nextContact: DirectContact = {
        ...current,
        ...update,
        address: normalized,
        status: update.status ?? current?.status ?? 'pending',
        keySent: update.keySent ?? current?.keySent ?? false,
        removed: update.removed ?? current?.removed ?? false,
        createdAt: current?.createdAt || now,
        updatedAt: now,
      }
      const next = { ...contactsRef.current, [normalized]: nextContact }
      contactsRef.current = next
      writeContacts(ownerAddress, next)
      setContactsByAddress(next)
      return nextContact
    },
    [ownerAddress]
  )

  const ensureDirectChannel = useCallback(
    async (peerAddress: string) => {
      if (!identity || !ownerAddress) {
        throw new Error('Direct chat identity is unavailable')
      }
      return channelApi.createChannel(
        buildDirectChannelId(ownerAddress, peerAddress),
        DIRECT_CHANNEL_TYPE,
        getUserChannelProfile(identity)
      )
    },
    [identity, ownerAddress]
  )

  const sendKeyEnvelope = useCallback(
    async (peerAddress: string) => {
      if (!identity || !ownerAddress) {
        throw new Error('Direct chat identity is unavailable')
      }
      const inbox = await channelApi.createChannel(
        buildDirectInboxChannelId(peerAddress),
        DIRECT_INBOX_CHANNEL_TYPE,
        getUserChannelProfile(identity)
      )
      const envelope = await createDirectKeyEnvelope(identity, peerAddress)
      await channelApi.sendChannelMessage({
        channelName: inbox.channelKey || inbox.name,
        content: JSON.stringify(envelope),
        ...getUserMessageIdentity(identity),
      })
    },
    [identity, ownerAddress]
  )

  useEffect(() => {
    if (!isReady || !identity || !ownerAddress) {
      setInboxChannelName('')
      return
    }

    let cancelled = false
    channelApi
      .createChannel(
        buildDirectInboxChannelId(ownerAddress),
        DIRECT_INBOX_CHANNEL_TYPE,
        getUserChannelProfile(identity)
      )
      .then(channel => {
        if (!cancelled) {
          setInboxChannelName(channel.channelKey || channel.name)
        }
      })
      .catch(error => {
        if (!cancelled) void onErrorRef.current?.(error)
      })

    return () => {
      cancelled = true
    }
  }, [identity, isReady, ownerAddress])

  const { messages: inboxMessages } = useChannelMessages({
    isReady,
    enabled: Boolean(identity && inboxChannelName),
    channelName: inboxChannelName,
    peerId,
    waitForPeerId: true,
  })

  useEffect(() => {
    if (!identity || !ownerAddress || inboxMessages.length === 0) return
    let cancelled = false

    async function processInvites() {
      for (const message of inboxMessages) {
        const envelope = verifyDirectKeyEnvelope(message.content, ownerAddress)
        if (
          !envelope ||
          normalizeDirectAddress(message.author) !== envelope.fromAddress
        ) {
          continue
        }

        const processKey = `${envelope.fromAddress}:${envelope.signature}`
        if (processingRef.current.has(processKey)) continue
        const existing = contactsRef.current[envelope.fromAddress]
        if (existing?.removed) continue

        processingRef.current.add(processKey)
        try {
          const contact =
            updateContact(envelope.fromAddress, {
              publicKey: envelope.publicKey,
              displayName: envelope.displayName || existing?.displayName,
              status: 'ready',
              removed: false,
            }) || existing
          const channel = await ensureDirectChannel(envelope.fromAddress)
          if (!existing?.keySent) {
            await sendKeyEnvelope(envelope.fromAddress)
            updateContact(envelope.fromAddress, { keySent: true })
          }
          if (!cancelled && contact) {
            onDirectChannelReadyRef.current?.(channel, {
              ...contact,
              keySent: true,
            })
          }
        } catch (error) {
          processingRef.current.delete(processKey)
          if (!cancelled) void onErrorRef.current?.(error)
        }
      }
    }

    void processInvites()
    return () => {
      cancelled = true
    }
  }, [
    ensureDirectChannel,
    identity,
    inboxMessages,
    ownerAddress,
    sendKeyEnvelope,
    updateContact,
  ])

  const addContact = useCallback(
    async (address: string) => {
      const peerAddress = normalizeDirectAddress(address)
      if (!peerAddress) throw new TypeError('INVALID_ADDRESS')
      if (!identity || !ownerAddress) throw new Error('LOGIN_REQUIRED')
      if (peerAddress === ownerAddress) throw new TypeError('SELF_ADDRESS')

      const existing = contactsRef.current[peerAddress]
      updateContact(peerAddress, {
        status: existing?.publicKey ? 'ready' : 'pending',
        removed: false,
      })
      const channel = await ensureDirectChannel(peerAddress)
      await sendKeyEnvelope(peerAddress)
      const sentContact = updateContact(peerAddress, {
        keySent: true,
        removed: false,
      }) as DirectContact

      return { channel, contact: sentContact }
    },
    [
      ensureDirectChannel,
      identity,
      ownerAddress,
      sendKeyEnvelope,
      updateContact,
    ]
  )

  const removeContact = useCallback(
    (address: string) => {
      updateContact(address, {
        status: 'pending',
        keySent: false,
        removed: true,
      })
    },
    [updateContact]
  )

  const contacts = useMemo(
    () =>
      Object.values(contactsByAddress)
        .filter(contact => !contact.removed)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [contactsByAddress]
  )

  return {
    contacts,
    inboxReady: Boolean(inboxChannelName),
    addContact,
    removeContact,
  }
}
