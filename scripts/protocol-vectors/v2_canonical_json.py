"""Canonical JSON vectors (docs/protocol/v2/signatures.md §3), computed with an
independent Python implementation of the JCS subset.

Usage: python scripts/protocol-vectors/v2_canonical_json.py docs/protocol/vectors/v2/canonical-json.json
Inputs are stored as JSON text so that values Python cannot hold directly
(-0, unsafe integers, lone surrogates) can still be expressed.
"""
import json
import sys

SAFE = 2**53 - 1


class Invalid(Exception):
    pass


def utf16_key(text):
    return text.encode('utf-16-be', 'surrogatepass')


def has_lone_surrogate(text):
    units = text.encode('utf-16-be', 'surrogatepass')
    i = 0
    while i < len(units):
        unit = int.from_bytes(units[i:i + 2], 'big')
        if 0xD800 <= unit <= 0xDBFF:
            nxt = int.from_bytes(units[i + 2:i + 4], 'big') if i + 4 <= len(units) else 0
            if not 0xDC00 <= nxt <= 0xDFFF:
                return True
            i += 4
            continue
        if 0xDC00 <= unit <= 0xDFFF:
            return True
        i += 2
    return False


ESCAPES = {'"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t'}


def string(text):
    if has_lone_surrogate(text):
        raise Invalid('lone surrogate')
    out = ['"']
    for ch in text:
        if ch in ESCAPES:
            out.append(ESCAPES[ch])
        elif ord(ch) < 0x20:
            out.append('\\u%04x' % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return ''.join(out)


def serialize(value):
    if value is None:
        return 'null'
    if value is True:
        return 'true'
    if value is False:
        return 'false'
    if isinstance(value, float):
        if value == 0 and str(value).startswith('-'):
            raise Invalid('-0')
        if value != int(value):
            raise Invalid('not an integer')
        value = int(value)
    if isinstance(value, int):
        if abs(value) > SAFE:
            raise Invalid('unsafe integer')
        return str(value)
    if isinstance(value, str):
        return string(value)
    if isinstance(value, list):
        return '[' + ','.join(serialize(item) for item in value) + ']'
    if isinstance(value, dict):
        keys = sorted(value, key=utf16_key)
        return '{' + ','.join(string(k) + ':' + serialize(value[k]) for k in keys) + '}'
    raise Invalid(type(value).__name__)


def parse(text):
    def no_duplicates(pairs):
        seen = {}
        for key, val in pairs:
            if key in seen:
                raise Invalid('duplicate key')
            seen[key] = val
        return seen
    return json.loads(text, object_pairs_hook=no_duplicates, parse_float=float, parse_int=lambda s: -0.0 if s == '-0' else int(s))


valid_inputs = [
    'null', 'true', '0', '-1', '9007199254740991', '-9007199254740991', '1.0',
    '"plain"', '"quote \\" backslash \\\\ slash /"',
    '"\\u0000\\u0001\\u001f \\b\\f\\n\\r\\t \\u007f"',
    '"line sep \\u2028 para sep \\u2029"',
    '"中文 emoji \\ud83d\\ude00 é"',
    '[]', '{}', '[1,[2,[3]],{"a":[]}]',
    '{"b":1,"a":2,"A":3,"_":4,"aa":5,"":6}',
    '{"é":1,"z":2,"中":3,"\\ud83d\\ude00":4,"\\uff21":5}',
    '{"kind":"message","channelId":"ab","author":"0x11","id":"u","createdAt":1795000000000,"content":"hi","mentions":[{"address":"0x22","label":"bob","start":0,"end":4}]}',
]
invalid_inputs = [
    '1.5', '-0', '9007199254740992', '-9007199254740992', '1e400',
    '"\\ud800"', '"x\\udc00"', '{"\\ud800":1}',
]

vectors = {
    'description': 'Canonical JSON (v2/signatures.md §3) computed by an independent Python implementation. "input" is JSON text; "canonical" is the expected output text; invalid inputs must be rejected. -0 and 1e400 cannot be parsed by every JSON reader and are listed for implementations that construct them directly.',
    'valid': [{'input': text, 'canonical': serialize(parse(text))} for text in valid_inputs],
    'invalid': invalid_inputs,
}
for text in invalid_inputs:
    try:
        serialize(parse(text))
    except (Invalid, ValueError, OverflowError):
        continue
    raise SystemExit('expected invalid: ' + text)

with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(vectors, f, ensure_ascii=False)
