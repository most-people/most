import b4a from 'b4a'
import TextDecoderCompat from 'text-decoder'

class EventShim {
  static NONE = 0
  static CAPTURING_PHASE = 1
  static AT_TARGET = 2
  static BUBBLING_PHASE = 3

  constructor(type, init = {}) {
    this.type = String(type)
    this.bubbles = Boolean(init.bubbles)
    this.cancelable = Boolean(init.cancelable)
    this.composed = Boolean(init.composed)
    this.currentTarget = null
    this.defaultPrevented = false
    this.eventPhase = EventShim.NONE
    this.isTrusted = false
    this.target = null
    this.timeStamp = Date.now()
  }

  composedPath() {
    return this.target ? [this.target] : []
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true
    }
  }

  stopImmediatePropagation() {}

  stopPropagation() {}
}

class CustomEventShim extends EventShim {
  constructor(type, init = {}) {
    super(type, init)
    this.detail = init.detail ?? null
  }
}

class EventTargetShim {
  #listeners = new Map()

  addEventListener(type, listener, options = {}) {
    if (!listener) return
    const eventType = String(type)
    const entries = this.#listeners.get(eventType) || []
    if (entries.some(entry => entry.listener === listener)) return

    entries.push({
      listener,
      once: typeof options === 'object' && Boolean(options.once),
    })
    this.#listeners.set(eventType, entries)
  }

  removeEventListener(type, listener) {
    if (!listener) return
    const eventType = String(type)
    const entries = this.#listeners.get(eventType)
    if (!entries) return

    this.#listeners.set(
      eventType,
      entries.filter(entry => entry.listener !== listener)
    )
  }

  dispatchEvent(event) {
    const entries = [...(this.#listeners.get(event.type) || [])]
    event.target ||= this
    event.currentTarget = this
    event.eventPhase = EventShim.AT_TARGET

    for (const entry of entries) {
      if (typeof entry.listener === 'function') {
        entry.listener.call(this, event)
      } else {
        entry.listener.handleEvent(event)
      }

      if (entry.once) {
        this.removeEventListener(event.type, entry.listener)
      }
    }

    event.currentTarget = null
    event.eventPhase = EventShim.NONE
    return !event.defaultPrevented
  }
}

class TextDecoderShim {
  constructor(encoding = 'utf-8') {
    this.encoding = String(encoding).toLowerCase()
  }

  decode(input = new Uint8Array()) {
    const decoder = new TextDecoderCompat(this.encoding)
    return decoder.end(input)
  }
}

class TextEncoderShim {
  encoding = 'utf-8'

  encode(input = '') {
    return b4a.from(String(input), 'utf8')
  }

  encodeInto(input = '', destination) {
    const encoded = this.encode(input)
    const written = Math.min(encoded.byteLength, destination.byteLength)
    destination.set(encoded.subarray(0, written))
    return {
      read: String(input).length,
      written,
    }
  }
}

if (typeof globalThis.Event !== 'function') {
  globalThis.Event = EventShim
}

if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = CustomEventShim
}

if (typeof globalThis.EventTarget !== 'function') {
  globalThis.EventTarget = EventTargetShim
}

if (typeof globalThis.TextDecoder !== 'function') {
  globalThis.TextDecoder = TextDecoderShim
}

if (typeof globalThis.TextEncoder !== 'function') {
  globalThis.TextEncoder = TextEncoderShim
}
