import {
  buildDeviceAuthHeader,
  createDeviceKey,
  issueDeviceCertWithSigner,
} from '../../src/utils/auth.js'

/** 给任意签名者（地址 + signMessage）签发一台测试设备，并缓存复用。 */
const devices = new WeakMap()

export async function deviceFor(signer, options) {
  let pending = devices.get(signer)
  if (!pending) {
    const key = createDeviceKey()
    pending = issueDeviceCertWithSigner(signer, key.publicKey, options).then(
      cert => ({ ...key, cert })
    )
    devices.set(signer, pending)
  }
  return pending
}

/** 返回 `<cert>,<timestamp>,<signature>`，HTTP 头和 WebSocket 查询参数共用。 */
export async function authHeaderFor(signer, method, requestPath) {
  return buildDeviceAuthHeader(await deviceFor(signer), method, requestPath)
}
