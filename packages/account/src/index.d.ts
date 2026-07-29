export interface MostBoxIdentity {
  username: string
  address: string
  danger: string
  displayName: string
  avatar?: string
}

export interface MostBoxEncryptionKeys {
  public_key: string
  private_key: string
  ed_public_key: string
}

export function createLoginIdentity(
  username: string,
  password: string
): MostBoxIdentity
export function loadIdentity(): MostBoxIdentity | null
export function saveIdentity<
  T extends Pick<MostBoxIdentity, 'username' | 'address' | 'danger'>,
>(identity: T): void
export function clearIdentity(): void
export function getDisplayName(address: string, username?: string): string

export const AUTH_MAX_AGE_MS: number
export function buildAuthMessage(
  timestamp: string,
  method: string,
  path: string
): string
export function normalizeAuthPath(path: string): string
export function buildAuthHeaders(
  identity: Pick<MostBoxIdentity, 'danger'>,
  method: string,
  path: string
): Promise<Record<string, string>>

export function mostWallet(
  username: string,
  password: string
): Pick<MostBoxIdentity, 'username' | 'address' | 'danger'>
export function most25519(danger: string): MostBoxEncryptionKeys
export function mostSignMessage(
  danger: string,
  message: string
): Promise<{ address: string; signature: string }>
export function mostBoxEncrypt(
  text: string,
  options: { senderPrivateKey: string; recipientPublicKey: string }
): string
export function mostBoxDecrypt(
  data: string,
  options: { senderPublicKey: string; recipientPrivateKey: string }
): string
export function getAccountAvatarUrl(address: string): string
