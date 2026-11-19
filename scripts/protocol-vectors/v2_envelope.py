import hashlib
import hmac
import json
import sys


def label(purpose):
    return ('most/v2/' + purpose).encode() + b'\x00'


def H(purpose, *parts):
    return hashlib.sha256(label(purpose) + b''.join(parts)).hexdigest()


def MAC(key, purpose, *parts):
    return hmac.new(key, label(purpose) + b''.join(parts), hashlib.sha256).hexdigest()


key = bytes(range(32))
digest = bytes.fromhex('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
vectors = {
    'description': 'Protocol v2 primitives (v2/envelope.md §3), computed independently with Python hashlib/hmac. Parts are hex bytes unless marked utf8.',
    'labels': [
        {'purpose': 'topic/file', 'label': label('topic/file').hex()},
        {'purpose': 'channel/id', 'label': label('channel/id').hex()},
    ],
    'invalidPurposes': ['', 'Topic/File', 'topic file', 'topic/file\u0000', 'topic_file'],
    'H': [
        {'purpose': 'topic/file', 'parts': [{'hex': digest.hex()}], 'output': H('topic/file', digest)},
        {'purpose': 'channel/public', 'parts': [{'utf8': 'general'}], 'output': H('channel/public', b'general')},
        {'purpose': 'channel/legacy', 'parts': [{'utf8': 'a2b3c4d5e6f7g8h9i0j1k2l3m4'}], 'output': H('channel/legacy', b'a2b3c4d5e6f7g8h9i0j1k2l3m4')},
        {'purpose': 'topic/file', 'parts': [], 'output': H('topic/file')},
    ],
    'MAC': [
        {'key': key.hex(), 'purpose': 'file/want', 'parts': [{'hex': '11' * 32}, {'hex': '22' * 32}], 'output': MAC(key, 'file/want', b'\x11' * 32, b'\x22' * 32)},
        {'key': key.hex(), 'purpose': 'cid-drive/name', 'parts': [{'hex': digest.hex()}], 'output': MAC(key, 'cid-drive/name', digest)},
    ],
    'KDF': [
        {'key': key.hex(), 'purpose': 'channel/proof-key', 'output': MAC(key, 'channel/proof-key')},
        {'key': key.hex(), 'purpose': 'channel/encryption', 'output': MAC(key, 'channel/encryption')},
    ],
}
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
