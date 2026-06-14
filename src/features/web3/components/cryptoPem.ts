const base64Encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

export const ed25519ToPKCS8PEM = (privateKey: Uint8Array) => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  ])
  const privateKeyOctetString = new Uint8Array([
    0x04,
    0x22,
    0x04,
    0x20,
    ...privateKey.slice(0, 32),
  ])
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const totalLength =
    version.length +
    ed25519AlgorithmIdentifier.length +
    privateKeyOctetString.length
  const pkcs8 = new Uint8Array(2 + totalLength)
  pkcs8[0] = 0x30
  pkcs8[1] = totalLength
  let offset = 2
  pkcs8.set(version, offset)
  offset += version.length
  pkcs8.set(ed25519AlgorithmIdentifier, offset)
  offset += ed25519AlgorithmIdentifier.length
  pkcs8.set(privateKeyOctetString, offset)
  const base64 = base64Encode(pkcs8)
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`
}

export const ed25519PublicKeyToPEM = (publicKey: Uint8Array) => {
  const ed25519AlgorithmIdentifier = new Uint8Array([
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  ])
  const publicKeyBitString = new Uint8Array([0x03, 0x21, 0x00, ...publicKey])
  const totalLength =
    ed25519AlgorithmIdentifier.length + publicKeyBitString.length
  const spki = new Uint8Array(2 + totalLength)
  spki[0] = 0x30
  spki[1] = totalLength
  let offset = 2
  spki.set(ed25519AlgorithmIdentifier, offset)
  offset += ed25519AlgorithmIdentifier.length
  spki.set(publicKeyBitString, offset)
  const base64 = base64Encode(spki)
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`
}
