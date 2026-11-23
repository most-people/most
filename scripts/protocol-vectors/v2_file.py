"""Protocol v2 file vectors (docs/protocol/v2/file-privacy.md §10).

Computed independently of the JavaScript code: the CID is decoded by hand
(multibase base32 + varints), primitives use only hashlib/hmac.

Usage: python scripts/protocol-vectors/v2_file.py > docs/protocol/vectors/v2/file.json
"""
import base64
import hashlib
import hmac
import json
import sys


def label(purpose):
    return b'most/v2/' + purpose.encode('ascii') + b'\x00'


def H(purpose, *parts):
    return hashlib.sha256(label(purpose) + b''.join(parts)).digest()


def MAC(key, purpose, *parts):
    return hmac.new(key, label(purpose) + b''.join(parts), hashlib.sha256).digest()


def varint(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return value, offset


def cid_digest(cid):
    assert cid[0] == 'b', 'multibase base32 lower'
    body = cid[1:].upper()
    raw = base64.b32decode(body + '=' * (-len(body) % 8))
    version, offset = varint(raw, 0)
    assert version == 1
    _codec, offset = varint(raw, offset)
    hash_code, offset = varint(raw, offset)
    assert hash_code == 0x12, 'sha2-256'
    length, offset = varint(raw, offset)
    digest = raw[offset:offset + length]
    assert len(digest) == 32 and offset + length == len(raw)
    return digest


SAMPLES = [
    ('empty', 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'),
    ('hello-world', 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'),
    ('cross-chunk', 'bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi'),
]
SECRET = bytes.fromhex('44' * 32)
CHALLENGE = bytes.fromhex('11' * 32)
REQUESTER_PK = bytes.fromhex('22' * 32)
RESPONDER_PK = bytes.fromhex('33' * 32)
DRIVE_KEY = bytes.fromhex('55' * 32)

files = []
for name, cid in SAMPLES:
    digest = cid_digest(cid)
    topic = H('topic/file', digest)
    want_key = H('file/want-key', digest)
    proof = MAC(want_key, 'file/want', topic, CHALLENGE, REQUESTER_PK, RESPONDER_PK)
    drive_name = 'cid-drive-' + MAC(SECRET, 'cid-drive/name', topic).hex()
    files.append({
        'name': name,
        'cid': cid,
        'digest': digest.hex(),
        'topic': topic.hex(),
        'wantKey': want_key.hex(),
        'proof': proof.hex(),
        'driveName': drive_name,
        'want': (topic + proof).hex(),
        'have': (topic + DRIVE_KEY).hex(),
    })

json.dump({
    'description': 'Protocol v2 file topic, want proof, drive name and most-cid-drive/3 payloads (v2/file-privacy.md), computed independently in Python (hashlib, hmac, hand-decoded CID).',
    'protocol': 'most-cid-drive/3',
    'secret': SECRET.hex(),
    'challenge': CHALLENGE.hex(),
    'requesterPublicKey': REQUESTER_PK.hex(),
    'responderPublicKey': RESPONDER_PK.hex(),
    'driveKey': DRIVE_KEY.hex(),
    'files': files,
}, sys.stdout, indent=2)
sys.stdout.write('\n')
