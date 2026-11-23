import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Hyperswarm from 'hyperswarm'
import createTestnet from 'hyperdht/testnet.js'
import { MostBoxEngine } from '../server/src/index.js'
import { MobileP2PCore } from '../app/backend/mobile-core.mjs'
import { createRequire } from 'node:module'
import b4a from 'b4a'
import { Wallet } from 'ethers'
import {
  sendTestMessage,
  presenceOptions,
  updateTestProfile,
} from '../server/tests/helpers/signedMessage.js'
import {
  signedInput,
  signProfile,
  signPresence,
  defaultWallet,
} from '../app/backend/signed-message.test-helper.mjs'
import { calculateCid } from '../server/src/core/cid.js'
import { getCidInfo } from '../server/src/core/cidTopic.js'
import {
  createChannelKey,
  encodeChannelCredential,
} from '../server/src/core/channelKeysV2.js'

// createSwarm below gives the mobile core this package's Hyperswarm.
const DHT = createRequire(createRequire(import.meta.url).resolve('hyperswarm'))(
  'hyperdht'
)

it(
  'mobile core finds the seed after its first topic lookup missed it',
  { timeout: 120000 },
  async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-cross-miss-'))
    const testnet = await createTestnet(3)
    const original = {
      announce: DHT.prototype.announce,
      lookup: DHT.prototype.lookup,
    }
    const nodes = []
    t.after(async () => {
      Object.assign(DHT.prototype, original)
      await Promise.allSettled(nodes.map(node => node.stop()))
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    })

    const content = Buffer.from('found by the mobile core on a later lookup')
    const { topic } = getCidInfo((await calculateCid(content)).cid.toString())
    // Every query the mobile core makes for the topic in its first 3 seconds
    // returns no peers, so only a later lookup can find the desktop. The
    // desktop's DHT is left alone.
    const desktopDhts = new Set()
    let mobileStartedAt = 0
    let missed = 0
    for (const method of ['announce', 'lookup']) {
      DHT.prototype[method] = function (...args) {
        const query = original[method].apply(this, args)
        if (!b4a.equals(args[0], topic)) return query
        if (!mobileStartedAt) desktopDhts.add(this)
        if (
          !mobileStartedAt ||
          desktopDhts.has(this) ||
          Date.now() - mobileStartedAt > 3000
        ) {
          return query
        }
        missed += 1
        return {
          get closestNodes() {
            return query.closestNodes
          },
          destroy: () => query.destroy(),
          async *[Symbol.asyncIterator]() {
            for await (const data of query) yield { ...data, peers: [] }
          },
        }
      }
    }

    const desktop = new MostBoxEngine({
      dataPath: path.join(directory, 'desktop'),
      bootstrap: testnet.bootstrap,
    })
    await desktop.start()
    nodes.push(desktop)
    const { cid } = await desktop.publishFile(content, 'late.txt')
    mobileStartedAt = Date.now()
    const mobile = new MobileP2PCore({
      storagePath: path.join(directory, 'mobile'),
      createSwarm: options =>
        new Hyperswarm({ ...options, bootstrap: testnet.bootstrap }),
    })
    await mobile.start()
    nodes.push(mobile)
    const download = await mobile.downloadLink({
      link: `most://${cid}?filename=late.txt`,
      timeout: 20000,
    })
    assert.ok(missed > 0)
    assert.deepEqual(fs.readFileSync(download.savedPath), content)
  }
)

// Desktop engine and mobile core are separate implementations of the CID
// drive protocol; they must exchange files in both directions over a real
// (local) DHT.
it(
  'transfers files between the desktop engine and the mobile core',
  { timeout: 120000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-cross-core-'))
    const testnet = await createTestnet(3)
    const bootstrap = testnet.bootstrap
    const nodes = []

    try {
      const desktop = new MostBoxEngine({
        dataPath: path.join(directory, 'desktop'),
        bootstrap,
        downloadTimeout: 30000,
      })
      await desktop.start()
      nodes.push(desktop)

      const mobile = new MobileP2PCore({
        storagePath: path.join(directory, 'mobile'),
        createSwarm: options => new Hyperswarm({ ...options, bootstrap }),
      })
      await mobile.start()
      nodes.push(mobile)

      const fromDesktop = Buffer.from('published by the desktop engine')
      const desktopPublished = await desktop.publishFile(
        fromDesktop,
        'desktop.txt'
      )
      const mobileDownload = await mobile.downloadLink({
        link: `most://${desktopPublished.cid}?filename=desktop.txt`,
        timeout: 30000,
      })
      assert.deepEqual(fs.readFileSync(mobileDownload.savedPath), fromDesktop)
      assert.equal(mobileDownload.holding.cid, desktopPublished.cid)

      const fromMobile = Buffer.from('published by the mobile core')
      const mobilePublished = await mobile.publishFile({
        name: 'mobile.txt',
        contentBase64: fromMobile.toString('base64'),
      })
      const desktopDownload = await desktop.downloadFile(
        mobilePublished.transfer.link,
        null,
        { timeout: 30000 }
      )
      assert.equal(desktopDownload.localAvailable, true)
      assert.deepEqual(
        (await desktop.readFileRaw(mobilePublished.holding.cid)).buffer,
        fromMobile
      )
    } finally {
      await Promise.allSettled(nodes.map(node => node.stop()))
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)

async function waitForMessage(read, content, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const messages = await read()
    if (messages.some(message => message.content === content)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.fail(`Timed out waiting for message: ${content}`)
}

async function waitForChannelState(check, description) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.fail('Timed out waiting for ' + description)
}

// Protocol v2 channels (docs/protocol/v2/channel-keys.md): both cores must
// derive the same topics and proofs from a channel handle and exchange
// messages over a real (local) DHT, for a private credential and a public name.
it(
  'exchanges chat messages between the desktop engine and the mobile core',
  { timeout: 180000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-cross-chat-'))
    const testnet = await createTestnet(3)
    const bootstrap = testnet.bootstrap
    const nodes = []
    const ownerWallet = Wallet.createRandom()
    const owner = ownerWallet.address.toLowerCase()

    try {
      const desktop = new MostBoxEngine({
        dataPath: path.join(directory, 'desktop'),
        bootstrap,
      })
      await desktop.start()
      nodes.push(desktop)
      const mobile = new MobileP2PCore({
        storagePath: path.join(directory, 'mobile'),
        createSwarm: options => new Hyperswarm({ ...options, bootstrap }),
      })
      await mobile.start()
      nodes.push(mobile)

      const credential = encodeChannelCredential(createChannelKey())
      for (const handle of [credential, 'cross-core-public']) {
        const desktopChannel = await desktop.createChannel(handle, 'group', {
          ownerAddress: owner,
        })
        const mobileChannel = await mobile.createChannel({ name: handle })
        assert.equal(mobileChannel.channelKey, desktopChannel.channelKey)

        await sendTestMessage(desktop, handle, `desktop says hi in ${handle}`, {
          signer: ownerWallet,
          ownerAddress: owner,
          authorName: 'Desktop',
        })
        // Each side verifies the other's device signature (signatures.md §4.4).
        await mobile.sendChannelMessage(
          await signedInput(mobile, {
            channelName: handle,
            authorName: 'Android',
            content: `mobile says hi in ${handle}`,
          })
        )

        await waitForMessage(
          () => mobile.getChannelMessages({ channelName: handle }),
          `desktop says hi in ${handle}`
        )
        await waitForMessage(
          () => desktop.getChannelMessages(handle, { ownerAddress: owner }),
          `mobile says hi in ${handle}`
        )

        const channelName = mobileChannel.channelKey
        await updateTestProfile(desktop, handle, {
          signer: ownerWallet,
          ownerAddress: owner,
          displayName: 'Desktop profile',
          tag: { default: 'Member' },
        })
        const mobileProfile = await signProfile(channelName, {
          displayName: 'Mobile profile',
        })
        await mobile.updateChannelMemberProfile({
          channelName,
          signed: mobileProfile,
        })
        await waitForChannelState(
          async () =>
            (await mobile.getChannelMemberProfiles({ channelName })).some(
              member =>
                member.address === owner && member.tag?.default === 'Member'
            ),
          'desktop profile on mobile'
        )
        await waitForChannelState(
          () =>
            desktop
              .getChannelMemberProfiles(handle, { ownerAddress: owner })
              .some(
                member =>
                  member.address === mobileProfile.body.author &&
                  member.displayName === 'Mobile profile'
              ),
          'mobile profile on desktop'
        )
        assert.equal(
          (await mobile.getChannelMessages({ channelName })).length,
          2
        )
        const desktopInput = (status, sessionId, fields) =>
          presenceOptions(desktop, handle, status, {
            signer: ownerWallet,
            ownerAddress: owner,
            sessionId,
            ...fields,
          })
        const onMobile = () =>
          mobile
            .getChannelPresence({ channelName })
            .find(item => item.address === owner)
        desktop.joinChannelPresence(
          handle,
          await desktopInput('online', 'tab-a')
        )
        desktop.joinChannelPresence(
          handle,
          await desktopInput('online', 'tab-b', { displayName: 'Both tabs' })
        )
        await waitForChannelState(
          () => onMobile()?.displayName === 'Both tabs',
          'both desktop tabs'
        )
        desktop.leaveChannelPresence(
          handle,
          await desktopInput('offline', 'tab-a')
        )
        // Profile changes cannot make an offline account online. Seeing this
        // update proves that the preceding leave was processed with tab B alive.
        desktop.updateChannelPresenceProfile(
          handle,
          await desktopInput('profile', 'tab-b', { displayName: 'Tab B' })
        )
        await waitForChannelState(
          () => onMobile()?.displayName === 'Tab B',
          'surviving desktop tab'
        )
        desktop.leaveChannelPresence(
          handle,
          await desktopInput('offline', 'tab-b')
        )
        await waitForChannelState(() => !onMobile(), 'last desktop tab leaving')

        const onDesktop = () =>
          desktop
            .getChannelPresence(handle, { ownerAddress: owner })
            .find(item => item.address === defaultWallet.address.toLowerCase())
        const mobileInput = async status => ({
          channelName,
          signed: await signPresence(channelName, status, {
            sessionId: 'phone',
          }),
        })
        mobile.joinChannelPresence(await mobileInput('online'))
        await waitForChannelState(onDesktop, 'mobile session on desktop')
        mobile.leaveChannelPresence(await mobileInput('offline'))
        await waitForChannelState(() => !onDesktop(), 'mobile session leaving')
      }
    } finally {
      await Promise.allSettled(nodes.map(node => node.stop()))
      await testnet.destroy()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
)
