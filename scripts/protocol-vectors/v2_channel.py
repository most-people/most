import base64
import hashlib
import hmac
import json
import sys

# --- RFC 8032 reference ed25519 public key derivation ---------------------
p = 2**255 - 19
d = -121665 * pow(121666, p - 2, p) % p
q = 2**252 + 27742317777372353535851937790883648493


def inv(x):
    return pow(x, p - 2, p)


def recover_x(y, sign):
    x2 = (y * y - 1) * inv(d * y * y + 1)
    x = pow(x2, (p + 3) // 8, p)
    if (x * x - x2) % p != 0:
        x = x * pow(2, (p - 1) // 4, p) % p
    if (x & 1) != sign:
        x = p - x
    return x


By = 4 * inv(5) % p
Bx = recover_x(By, 0)
B = (Bx, By, 1, Bx * By % p)


def add(P, Q):
    A = (P[1] - P[0]) * (Q[1] - Q[0]) % p
    Bv = (P[1] + P[0]) * (Q[1] + Q[0]) % p
    C = 2 * P[3] * Q[3] * d % p
    D = 2 * P[2] * Q[2] % p
    E, F, G, H_ = Bv - A, D - C, D + C, Bv + A
    return (E * F % p, G * H_ % p, F * G % p, E * H_ % p)


def mul(s, P):
    Q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            Q = add(Q, P)
        P = add(P, P)
        s >>= 1
    return Q


def compress(P):
    zi = inv(P[2])
    x = P[0] * zi % p
    y = P[1] * zi % p
    return int.to_bytes(y | ((x & 1) << 255), 32, 'little')


def ed25519_public(seed):
    h = hashlib.sha512(seed).digest()
    a = int.from_bytes(h[:32], 'little')
    a &= (1 << 254) - 8
    a |= 1 << 254
    return compress(mul(a, B))


# RFC 8032 §7.1 TEST 1 and TEST 2
assert ed25519_public(bytes.fromhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')).hex() == 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'
assert ed25519_public(bytes.fromhex('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb')).hex() == '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'

# --- v2 primitives ----------------------------------------------------------


def label(purpose):
    return ('most/v2/' + purpose).encode() + b'\x00'


def H(purpose, *parts):
    return hashlib.sha256(label(purpose) + b''.join(parts)).digest()


def MAC(key, purpose, *parts):
    return hmac.new(key, label(purpose) + b''.join(parts), hashlib.sha256).digest()


def credential(key):
    return base64.b32encode(key).decode().lower().rstrip('=')


keys = [bytes(32), bytes(range(32)), bytes([0xFF] * 32)]
node_secret = bytes([0x55] * 32)
challenge = bytes([0x11] * 32)
prover = bytes([0x22] * 32)
verifier = bytes([0x33] * 32)

channels = []
for key in keys:
    channel_id = H('channel/id', key)
    chat = H('topic/channel-chat', key)
    proof_key = MAC(key, 'channel/proof-key')
    channels.append({
        'key': key.hex(),
        'credential': credential(key),
        'channelId': channel_id.hex(),
        'replicationTopic': H('topic/channel-replication', key).hex(),
        'chatTopic': chat.hex(),
        'proof': {
            'topic': chat.hex(),
            'challenge': challenge.hex(),
            'proverPublicKey': prover.hex(),
            'verifierPublicKey': verifier.hex(),
            'proof': MAC(proof_key, 'channel/proof', chat, challenge, prover, verifier).hex(),
        },
        'writers': [
            {
                'generation': g,
                'publicKey': ed25519_public(MAC(node_secret, 'channel/writer', channel_id, g.to_bytes(4, 'big'))).hex(),
            }
            for g in (0, 1)
        ],
    })

vectors = {
    'description': 'Protocol v2 channel keys (v2/channel-keys.md), computed independently in Python (hashlib, hmac, base64 and an RFC 8032 reference ed25519 checked against RFC 8032 test vectors).',
    'nodeSecret': node_secret.hex(),
    'channels': channels,
    'invalidCredentials': [
        '',
        'a' * 51,
        'a' * 53,
        'a' * 51 + '1',
        'a' * 51 + 'b',
    ],
    'publicChannels': [
        {'name': name, 'normalized': name.strip().lower(), 'key': H('channel/public', name.strip().lower().encode()).hex()}
        for name in ['general', ' General ', 'chatjoin_support']
    ],
    'invalidPublicNames': ['ab', 'a' * 31, 'has.dot', 'has space', ''],
    'legacyChannels': [
        {'v1ChannelId': v1, 'key': H('channel/legacy', v1.strip().lower().encode()).hex()}
        for v1 in ['a2b3c4d5e6f7g8h9i0j1k2l3m4', 'general']
    ],
}
import re


def resolve(text):
    handle = text.strip().lower()
    if re.fullmatch(r'[a-z2-7]{52}', handle):
        raw = base64.b32decode(handle.upper() + '====')
        if credential(raw) == handle:
            key = raw
            return {'handle': handle, 'kind': 'private', 'key': key.hex(), 'channelKey': H('channel/id', key).hex()}
        return None
    if re.fullmatch(r'[a-z2-7]{26}', handle):
        key = H('channel/legacy', handle.encode())
        return {'handle': handle, 'kind': 'legacy', 'key': key.hex(), 'channelKey': H('channel/id', key).hex()}
    if re.fullmatch(r'[a-z0-9_-]{3,30}', handle):
        key = H('channel/public', handle.encode())
        return {'handle': handle, 'kind': 'public', 'key': key.hex(), 'channelKey': H('channel/id', key).hex()}
    return None


handle_inputs = [credential(bytes(range(32))), ' ' + credential(bytes(range(32))).upper(), 'a2b3c4d5e6f7g8h9i0j1k2l3m4', 'aaisem2ekvthpcezvk54zxpo74', 'General', 'chatjoin_support', 'ab', 'has.dot', 'a' * 51 + 'b', '']
vectors['handles'] = [{'input': text, 'result': resolve(text)} for text in handle_inputs]

with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
