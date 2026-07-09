export type BoxAccount = {
  username: string
  address: string
  publicKey: string
  privateKey: string
}

export type ViewId = 'wallet' | 'pem' | 'export' | 'EA'

export type WalletResult = {
  username: string
  address: string
  danger: string
}

export type MostKeySet = {
  ed_public_key: string
  public_key: string
  private_key: string
}

export type DerivedWallet = {
  index: number
  address: string
  privateKey: string
}
