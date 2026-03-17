import encoding from 'text-encoding'
import bareCrypto from 'bare-crypto'

// Polyfill TextEncoder/TextDecoder
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = encoding
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Polyfill crypto
if (typeof crypto === 'undefined') {
  global.crypto = bareCrypto.webcrypto || bareCrypto
}

// Polyfill Event
if (typeof Event === 'undefined') {
  global.Event = class Event {
    constructor(type, options) {
      this.type = type
      this.bubbles = options?.bubbles ?? false
      this.cancelable = options?.cancelable ?? false
      this.composed = options?.composed ?? false
      this.timeStamp = Date.now()
    }
  }
}

// Polyfill CustomEvent (just in case)
if (typeof CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEvent extends Event {
    constructor(type, options) {
      super(type, options)
      this.detail = options?.detail ?? null
    }
  }
}
