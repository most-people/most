/* global BareKit, Bare */

import './text-encoding-shim.mjs'
import { COMMANDS, EVENTS } from '../rpc-commands.mjs'
import { createEvent, createJsonLineParser, encodeEvent } from './protocol.mjs'
import { MobileP2PCore } from './mobile-core.mjs'

const { IPC } = BareKit

let core = null

function getInitialStoragePath() {
  return Bare.argv[2] || ''
}

function send(type, payload = {}, requestId = '') {
  IPC.write(encodeEvent(createEvent(type, payload, requestId)))
}

function getCore(storagePath = '') {
  if (!core) {
    core = new MobileP2PCore({
      storagePath: storagePath || getInitialStoragePath(),
      send: (type, payload) => send(type, payload),
    })
  }
  return core
}

function commandId(command) {
  return command?.id || command?.requestId || ''
}

async function handleCommand(command) {
  const requestId = commandId(command)
  const payload = command?.payload || {}

  try {
    if (command.type === COMMANDS.NODE_START) {
      const storagePath =
        typeof payload.storagePath === 'string' ? payload.storagePath : ''
      const snapshot = await getCore(storagePath).start()
      send(EVENTS.NODE_READY, snapshot, requestId)
      return
    }

    if (command.type === COMMANDS.NODE_STOP) {
      await getCore().stop()
      send(EVENTS.SNAPSHOT, getCore().getSnapshot(), requestId)
      return
    }

    if (command.type === COMMANDS.FILE_LIST_HOLDINGS) {
      send(
        EVENTS.SNAPSHOT,
        {
          ...getCore().getSnapshot(),
          holdings: getCore().listHoldings(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.FILE_PUBLISH) {
      const result = await getCore().publishFile(payload, requestId)
      send(EVENTS.PUBLISH_SUCCESS, result, requestId)
      return
    }

    if (command.type === COMMANDS.FILE_DOWNLOAD) {
      const result = await getCore().downloadLink(payload, requestId)
      send(EVENTS.DOWNLOAD_SUCCESS, result, requestId)
      return
    }

    if (command.type === COMMANDS.FILE_EXPORT) {
      const result = await getCore().exportHolding(payload, requestId)
      send(EVENTS.FILE_EXPORT_SUCCESS, result, requestId)
      return
    }

    if (command.type === COMMANDS.FILE_DELETE_HOLDING) {
      const result = await getCore().deleteHolding(payload, requestId)
      send(EVENTS.FILE_DELETE_HOLDING_SUCCESS, result, requestId)
      return
    }

    if (command.type === COMMANDS.CHANNEL_CREATE) {
      const channel = await getCore().createChannel(payload)
      send(
        EVENTS.CHANNEL_JOINED,
        {
          channel,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_LIST) {
      send(
        EVENTS.CHANNEL_STATUS,
        {
          channels: getCore().listChannels(),
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_MESSAGES) {
      const messages = await getCore().getChannelMessages(payload)
      send(
        EVENTS.CHANNEL_STATUS,
        {
          messages,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_SEND) {
      const message = await getCore().sendChannelMessage(payload)
      send(
        EVENTS.CHANNEL_MESSAGE,
        {
          channel: payload.channelName,
          message,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_LEAVE) {
      const result = await getCore().leaveChannel(payload)
      send(EVENTS.CHANNEL_LEFT, result, requestId)
      return
    }

    if (command.type === COMMANDS.CHANNEL_REMARK_SET) {
      const channel = await getCore().setChannelRemark(payload)
      send(
        EVENTS.CHANNEL_UPDATED,
        {
          channel,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_PIN_SET) {
      const channel = await getCore().setChannelPinned(payload)
      send(
        EVENTS.CHANNEL_UPDATED,
        {
          channel,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_PRESENCE_GET) {
      const presences = getCore().getChannelPresence(payload)
      send(
        EVENTS.CHANNEL_PRESENCE,
        {
          presences,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_PRESENCE_JOIN) {
      const presences = getCore().joinChannelPresence(payload)
      send(
        EVENTS.CHANNEL_PRESENCE,
        {
          presences,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_PRESENCE_HEARTBEAT) {
      const presences = getCore().heartbeatChannelPresence(payload)
      send(
        EVENTS.CHANNEL_PRESENCE,
        {
          presences,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.CHANNEL_PRESENCE_LEAVE) {
      const presences = getCore().leaveChannelPresence(payload)
      send(
        EVENTS.CHANNEL_PRESENCE,
        {
          presences,
          snapshot: getCore().getSnapshot(),
        },
        requestId
      )
      return
    }

    if (command.type === COMMANDS.LOG_LIST) {
      send(EVENTS.SNAPSHOT, getCore().getSnapshot(), requestId)
      return
    }

    send(
      EVENTS.ERROR,
      { message: `Unsupported command: ${command.type}` },
      requestId
    )
  } catch (error) {
    send(
      EVENTS.ERROR,
      {
        message: error instanceof Error ? error.message : 'Command failed',
        command: command.type,
      },
      requestId
    )
  }
}

const parseCommandData = createJsonLineParser(
  command => {
    handleCommand(command).catch(error => {
      send(EVENTS.ERROR, {
        message: error instanceof Error ? error.message : 'Command failed',
      })
    })
  },
  error => {
    send(EVENTS.ERROR, {
      message: error?.message || 'Invalid command payload',
    })
  }
)

IPC.on('data', parseCommandData)

send(EVENTS.SNAPSHOT, {
  node: {
    status: 'idle',
    peerCount: 0,
    storagePath: getInitialStoragePath(),
    error: '',
  },
  holdings: [],
  transfers: [],
  channels: [],
  channelMessages: {},
  channelPresence: {},
  logs: [],
})
