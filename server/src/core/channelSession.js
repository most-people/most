// Protocol v2 session frame and feature negotiation: see
// docs/protocol/v2/envelope.md §4.2. The mobile core has an identical copy in
// app/backend/channel-session.mjs; vectors in docs/protocol/vectors/v2/
// session.json keep them equal.

/**
 * Optional features this node supports. `sig1` (signatures) is mandatory for
 * every v2 node and listed only so it can be retired later: signatures are
 * always sent and always required, whatever the peer lists.
 */
export const LOCAL_FEATURES = Object.freeze(['sig1'])

const MAX_FEATURES = 64
const MAX_FEATURE_LENGTH = 32
const FEATURE_REGEX = /^[a-z0-9-]+[0-9]+$/

export function buildSessionFrame() {
  return { v: 2, type: 'session', features: [...LOCAL_FEATURES] }
}

export function isSessionFrame(frame) {
  return frame?.type === 'session'
}

/** Features listed by a received session frame, or null when it is invalid. */
export function parseSessionFeatures(frame) {
  if (frame?.v !== 2 || frame.type !== 'session') return null
  const { features } = frame
  if (!Array.isArray(features) || features.length > MAX_FEATURES) return null
  for (const feature of features) {
    if (
      typeof feature !== 'string' ||
      feature.length > MAX_FEATURE_LENGTH ||
      !FEATURE_REGEX.test(feature)
    ) {
      return null
    }
  }
  return features
}

/**
 * Features both sides list. A peer that sent no (valid) session frame lists
 * none. Frames or fields that depend on a feature go to a connection only
 * when it is in this set.
 */
export function sharedFeatures(remoteFeatures) {
  const remote = new Set(remoteFeatures || [])
  return new Set(LOCAL_FEATURES.filter(feature => remote.has(feature)))
}
