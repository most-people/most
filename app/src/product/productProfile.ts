import profiles from '../../product-profiles.json'

export type ProductId = 'most' | 'inkbox'

export type ProductFeatures = {
  chat: boolean
  voice: boolean
  remoteNode: boolean
  mcp: boolean
  web3: boolean
  backgroundSeeding: boolean
}

export type ProductProfile = {
  id: ProductId
  displayName: string
  appName: string
  scheme: string
  androidPackage: string
  iosBundleIdentifier: string
  legalUrls: {
    privacy: string
    terms: string
    support: string
  }
  features: ProductFeatures
}

const profileMap = profiles as Record<ProductId, ProductProfile>

export function resolveProductId(value: unknown): ProductId {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'inkbox' ||
    normalized === 'mohe' ||
    normalized === '墨盒'
  ) {
    return 'inkbox'
  }
  return 'most'
}

export function getProductProfile(value?: unknown): ProductProfile {
  return profileMap[resolveProductId(value ?? readProductEnvironment())]
}

function readProductEnvironment() {
  // Expo inlines EXPO_PUBLIC_* variables at bundle time. MOST_PRODUCT is used
  // by native synchronization scripts and CI, so support both spellings.
  if (typeof process !== 'undefined') {
    return process.env.EXPO_PUBLIC_MOST_PRODUCT || process.env.MOST_PRODUCT
  }
  return undefined
}

export const PRODUCT_PROFILE = getProductProfile()
