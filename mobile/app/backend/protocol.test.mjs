import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createJsonLineParser } from './protocol.mjs'

describe('backend JSON line parser', () => {
  it('waits for a full newline-delimited command across IPC chunks', () => {
    const messages = []
    const errors = []
    const parse = createJsonLineParser(
      message => messages.push(message),
      error => errors.push(error)
    )
    const command = {
      id: 'publish_1',
      type: 'file.publish',
      payload: {
        name: 'large.bin',
        contentBase64: 'A'.repeat(70_000),
      },
    }
    const line = `${JSON.stringify(command)}\n`

    parse(Buffer.from(line.slice(0, 65_536)))
    assert.equal(messages.length, 0)
    assert.equal(errors.length, 0)

    parse(Buffer.from(line.slice(65_536)))
    assert.equal(messages.length, 1)
    assert.equal(errors.length, 0)
    assert.equal(messages[0].payload.contentBase64.length, 70_000)
  })

  it('parses multiple commands delivered in one IPC chunk', () => {
    const messages = []
    const parse = createJsonLineParser(message => messages.push(message))

    parse(Buffer.from('{"type":"node.start"}\n{"type":"log.list"}\n'))

    assert.deepEqual(
      messages.map(message => message.type),
      ['node.start', 'log.list']
    )
  })

  it('reports malformed lines without dropping the next complete command', () => {
    const messages = []
    const errors = []
    const parse = createJsonLineParser(
      message => messages.push(message),
      error => errors.push(error)
    )

    parse(Buffer.from('not-json\n{"type":"node.start"}\n'))

    assert.equal(errors.length, 1)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].type, 'node.start')
  })
})
