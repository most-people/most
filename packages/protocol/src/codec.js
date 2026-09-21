/**
 * Byte/string codecs shared by every runtime (Node, browser, Bare).
 *
 * There is no `b4a` dependency here on purpose: Bare does not ship `Buffer`,
 * so this package stays on `Uint8Array` + `TextEncoder`/`TextDecoder` only.
 */

export function toUint8Array(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return new Uint8Array(0)
}

export function bytesToHex(bytes) {
  let output = ''
  for (const byte of toUint8Array(bytes)) {
    output += byte.toString(16).padStart(2, '0')
  }
  return output
}

export function hexToBytes(value) {
  const hex = String(value || '').trim()
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return new Uint8Array(0)
  }

  const output = new Uint8Array(hex.length / 2)
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return output
}

export function utf8ToBytes(value) {
  return new TextEncoder().encode(String(value ?? ''))
}

export function bytesToUtf8(bytes) {
  return new TextDecoder().decode(toUint8Array(bytes))
}
