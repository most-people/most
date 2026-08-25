import { getPasskeyPrfInput } from '~server/src/utils/passkeyIdentity.js'

type PrfExtensionInput = {
  prf: {
    eval: {
      first: BufferSource
    }
  }
}

type PrfExtensionOutput = {
  prf?: {
    enabled?: boolean
    results?: {
      first?: ArrayBuffer
    }
  }
}

export type PasskeyCeremonyMode = 'create' | 'authenticate'

export type PasskeyCeremonyResult = {
  credentialId: Uint8Array
  prfOutput: Uint8Array
}

export const PASSKEY_ERROR_CODES = {
  unavailable: 'PASSKEY_UNAVAILABLE',
  wrongOrigin: 'PASSKEY_WRONG_ORIGIN',
  cancelled: 'PASSKEY_CANCELLED',
  noCredential: 'PASSKEY_NO_CREDENTIAL',
  prfUnsupported: 'PASSKEY_PRF_UNSUPPORTED',
} as const

function createError(code: string) {
  return new Error(code)
}

function randomBytes(length: number) {
  return window.crypto.getRandomValues(new Uint8Array(length))
}

function toArrayBuffer(value: Uint8Array) {
  const copy = new Uint8Array(value.length)
  copy.set(value)
  return copy.buffer
}

function requireCanonicalOrigin() {
  if (
    !window.isSecureContext ||
    window.location.origin !== 'https://most.box' ||
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    throw createError(
      window.location.origin === 'https://most.box'
        ? PASSKEY_ERROR_CODES.unavailable
        : PASSKEY_ERROR_CODES.wrongOrigin
    )
  }
}

function getPrfOutput(credential: PublicKeyCredential) {
  const extensions =
    credential.getClientExtensionResults() as PrfExtensionOutput
  const output = extensions.prf?.results?.first
  return output ? new Uint8Array(output) : null
}

function normalizeCredential(value: Credential | null) {
  if (!(value instanceof PublicKeyCredential)) {
    throw createError(PASSKEY_ERROR_CODES.noCredential)
  }
  return value
}

function normalizeCeremonyError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith('PASSKEY_')) {
    throw error
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    throw createError(PASSKEY_ERROR_CODES.cancelled)
  }
  throw error
}

async function authenticate(credentialId?: Uint8Array) {
  const extensions: PrfExtensionInput = {
    prf: { eval: { first: toArrayBuffer(getPasskeyPrfInput()) } },
  }
  const value = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: 'most.box',
      timeout: 120_000,
      userVerification: 'required',
      ...(credentialId
        ? {
            allowCredentials: [
              {
                id: toArrayBuffer(credentialId),
                type: 'public-key' as const,
              },
            ],
          }
        : {}),
      extensions: extensions as AuthenticationExtensionsClientInputs,
    },
  })
  const credential = normalizeCredential(value)
  const prfOutput = getPrfOutput(credential)
  if (!prfOutput) {
    throw createError(PASSKEY_ERROR_CODES.prfUnsupported)
  }
  return { credentialId: new Uint8Array(credential.rawId), prfOutput }
}

async function create() {
  const extensions: PrfExtensionInput & { credProps: true } = {
    credProps: true,
    prf: { eval: { first: toArrayBuffer(getPasskeyPrfInput()) } },
  }
  const value = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { id: 'most.box', name: 'MostBox' },
      user: {
        id: randomBytes(32),
        name: 'MostBox Passkey',
        displayName: 'MostBox Passkey',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 120_000,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      attestation: 'none',
      extensions: extensions as AuthenticationExtensionsClientInputs,
    },
  })
  const credential = normalizeCredential(value)
  const credentialId = new Uint8Array(credential.rawId)
  const prfOutput = getPrfOutput(credential)
  return prfOutput ? { credentialId, prfOutput } : authenticate(credentialId)
}

export async function runPasskeyCeremony(
  mode: PasskeyCeremonyMode
): Promise<PasskeyCeremonyResult> {
  requireCanonicalOrigin()
  try {
    return mode === 'create' ? await create() : await authenticate()
  } catch (error) {
    normalizeCeremonyError(error)
  }
}
