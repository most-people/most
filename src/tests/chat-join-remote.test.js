import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

async function importRemoteModule() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/chatJoinRemote.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
}

const { retryChatJoinConnection, shouldConnectChatJoinInviteNode } =
  await importRemoteModule()

async function advanceTimers(context, milliseconds) {
  context.mock.timers.tick(milliseconds)
  await setImmediate()
}

test('returns the first successful connection without retrying', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const expected = { ok: true, backendUrl: 'https://node.example' }
  const probe = context.mock.fn(async () => expected)

  assert.equal(
    await retryChatJoinConnection(probe, new AbortController().signal),
    expected
  )
  await advanceTimers(context, 7000)
  assert.equal(probe.mock.callCount(), 1)
})

test('retries after exactly 1, 2 and 4 seconds and returns the fourth success', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const expected = { ok: true, backendUrl: 'https://node.example' }
  let attempts = 0
  const probe = context.mock.fn(async () => {
    attempts += 1
    return attempts === 4 ? expected : { ok: false, retryable: true }
  })
  const pending = retryChatJoinConnection(probe, new AbortController().signal)
  let settled = false
  void pending.then(() => {
    settled = true
  })
  await setImmediate()

  for (const [index, delay] of [1000, 2000, 4000].entries()) {
    await advanceTimers(context, delay - 1)
    assert.equal(probe.mock.callCount(), index + 1)
    assert.equal(settled, false)
    await advanceTimers(context, 1)
    assert.equal(probe.mock.callCount(), index + 2)
  }

  assert.equal(await pending, expected)
  await advanceTimers(context, 10000)
  assert.equal(probe.mock.callCount(), 4)
})

test('returns the last failure after four attempts and resets the budget on a new call', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const failures = []
  const probe = context.mock.fn(async () => {
    const failure = {
      ok: false,
      retryable: true,
      reason: `failure-${failures.length + 1}`,
    }
    failures.push(failure)
    return failure
  })

  for (let round = 0; round < 2; round += 1) {
    const pending = retryChatJoinConnection(probe, new AbortController().signal)
    await setImmediate()
    for (const delay of [1000, 2000, 4000]) {
      await advanceTimers(context, delay)
    }
    assert.equal(await pending, failures[(round + 1) * 4 - 1])
    await advanceTimers(context, 10000)
    assert.equal(probe.mock.callCount(), (round + 1) * 4)
  }
})

for (const retryable of [false, undefined]) {
  test(`does not retry a failure with retryable=${retryable}`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const expected = { ok: false, retryable, reason: 'http', status: 403 }
    const probe = context.mock.fn(async () => expected)

    assert.equal(
      await retryChatJoinConnection(probe, new AbortController().signal),
      expected
    )
    await advanceTimers(context, 7000)
    assert.equal(probe.mock.callCount(), 1)
  })
}

test('cancels the retry delay without starting another probe', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  const reason = new Error('invite changed')
  const probe = context.mock.fn(async () => ({ ok: false, retryable: true }))
  const pending = retryChatJoinConnection(probe, controller.signal)
  const rejected = assert.rejects(pending, error => error === reason)
  await setImmediate()
  await advanceTimers(context, 999)

  controller.abort(reason)

  await rejected
  await advanceTimers(context, 7000)
  assert.equal(probe.mock.callCount(), 1)
})

for (const result of [{ ok: true }, { ok: false, retryable: true }]) {
  test(`discards a late ${result.ok ? 'success' : 'failure'} after cancellation during the probe`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const controller = new AbortController()
    const reason = new Error('page left')
    const deferred = Promise.withResolvers()
    const probe = context.mock.fn(() => deferred.promise)
    const pending = retryChatJoinConnection(probe, controller.signal)
    const rejected = assert.rejects(pending, error => error === reason)

    controller.abort(reason)
    deferred.resolve(result)

    await rejected
    await advanceTimers(context, 7000)
    assert.equal(probe.mock.callCount(), 1)
  })
}

test('propagates unexpected probe errors without retrying', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const reason = new Error('unexpected probe error')
  const probe = context.mock.fn(async () => {
    throw reason
  })

  await assert.rejects(
    retryChatJoinConnection(probe, new AbortController().signal),
    error => error === reason
  )
  await advanceTimers(context, 7000)
  assert.equal(probe.mock.callCount(), 1)
})

test('does not start a probe when already cancelled', async context => {
  const reason = new Error('obsolete invite')
  const probe = context.mock.fn(async () => ({ ok: true }))

  await assert.rejects(
    retryChatJoinConnection(probe, AbortSignal.abort(reason)),
    error => error === reason
  )
  assert.equal(probe.mock.callCount(), 0)
})

const matchingSelection = {
  inviteNodeUrl: 'https://node.example',
  inviteNodeInvite: 'invite-code',
  hasBackend: true,
  activeBackendUrl: 'https://node.example',
  activeRemoteUrl: 'https://node.example',
  activeRemoteInvite: 'invite-code',
}

test('skips a connected invite node with the same address and invite code', () => {
  assert.equal(shouldConnectChatJoinInviteNode(matchingSelection), false)
  assert.equal(
    shouldConnectChatJoinInviteNode({
      ...matchingSelection,
      inviteNodeUrl: ' https://node.example/// ',
      inviteNodeInvite: ' invite-code ',
      activeRemoteUrl: 'https://node.example/',
    }),
    false
  )
})

test('reconnects the same node when its invite code changes', () => {
  assert.equal(
    shouldConnectChatJoinInviteNode({
      ...matchingSelection,
      activeRemoteInvite: 'other-invite',
    }),
    true
  )
})

test('connects the invite node when the active backend is local', () => {
  assert.equal(
    shouldConnectChatJoinInviteNode({
      ...matchingSelection,
      activeBackendUrl: 'http://localhost:1976',
    }),
    true
  )
})

test('reconnects when the saved matching node is not connected', () => {
  assert.equal(
    shouldConnectChatJoinInviteNode({
      ...matchingSelection,
      hasBackend: false,
    }),
    true
  )
})

test('does not connect when the invite has no node address', () => {
  assert.equal(
    shouldConnectChatJoinInviteNode({
      ...matchingSelection,
      inviteNodeUrl: undefined,
    }),
    false
  )
})
