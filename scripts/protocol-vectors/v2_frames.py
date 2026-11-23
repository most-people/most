"""Protocol v2 chat swarm frames (docs/protocol/v2/envelope.md §4.1, §4.3).

`frames` are what 0.8.0 sends for each frame type; `received` lists frames a
receiver keeps (true) or drops without disconnecting (false) under §4.1.
Unknown types that pass this check are dropped by the type dispatch.

Usage: python scripts/protocol-vectors/v2_frames.py > docs/protocol/vectors/v2/frames.json
"""
import json
import sys

HEX = '11' * 32
frames = {
    'session': {'v': 2, 'type': 'session', 'features': ['sig1']},
    'channel-challenge': {'v': 2, 'type': 'channel-challenge', 'challenge': HEX},
    'channel-scope': {'v': 2, 'type': 'channel-scope', 'topics': [HEX]},
    'channel-proof': {'v': 2, 'type': 'channel-proof', 'challenge': HEX, 'proofs': [{'topic': HEX, 'proof': HEX}]},
    'channel-hello': {
        'v': 2,
        'type': 'channel-hello',
        'peerId': HEX,
        'authorName': '1111',
        'channels': [{
            'channelId': HEX,
            'createdAt': '2026-11-18T00:00:00.000Z',
            'lastMessageAt': '',
            'memberAddresses': ['0x' + '22' * 20],
            'writerCoreKeys': [HEX],
        }],
    },
}


def keep(frame):
    return isinstance(frame, dict) and frame.get('v') == 2


received = [
    ('v2 frame', {'v': 2, 'type': 'channel-scope', 'topics': []}),
    ('v2 unknown type', {'v': 2, 'type': 'later-feature'}),
    ('v2 unknown field', {'v': 2, 'type': 'channel-scope', 'topics': [], 'extra': True}),
    ('v1 challenge', {'type': 'channel-proof-challenge', 'version': 1, 'challenge': HEX}),
    ('v1 scope', {'type': 'channel-scope', 'topics': []}),
    ('v3', {'v': 3, 'type': 'channel-scope', 'topics': []}),
    ('string v', {'v': '2', 'type': 'channel-scope', 'topics': []}),
    ('array', [2]),
    ('null', None),
]

json.dump({
    'description': 'Protocol v2 chat swarm frames as sent by 0.8.0 (v2/envelope.md §4.3) and the §4.1 receive rule: keep is false for frames dropped without disconnecting.',
    'frames': frames,
    'received': [{'name': n, 'frame': f, 'keep': keep(f)} for n, f in received],
}, sys.stdout, indent=2)
sys.stdout.write('\n')
