/* global BareKit, Bare */

import { COMMANDS, EVENTS } from '../rpc-commands.mjs'
import { createEvent, encodeEvent } from './protocol.mjs'

const { IPC } = BareKit

const state = {
  storagePath: Bare.argv[2] || '',
  holdings: [],
}

function send(type, payload) {
  IPC.write(encodeEvent(createEvent(type, payload)))
}

function handleCommand(command) {
  if (command.type === COMMANDS.NODE_START) {
    send(EVENTS.NODE_READY, {
      storagePath: state.storagePath,
      holdings: state.holdings,
    })
    return
  }

  if (command.type === COMMANDS.FILE_LIST_HOLDINGS) {
    send(EVENTS.SNAPSHOT, {
      holdings: state.holdings,
    })
    return
  }

  send(EVENTS.ERROR, {
    message: `Unsupported command: ${command.type}`,
  })
}

IPC.on('data', data => {
  for (const line of data.toString().split('\n')) {
    if (!line.trim()) continue

    try {
      handleCommand(JSON.parse(line))
    } catch (error) {
      send(EVENTS.ERROR, {
        message: error?.message || 'Invalid command payload',
      })
    }
  }
})

send(EVENTS.NODE_READY, {
  storagePath: state.storagePath,
  holdings: state.holdings,
})
