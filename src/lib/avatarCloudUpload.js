import { HDNodeWallet, Mnemonic, getBytes } from 'ethers'

export const ACCOUNT_AVATAR_API_URL = 'https://api.most.box/auth/avatar'

async function readAvatarApiError(response, fallback) {
  const data = await response
    .clone()
    .json()
    .catch(() => null)
  return data?.error || fallback
}

function getWalletMnemonic(danger) {
  return Mnemonic.entropyToPhrase(getBytes(danger))
}

async function signAvatarMessage(danger, message) {
  const account = HDNodeWallet.fromPhrase(getWalletMnemonic(danger))
  return {
    address: account.address,
    signature: await account.signMessage(message),
  }
}

export async function getAccountAvatarAuthHeaders(
  wallet,
  method,
  url = ACCOUNT_AVATAR_API_URL
) {
  const timestamp = Date.now().toString()
  const path = new URL(url).pathname
  const message = `${timestamp}:${String(method).toUpperCase()}:${path}`
  const { address, signature } = await signAvatarMessage(wallet.danger, message)
  return {
    Authorization: `${address},${timestamp},${signature}`,
  }
}

export async function uploadAccountAvatar(
  wallet,
  file,
  url = ACCOUNT_AVATAR_API_URL
) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(url, {
    method: 'POST',
    headers: await getAccountAvatarAuthHeaders(wallet, 'POST', url),
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await readAvatarApiError(response, 'Avatar upload failed'))
  }

  const data = await response
    .clone()
    .json()
    .catch(() => null)
  if (!data?.url) {
    throw new Error('Avatar upload failed')
  }
  return data
}
