"""Protocol v2 P2P Ping vectors (docs/protocol/v2/envelope.md §6).

Variable-length fields end with 0x00 (envelope §3.1). Computed with
hashlib/hmac only.

Usage: python scripts/protocol-vectors/v2_p2p_ping.py > docs/protocol/vectors/v2/p2p-ping.json
"""
import hashlib
import hmac
import json
import sys

Z = b'\x00'


def label(purpose):
    return b'most/v2/' + purpose.encode('ascii') + Z


def H(purpose, *parts):
    return hashlib.sha256(label(purpose) + b''.join(parts)).digest()


def MAC(key, purpose, *parts):
    return hmac.new(key, label(purpose) + b''.join(parts), hashlib.sha256).digest()


def field(text):
    return text.encode('utf-8') + Z


code = '123456'
nonce = '00112233445566778899aabbccddeeff'
topics = {d: H('p2p-ping/topic', field(code), field(d)).hex() for d in ('hostToJoin', 'joinToHost')}
proof_key = H('p2p-ping/proof-key', field(code))
direction = 'hostToJoin'
frames = {}
for kind in ('p2p-ping', 'p2p-pong', 'p2p-ack'):
    proof = MAC(proof_key, 'p2p-ping/proof', field(direction), field(kind), field(nonce)).hex()
    frames[kind] = json.dumps(
        {'type': kind, 'version': 3, 'direction': direction, 'nonce': nonce, 'proof': proof},
        separators=(',', ':'),
    )

json.dump({
    'description': 'Protocol v2 P2P Ping topics and frames (v2/envelope.md §6), computed independently in Python. Each frame is the JSON line without the trailing newline.',
    'code': code,
    'direction': direction,
    'nonce': nonce,
    'topics': topics,
    'proofKey': proof_key.hex(),
    'frames': frames,
}, sys.stdout, indent=2)
sys.stdout.write('\n')
