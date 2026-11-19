// Device certificates for the v2 signature vectors. ethers signs with
// RFC 6979, so the output is deterministic. Python cannot do secp256k1 with
// the standard library, so this part comes from ethers; the desktop engine
// (ethers) and the mobile core (noble) then verify it independently.
// Usage: node scripts/protocol-vectors/v2_device_cert.mjs docs/protocol/vectors/v2/device-cert.json
import fs from 'node:fs'
import { HDNodeWallet } from 'ethers'
import nacl from 'tweetnacl'
import { mostMnemonic, mostWallet } from '../../server/src/utils/mostWallet.js'
import { issueDeviceCertWithSigner } from '../../server/src/utils/auth.js'

const hex = bytes => Buffer.from(bytes).toString('hex')
const signer = HDNodeWallet.fromPhrase(
  mostMnemonic(mostWallet('alice', 'correct horse battery staple').danger)
)
const other = HDNodeWallet.fromPhrase(
  mostMnemonic(mostWallet('bob', 'correct horse battery staple').danger)
)
const deviceSeed = Buffer.alloc(32, 0x99)
const device = nacl.sign.keyPair.fromSeed(deviceSeed)
const otherDevice = nacl.sign.keyPair.fromSeed(Buffer.alloc(32, 0x98))
const day = 24 * 60 * 60 * 1000

const issue = (who, key, now, ttlMs = 30 * day) =>
  issueDeviceCertWithSigner(who, hex(key.publicKey), { now, ttlMs })

const vectors = {
  description:
    'Device certificates for v2 signatures (v2/signatures.md §4.4, §5), issued with ethers (deterministic RFC 6979). P2P verification ignores issue and expiry times.',
  address: signer.address.toLowerCase(),
  deviceSeed: hex(deviceSeed),
  devicePublicKey: hex(device.publicKey),
  cert: await issue(signer, device, 1795000000000),
  expiredCert: await issue(signer, device, 1000000000000),
  otherAccountCert: await issue(other, device, 1795000000000),
  otherAccountAddress: other.address.toLowerCase(),
  otherDeviceCert: await issue(signer, otherDevice, 1795000000000),
  otherDevicePublicKey: hex(otherDevice.publicKey),
}
fs.writeFileSync(process.argv[2], JSON.stringify(vectors))
