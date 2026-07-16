import b4a from 'b4a'
import Protomux from 'protomux'

export const CHANNEL_CONTROL_PROTOCOL = 'mostbox/channel/1'
export const MAX_CHANNEL_CONTROL_MESSAGE_BYTES = 128 * 1024

export function openChannelControlProtocol(stream, options = {}) {
  const existingMux = stream?.noiseStream?.userData
  const mux = Protomux.isProtomux(existingMux)
    ? existingMux
    : Protomux.from(stream)
  let wireMessage = null
  const channel = mux.createChannel({
    protocol: CHANNEL_CONTROL_PROTOCOL,
    onopen() {
      options.onOpen?.()
    },
    onclose() {
      options.onClose?.()
    },
  })
  if (!channel) return null
  wireMessage = channel.addMessage({
    onmessage(buffer) {
      if (!buffer || buffer.byteLength > MAX_CHANNEL_CONTROL_MESSAGE_BYTES) {
        return
      }
      try {
        const message = JSON.parse(b4a.toString(buffer))
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          return
        }
        Promise.resolve(options.onMessage?.(message)).catch(() => {})
      } catch {}
    },
  })
  channel.open()
  return {
    channel,
    send(message) {
      if (!wireMessage || !message) return false
      const buffer = b4a.from(JSON.stringify(message))
      if (buffer.byteLength > MAX_CHANNEL_CONTROL_MESSAGE_BYTES) return false
      return wireMessage.send(buffer, channel)
    },
  }
}
