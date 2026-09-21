import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'

import { ChatComposer } from '~/components/ChatUi'
import { I18nProvider } from '~/lib/i18n'

/**
 * Chat composer integration tests.
 *
 * The mention draft maths is already covered by `chat-mentions.test.js`. What
 * was untested is the component contract around it, and that is where the
 * Chinese IME risk lives:
 *
 *  - Enter must not send while an IME composition is in progress, otherwise
 *    committing a candidate sends a half-typed message.
 *  - A change must report the selection so the mention trigger is computed
 *    against the real caret, not an assumed end-of-string.
 *  - Composition end must report the selection too, because the caret only
 *    settles after the IME commits.
 */
function renderComposer(
  overrides: Partial<Parameters<typeof ChatComposer>[0]> = {}
) {
  const props = {
    message: '',
    placeholder: 'Type a message',
    onMessageChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onCompositionChange: vi.fn(),
    onSend: vi.fn(),
    onComposerKeyDown: vi.fn(() => false),
    ...overrides,
  }
  const ui = (
    <I18nProvider>
      <ChatComposer {...props} />
    </I18nProvider>
  ) as ReactElement
  const rendered = render(ui)
  const textarea = rendered.container.querySelector(
    'textarea'
  ) as HTMLTextAreaElement
  return { ...rendered, textarea, props }
}

describe('ChatComposer input contract', () => {
  it('renders the current message', () => {
    const { textarea } = renderComposer({ message: 'hello' })
    expect(textarea.value).toBe('hello')
  })

  it('reports the value together with the selection on change', () => {
    const onMessageChange = vi.fn()
    const { textarea } = renderComposer({ onMessageChange })

    fireEvent.change(textarea, {
      target: { value: 'hi @ali', selectionStart: 7, selectionEnd: 7 },
    })

    expect(onMessageChange).toHaveBeenCalledWith('hi @ali', 7, 7)
  })

  it('reports the selection on select', () => {
    const onSelectionChange = vi.fn()
    const { textarea } = renderComposer({
      message: 'hi @ali',
      onSelectionChange,
    })

    textarea.setSelectionRange(4, 7)
    fireEvent.select(textarea)

    expect(onSelectionChange).toHaveBeenCalledWith(4, 7)
  })

  it('reports the selection on key up', () => {
    const onSelectionChange = vi.fn()
    const { textarea } = renderComposer({
      message: 'hi @ali',
      onSelectionChange,
    })

    textarea.setSelectionRange(3, 3)
    fireEvent.keyUp(textarea, { key: 'ArrowLeft' })

    expect(onSelectionChange).toHaveBeenCalledWith(3, 3)
  })
})

describe('ChatComposer IME composition', () => {
  it('flags composition start and end', () => {
    const onCompositionChange = vi.fn()
    const { textarea } = renderComposer({ onCompositionChange })

    fireEvent.compositionStart(textarea)
    expect(onCompositionChange).toHaveBeenLastCalledWith(true)

    fireEvent.compositionEnd(textarea)
    expect(onCompositionChange).toHaveBeenLastCalledWith(false)
  })

  it('reports the selection when composition ends', () => {
    const onSelectionChange = vi.fn()
    const { textarea } = renderComposer({
      message: '你好',
      onSelectionChange,
    })

    textarea.setSelectionRange(2, 2)
    fireEvent.compositionEnd(textarea)

    expect(onSelectionChange).toHaveBeenCalledWith(2, 2)
  })

  it('does not send on the Enter that commits an IME candidate', () => {
    const onSend = vi.fn()
    const { textarea } = renderComposer({ message: '你好', onSend })

    // Enter during composition carries isComposing; the component must swallow it.
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on Enter once composition has finished', () => {
    const onSend = vi.fn()
    const { textarea } = renderComposer({ message: '你好', onSend })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
  })
})

describe('ChatComposer keyboard behaviour', () => {
  it('lets the mention handler take the key first', () => {
    const onSend = vi.fn()
    const onComposerKeyDown = vi.fn(() => true)
    const { textarea } = renderComposer({
      message: '@ali',
      onSend,
      onComposerKeyDown,
    })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onComposerKeyDown).toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('inserts a newline on shift+Enter instead of sending', () => {
    const onSend = vi.fn()
    const { textarea } = renderComposer({ message: 'hi', onSend })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('ignores keys other than Enter', () => {
    const onSend = vi.fn()
    const { textarea } = renderComposer({ message: 'hi', onSend })

    fireEvent.keyDown(textarea, { key: 'a' })

    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatComposer send button', () => {
  it('is disabled for a blank message', () => {
    const { container } = renderComposer({ message: '   ' })
    const send = container.querySelector('.send-btn') as HTMLButtonElement
    expect(send.disabled).toBe(true)
  })

  it('is enabled for a non-blank message and sends on click', () => {
    const onSend = vi.fn()
    const { container } = renderComposer({ message: 'hi', onSend })
    const send = container.querySelector('.send-btn') as HTMLButtonElement

    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('is disabled while a message is sending', () => {
    const { container } = renderComposer({
      message: 'hi',
      isSendingMessage: true,
    })
    const send = container.querySelector('.send-btn') as HTMLButtonElement
    expect(send.disabled).toBe(true)
  })

  it('is disabled when the composer is disabled', () => {
    const { container } = renderComposer({ message: 'hi', disabled: true })
    const send = container.querySelector('.send-btn') as HTMLButtonElement
    expect(send.disabled).toBe(true)
  })
})

describe('ChatComposer attachment reporting', () => {
  it('reports the selected files and clears the input', () => {
    const onSelectAttachmentFiles = vi.fn()
    const { container } = renderComposer({ onSelectAttachmentFiles })
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const file = new File(['x'], 'photo.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    const passed = onSelectAttachmentFiles.mock.calls[0][0] as File[]
    expect(passed.map(f => f.name)).toEqual(['photo.png'])
    expect(input.value).toBe('')
  })
})
