"""v2 signature vectors (docs/protocol/v2/signatures.md §4), computed in Python:
canonical JSON (v2_canonical_json.py), the signed payload, and RFC 8032
ed25519 signatures (reference implementation, checked against RFC test 1).
Certificates come from v2_device_cert.mjs (ethers), read from device-cert.json.

Usage: python scripts/protocol-vectors/v2_signatures.py docs/protocol/vectors/v2
"""
import base64
import hashlib
import importlib.util
import json
import os
import sys

sys.dont_write_bytecode = True

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('cj', os.path.join(here, 'v2_canonical_json.py'))
cj = importlib.util.module_from_spec(spec)
sys.argv, saved = [sys.argv[0], os.devnull], sys.argv
spec.loader.exec_module(cj)
sys.argv = saved

# --- RFC 8032 ed25519 --------------------------------------------------------
p = 2**255 - 19
d = -121665 * pow(121666, p - 2, p) % p
q = 2**252 + 27742317777372353535851937790883648493


def inv(x):
    return pow(x, p - 2, p)


def recover_x(y, sign):
    x2 = (y * y - 1) * inv(d * y * y + 1)
    x = pow(x2, (p + 3) // 8, p)
    if (x * x - x2) % p:
        x = x * pow(2, (p - 1) // 4, p) % p
    if (x & 1) != sign:
        x = p - x
    return x


By = 4 * inv(5) % p
B = (recover_x(By, 0), By, 1, recover_x(By, 0) * By % p)


def add(P, Q):
    A = (P[1] - P[0]) * (Q[1] - Q[0]) % p
    Bv = (P[1] + P[0]) * (Q[1] + Q[0]) % p
    C = 2 * P[3] * Q[3] * d % p
    D = 2 * P[2] * Q[2] % p
    E, F, G, H = Bv - A, D - C, D + C, Bv + A
    return (E * F % p, G * H % p, F * G % p, E * H % p)


def mul(s, P):
    Q = (0, 1, 1, 0)
    while s:
        if s & 1:
            Q = add(Q, P)
        P = add(P, P)
        s >>= 1
    return Q


def compress(P):
    zi = inv(P[2])
    x, y = P[0] * zi % p, P[1] * zi % p
    return (y | ((x & 1) << 255)).to_bytes(32, 'little')


def sign(seed, message):
    h = hashlib.sha512(seed).digest()
    a = int.from_bytes(h[:32], 'little') & ((1 << 254) - 8) | (1 << 254)
    A = compress(mul(a, B))
    r = int.from_bytes(hashlib.sha512(h[32:] + message).digest(), 'little') % q
    R = compress(mul(r, B))
    k = int.from_bytes(hashlib.sha512(R + A + message).digest(), 'little') % q
    return R + ((r + k * a) % q).to_bytes(32, 'little'), A


rfc_sig, rfc_pub = sign(bytes.fromhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'), b'')
assert rfc_pub.hex() == 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
assert rfc_sig.hex() == 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'

# --- vectors -----------------------------------------------------------------
out_dir = sys.argv[1]
cert = json.load(open(os.path.join(out_dir, 'device-cert.json'), encoding='utf-8'))
seed = bytes.fromhex(cert['deviceSeed'])
author = cert['address']
channel_id = 'ab' * 32


def b64url(data):
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def payload(body):
    return ('most/v2/chat/' + body['kind']).encode() + b'\x00' + cj.serialize(body).encode()


def envelope(body, device_cert=None):
    signature, public = sign(seed, payload(body))
    assert public.hex() == cert['devicePublicKey']
    return {'body': body, 'device': public.hex(), 'cert': device_cert or cert['cert'], 'sig': b64url(signature)}


common = {'channelId': channel_id, 'author': author, 'createdAt': 1795000000000}
bodies = [
    {**common, 'kind': 'message', 'id': '0b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d', 'content': 'hi 中文 😀', 'authorName': 'alice#9a2b'},
    {**common, 'kind': 'profile', 'id': '1b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d', 'displayName': 'Alice', 'avatar': '', 'tag': {'default': 'mod'}},
    {**common, 'kind': 'presence', 'id': '2b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d', 'status': 'online', 'sessionId': 'web'},
    {**common, 'kind': 'voice', 'id': '3b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d', 'event': 'signal', 'sessionId': 'voice-1-abc', 'targetSessionId': 'voice-2-def', 'transport': 'webrtc1', 'signal': {'type': 'offer', 'sdp': 'v=0'}},
    {**common, 'kind': 'message', 'id': '4b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d', 'content': 'future field', 'unknownFutureField': {'x': [1, 2]}},
]
valid = [{'payload': payload(body).hex(), 'envelope': envelope(body)} for body in bodies]
valid.append({'payload': payload(bodies[0]).hex(), 'envelope': envelope(bodies[0], cert['expiredCert']), 'note': 'expired certificate is accepted in P2P'})

good = envelope(bodies[0])
tampered = json.loads(json.dumps(good))
tampered['body']['content'] = 'hi!'
relabelled = envelope({**bodies[0], 'kind': 'profile'})
relabelled['body'] = dict(bodies[0])
invalid = [
    {'reason': 'body changed after signing', 'envelope': tampered},
    {'reason': 'signature made under another kind label', 'envelope': relabelled},
    {'reason': 'wrong channel', 'envelope': good, 'channelId': 'cd' * 32},
    {'reason': 'certificate for another account', 'envelope': {**good, 'cert': cert['otherAccountCert']}},
    {'reason': 'certificate for another device', 'envelope': {**good, 'cert': cert['otherDeviceCert']}},
    {'reason': 'truncated signature', 'envelope': {**good, 'sig': good['sig'][:-4]}},
    {'reason': 'author not lowercase', 'envelope': envelope({**bodies[0], 'author': author.upper().replace('0X', '0x')})},
    {'reason': 'unknown kind', 'envelope': {**good, 'body': {**bodies[0], 'kind': 'poll'}}},
    {'reason': 'fractional createdAt', 'envelope': {**good, 'body': {**bodies[0], 'createdAt': 1.5}}},
]

vectors = {
    'description': 'v2 signed envelopes (v2/signatures.md §4): payload = "most/v2/chat/<kind>" 0x00 canonical-JSON(body); ed25519 by the device key; certificate from device-cert.json. Valid envelopes verify for channelId; invalid ones must be rejected (with the given channelId if present, otherwise the body channelId).',
    'channelId': channel_id,
    'author': author,
    'valid': valid,
    'invalid': invalid,
}
with open(os.path.join(out_dir, 'signatures.json'), 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
