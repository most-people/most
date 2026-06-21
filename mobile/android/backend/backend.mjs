/* global BareKit, Bare */

import { COMMANDS, EVENTS } from '../rpc-commands.mjs'
import { createEvent, encodeEvent } from './protocol.mjs'
import { MobileP2PCore } from './mobile-core.mjs'

const { IPC } = BareKit

let core = null

function send(type, payload = {}, requestId = '') {
  IPC.write(encodeEvent(createEvent(type, payload, requestId)))
}

function getCore() {
  if (!core) {
    const storagePath = Bare.argv[2] || ''
    core = new MobileP2PCore({
      storagePath,
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
      const snapshot = await getCore().start()
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

    if (command.type === COMMANDS.LOG_LIST) {
      send(EVENTS.SNAPSHOT, getCore().getSnapshot(), requestId)
      return
    }

    send(EVENTS.ERROR, { message: `Unsupported command: ${command.type}` }, requestId)
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

IPC.on('data', data => {
  for (const line of data.toString().split('\n')) {
    if (!line.trim()) continue

    try {
      handleCommand(JSON.parse(line)).catch(error => {
        send(EVENTS.ERROR, {
          message: error instanceof Error ? error.message : 'Command failed',
        })
      })
    } catch (error) {
      send(EVENTS.ERROR, {
        message: error?.message || 'Invalid command payload',
      })
    }
  }
})

send(EVENTS.SNAPSHOT, {
  node: {
    status: 'idle',
    peerCount: 0,
    storagePath: Bare.argv[2] || '',
    error: '',
  },
  holdings: [],
  transfers: [],
  logs: [],
})
