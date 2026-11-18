// Canonical JSON for v2 signatures (docs/protocol/v2/signatures.md §3): the
// RFC 8785 (JCS) subset over null, booleans, safe integers, well-formed
// strings, arrays and plain objects. The mobile app and core use an identical
// copy in app/shared/canonical-json.mjs; shared vectors keep them equal.

export class CanonicalJsonError extends TypeError {}

// A loop rather than a lookbehind regex, which not every JS engine supports.
function hasLoneSurrogate(text) {
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index++
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true
    }
  }
  return false
}

function fail(message) {
  throw new CanonicalJsonError(message)
}

// Default string comparison in JavaScript is by UTF-16 code units, which is
// exactly the JCS key order.
function compareKeys(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function serialize(value) {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isSafeInteger(value)) fail('only safe integers are allowed')
      if (Object.is(value, -0)) fail('-0 is not allowed')
      return String(value)
    case 'string':
      if (hasLoneSurrogate(value)) fail('lone surrogate in string')
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map(serialize).join(',')}]`
      }
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) {
        fail('only plain objects are allowed')
      }
      const keys = Object.keys(value).sort(compareKeys)
      return `{${keys
        .map(key => {
          if (hasLoneSurrogate(key)) fail('lone surrogate in key')
          return `${JSON.stringify(key)}:${serialize(value[key])}`
        })
        .join(',')}}`
    }
    default:
      return fail(`${typeof value} is not allowed`)
  }
}

/** Canonical JSON text; throws CanonicalJsonError outside the allowed range. */
export function canonicalJson(value) {
  return serialize(value)
}

/** UTF-8 bytes of the canonical JSON text, the input that gets signed. */
export function canonicalJsonBytes(value) {
  return new TextEncoder().encode(canonicalJson(value))
}
