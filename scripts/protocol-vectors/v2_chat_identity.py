"""v2 chat identity vectors (docs/protocol/v2/signatures.md §7), computed with
Python's hashlib.scrypt:
  chatSeed = scrypt(label("password") || password, H("identity", username),
                    N = 2^17, r = 8, p = 1, 32 bytes)
  syncKey  = HMAC-SHA256(chatSeed, label("account/sync-key"))
The chat address (BIP-39 -> m/44'/60'/0'/0/0) is checked by the JS tests on
both ends with ethers; Python's standard library has no secp256k1/keccak.

Usage: python scripts/protocol-vectors/v2_chat_identity.py docs/protocol/vectors/v2/chat-identity.json
"""
import hashlib
import hmac
import json
import sys


def label(purpose):
    return ('most/v2/' + purpose).encode() + b'\x00'


def derive(username, password):
    salt = hashlib.sha256(label('identity') + username.encode()).digest()
    password_bytes = label('password') + password.encode()
    seed = hashlib.scrypt(password_bytes, salt=salt, n=2**17, r=8, p=1, maxmem=2**28, dklen=32)
    sync_key = hmac.new(seed, label('account/sync-key'), hashlib.sha256).digest()
    return {
        'username': username,
        'password': password,
        'salt': salt.hex(),
        'passwordBytes': password_bytes.hex(),
        'chatSeed': '0x' + seed.hex(),
        'syncKey': '0x' + sync_key.hex(),
    }


vectors = {
    'description': 'v2 chat identity (v2/signatures.md §7): N=2^17, r=8, p=1, computed with Python hashlib.scrypt. The empty password is an invite identity.',
    'logN': 17,
    'cases': [
        derive('alice', 'correct horse battery staple'),
        derive('chatjoin-uid-123', ''),
        derive('张三', '密码 🔒 pass'),
    ],
}
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
