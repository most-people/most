"""Protocol v2 session frame vectors (docs/protocol/v2/envelope.md §4.2).

Each case is a received frame and the feature list a receiver accepts from
it, or null when the frame is rejected (the peer then counts as listing no
features). Validation rules are restated here independently of the code.

Usage: python scripts/protocol-vectors/v2_session.py > docs/protocol/vectors/v2/session.json
"""
import json
import re
import sys

FEATURE = re.compile(r'[a-z0-9-]+[0-9]+')


def accept(frame):
    if not isinstance(frame, dict) or frame.get('v') != 2:
        return None
    if frame.get('type') != 'session':
        return None
    features = frame.get('features')
    if not isinstance(features, list) or len(features) > 64:
        return None
    for item in features:
        if not isinstance(item, str) or len(item) > 32:
            return None
        if not FEATURE.fullmatch(item):
            return None
    return features


frames = [
    ('local 0.8.0', {'v': 2, 'type': 'session', 'features': ['sig1']}),
    ('empty list', {'v': 2, 'type': 'session', 'features': []}),
    ('unknown feature kept', {'v': 2, 'type': 'session', 'features': ['sig1', 'e2ee1']}),
    ('unknown field ignored', {'v': 2, 'type': 'session', 'features': ['sig1'], 'extra': 1}),
    ('64 features', {'v': 2, 'type': 'session', 'features': [f'f{i}' for i in range(64)]}),
    ('32-char feature', {'v': 2, 'type': 'session', 'features': ['a' * 31 + '1']}),
    ('65 features', {'v': 2, 'type': 'session', 'features': [f'f{i}' for i in range(65)]}),
    ('33-char feature', {'v': 2, 'type': 'session', 'features': ['a' * 32 + '1']}),
    ('no version digit', {'v': 2, 'type': 'session', 'features': ['sig']}),
    ('uppercase', {'v': 2, 'type': 'session', 'features': ['Sig1']}),
    ('underscore', {'v': 2, 'type': 'session', 'features': ['sig_1']}),
    ('non-string feature', {'v': 2, 'type': 'session', 'features': [1]}),
    ('features not a list', {'v': 2, 'type': 'session', 'features': 'sig1'}),
    ('features missing', {'v': 2, 'type': 'session'}),
    ('wrong version', {'v': 3, 'type': 'session', 'features': ['sig1']}),
    ('version missing', {'type': 'session', 'features': ['sig1']}),
]

json.dump({
    'description': 'Protocol v2 session frames (v2/envelope.md §4.2), validated independently in Python. features is what the receiver accepts, null when the frame is rejected.',
    'localFeatures': ['sig1'],
    'cases': [{'name': name, 'frame': frame, 'features': accept(frame)} for name, frame in frames],
}, sys.stdout, indent=2)
sys.stdout.write('\n')
