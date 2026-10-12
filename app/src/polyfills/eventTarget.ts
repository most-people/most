type EventInitLike = {
  bubbles?: boolean
  cancelable?: boolean
  composed?: boolean
}

type CustomEventInitLike<T = unknown> = EventInitLike & {
  detail?: T
}

type EventListenerLike =
  | ((event: MostBoxEvent) => void)
  | { handleEvent: (event: MostBoxEvent) => void }

type ListenerEntry = {
  listener: EventListenerLike
  once: boolean
}

class MostBoxEvent {
  static readonly NONE = 0
  static readonly CAPTURING_PHASE = 1
  static readonly AT_TARGET = 2
  static readonly BUBBLING_PHASE = 3

  readonly bubbles: boolean
  readonly cancelable: boolean
  readonly composed: boolean
  readonly isTrusted = false
  readonly timeStamp = Date.now()
  readonly type: string
  currentTarget: unknown = null
  defaultPrevented = false
  eventPhase = MostBoxEvent.NONE
  target: unknown = null

  constructor(type: string, init: EventInitLike = {}) {
    this.type = String(type)
    this.bubbles = Boolean(init.bubbles)
    this.cancelable = Boolean(init.cancelable)
    this.composed = Boolean(init.composed)
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

class MostBoxCustomEvent<T = unknown> extends MostBoxEvent {
  readonly detail: T | null

  constructor(type: string, init: CustomEventInitLike<T> = {}) {
    super(type, init)
    this.detail = init.detail ?? null
  }
}

class MostBoxEventTarget {
  private readonly listeners = new Map<string, ListenerEntry[]>()

  addEventListener(
    type: string,
    listener: EventListenerLike | null,
    options?: { once?: boolean } | boolean
  ) {
    if (!listener) return

    const eventType = String(type)
    const entries = this.listeners.get(eventType) ?? []
    if (entries.some(entry => entry.listener === listener)) return

    entries.push({
      listener,
      once: typeof options === 'object' && Boolean(options.once),
    })
    this.listeners.set(eventType, entries)
  }

  removeEventListener(type: string, listener: EventListenerLike | null) {
    if (!listener) return

    const eventType = String(type)
    const entries = this.listeners.get(eventType)
    if (!entries) return

    this.listeners.set(
      eventType,
      entries.filter(entry => entry.listener !== listener)
    )
  }

  dispatchEvent(event: MostBoxEvent) {
    const entries = [...(this.listeners.get(event.type) ?? [])]
    event.target ||= this
    event.currentTarget = this
    event.eventPhase = MostBoxEvent.AT_TARGET

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
    event.eventPhase = MostBoxEvent.NONE
    return !event.defaultPrevented
  }
}

const globalScope = globalThis as unknown as Record<string, unknown>

if (typeof globalScope.Event !== 'function') {
  globalScope.Event = MostBoxEvent
}

if (typeof globalScope.CustomEvent !== 'function') {
  globalScope.CustomEvent = MostBoxCustomEvent
}

if (typeof globalScope.EventTarget !== 'function') {
  globalScope.EventTarget = MostBoxEventTarget
}
