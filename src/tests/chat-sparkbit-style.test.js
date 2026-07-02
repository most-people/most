import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

function extractSparkbitStyles(source) {
  const startMarker = '/* === SparkBit Chat Theme === */'
  const endMarker = '/* === End SparkBit Chat Theme === */'
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.ok(end > start)

  return source.slice(start, end)
}

function extractCssBlock(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1)

  const bodyStart = source.indexOf('{', start) + 1
  const bodyEnd = source.indexOf('}', bodyStart)
  assert.notEqual(bodyEnd, -1)

  return source.slice(bodyStart, bodyEnd)
}

describe('sparkbit chat styling', () => {
  it('wires the SparkBit chat class and portal menus from theme identity', () => {
    const chatPage = readSource('src/features/chat/ChatPage.tsx')

    assert.match(chatPage, /const isInviteUser = userIdentity\?\.theme === 'sparkbit'/)
    assert.match(
      chatPage,
      /const chatLayoutClassName = \[[\s\S]*'chat-app-layout'[\s\S]*isInviteUser \? 'sparkbit-chat-layout' : ''/
    )
    assert.match(chatPage, /className=\{chatLayoutClassName\}/)
    assert.match(
      chatPage,
      /const sparkbitActionMenuClassName = isInviteUser[\s\S]*\? 'sparkbit-chat-action-menu'/
    )
    assert.match(chatPage, /menuClassName=\{sparkbitActionMenuClassName\}/)
    assert.match(
      chatPage,
      /attachmentMenuClassName=\{sparkbitActionMenuClassName\}/
    )
  })

  it('hides voice call affordances for the SparkBit chat theme', () => {
    const chatPage = readSource('src/features/chat/ChatPage.tsx')
    const chatUi = readSource('src/components/ChatUi.tsx')

    assert.match(
      chatPage,
      /const shouldShowVoiceBanner =\s*!isInviteUser &&[\s\S]*isVoiceRoomForActiveChannel/
    )
    assert.match(chatPage, /showVoiceRoom=\{!isInviteUser\}/)
    assert.match(chatUi, /showVoiceRoom = true/)
    assert.match(
      chatUi,
      /\.\.\.\(showVoiceRoom\s*\?\s*\[[\s\S]*VOICE_MENU_OPTION[\s\S]*:\s*\[\]\)/
    )
  })

  it('keeps the SparkBit chat theme flat, purple, and circular-avatar aligned', () => {
    const chatStyles = readSource('src/styles/chat.css')
    const sparkbitStyles = extractSparkbitStyles(chatStyles)
    const nonFlatBoxShadowLines = sparkbitStyles
      .split('\n')
      .map(line => line.trim())
      .filter(
        line => line.includes('box-shadow:') && !/^box-shadow:\s*none;?$/.test(line)
      )

    assert.match(sparkbitStyles, /--accent:\s*#6A60FF/i)
    assert.match(
      sparkbitStyles,
      /\.sparkbit-chat-layout \.chat-message\.self \.message-bubble\s*\{[\s\S]*background:\s*var\(--accent\)/
    )
    assert.match(
      sparkbitStyles,
      /\.sparkbit-chat-layout \.msg-avatar,[\s\S]*\.sparkbit-chat-layout \.channel-member-avatar,[\s\S]*border-radius:\s*50%/
    )
    assert.match(
      sparkbitStyles,
      /\.sparkbit-chat-layout \.chat-message \.message-bubble\s*\{[\s\S]*box-shadow:\s*none/
    )
    assert.match(
      sparkbitStyles,
      /\.sparkbit-chat-layout \.chat-attachment-card,[\s\S]*box-shadow:\s*none/
    )
    assert.deepEqual(nonFlatBoxShadowLines, [])
    assert.doesNotMatch(sparkbitStyles, /linear-gradient|radial-gradient/)
  })

  it('lifts SparkBit dark chat surfaces away from pure black', () => {
    const chatStyles = readSource('src/styles/chat.css')
    const sparkbitStyles = extractSparkbitStyles(chatStyles)
    const darkBlock = extractCssBlock(
      sparkbitStyles,
      "[data-theme='dark'] .sparkbit-chat-layout,\n[data-theme='dark'] .sparkbit-chat-action-menu"
    )

    assert.match(darkBlock, /--sparkbit-chat-surface:\s*#08080a/i)
    assert.match(darkBlock, /--sparkbit-chat-panel:\s*#121216/i)
    assert.match(darkBlock, /--sparkbit-chat-panel-soft:\s*#1a1a20/i)
    assert.doesNotMatch(darkBlock, /--sparkbit-chat-surface:\s*#0{3,6}\b/i)
  })
})
