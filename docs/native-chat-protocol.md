# Native Chat Transport

This HTTP/WebSocket interface lets a native or browser client render its own
chat interface while a MostBox node stores messages and attachments. It does
not require the `/chat/join` page, a WebView, or an embedded P2P engine.

## Authentication

Remote HTTP requests send `x-mostbox-invite` and an `Authorization` header:

```text
<device-cert>,<timestamp-ms>,<signature>
```

A client never sends its account seed or wallet signature per request. It signs
once, at login, a **device certificate** that authorizes a device key, then
signs each request with that device key.

- Device key: an ed25519 key pair, one per device. `publicKey` is 32 bytes of
  hex; `secretKey` is the 64-byte tweetnacl secret key in hex.
- Device certificate: `dc1.<base64url(payload)>.<EIP-191 signature>`, with
  JSON payload `{address, devicePublicKey, issuedAt, expiresAt}`. The exact
  signed message and verification rules are defined once in
  [the device certificate specification](protocol/v2/signatures.md#5-设备证书与撤销边界).
  HTTP rejects expired certificates, issuance more than five minutes in the
  future, or validity longer than 90 days. Thirty days is the default;
  clients can select shorter validity. P2P historical checks do not apply
  current-time expiry checks, and there is no P2P device revocation.
- Request signature: base64url of the ed25519 detached signature, by the device
  key, over `<timestamp-ms>:<UPPERCASE-METHOD>:<pathname>`. Query parameters are
  excluded. The node accepts signatures within five minutes of its clock.

The MostBox username/password derivation is a client convention, not a server
requirement; any secp256k1 identity can issue device certificates.

Keep device keys and node invites out of logs and URLs other than the
authenticated WebSocket URL required below. The account seed should not be
persisted on the device. Signing identities are independent of any financial
account or transaction wallet.

## Channels and History

1. Check `GET /api/remote/capabilities` with the remote credentials.
2. Call `POST /api/channels` with `{name, type, displayName, avatar?}` to create
   or join a channel. Store the returned canonical `channelKey`.
3. Subscribe to the channel over WebSocket and wait for `channel:subscribed`.
4. Load `GET /api/channels/:name/history?limit=50` and merge incoming live
   messages while the request is in progress.

Creation and joins through `POST /api/channels` are serialized per normalized
channel id within one node, so simultaneous first-time members share one
channel and all memberships persist.

The history response is:

```json
{
  "messages": [],
  "nextCursor": null
}
```

Messages are ordered oldest first. `limit` defaults to 50 and must be an integer
between 1 and 100. To load older messages, pass `nextCursor` as `before` with the
next request. A null cursor means there are no older messages at the time of
that read. Cursors are opaque, channel-bound, exclusive positions ordered by
message timestamp, writer core key, and entry index. New messages do not shift
an existing page boundary. Invalid or cross-channel cursors return HTTP 400.
The legacy `/messages?limit=...&offset=...` endpoint still returns an array.

P2P entries can arrive after a history page was read. Clients must merge live
events and refresh the newest page after reconnecting; a cursor is not a
promise that peers have finished replicating all historical entries.

## Sending and Retrying

`POST /api/channels/:name/messages` requires `{signed}`. The signed envelope
is `{body, device, cert, sig}` as defined in [the current signature specification](protocol/v2/signatures.md).
`body.kind` is `message`; `body.channelId` is the public 64-hex channel ID;
`body.author` must equal the authenticated account. Unsigned requests are rejected.
Text is limited to 10,000 UTF-16 code units and must already be trimmed.
Success returns `{success: true, message}`; this API projection uses
`clientMessageId = body.id` and `timestamp = ts`, not a separate wire format.

Use one lowercase UUID v4 `body.id` per logical message and retain the complete
signed body for retries, including `createdAt` and optional fields. Within one
node, sends are serialized and `(channel, author, id)` is checked against the
locally available persisted history. An identical canonical body returns the
original message, including after restart. Reusing the id with any different
body field returns HTTP 409 with `code: "CONFLICT"`. The node never edits a
signed body to normalize it.

Clients merge responses, live events and history by channel, author and id.
Current P2P readers also deduplicate `(author, id)` and keep the earliest entry
by the shared ordering rule. This is not cross-node consensus or proof that a
recipient received the message. Version-specific unsigned local snapshots are
read-only and follow [the migration boundary](protocol/v2/channel-keys.md#7-迁移d7).

To update member details, send `{signed}` to
`POST /api/channels/:name/member-profile` with a `kind: "profile"` body.
Absent fields leave the previous value unchanged; `tag: null` clears it.
A node does not create an unsigned profile event on the user's behalf.

## WebSocket

Connect to `/ws` using `wss:` for HTTPS nodes. Supply `invite`, `cert`,
`timestamp` and `signature` query parameters (the three `Authorization` parts).
Sign `GET:/ws` with the same timestamp format as HTTP. Build a fresh signature for each reconnection; do
not log the full URL.

```json
{"event":"channel:subscribe","data":{"channel":"example-room"}}
{"event":"channel:subscribed","data":{"channel":"example-room","channelKey":"<64-hex public channel ID>"}}
{"event":"channel:message","data":{"channel":"<64-hex public channel ID>","message":{}}}
{"event":"channel:unsubscribe","data":{"channel":"example-room"}}
```

The node acknowledges subscription only after validating membership and
installing the subscription. A `register` event or peer id is not required for
channel subscriptions. Reconnect, resubscribe and reload history after network
loss. Unknown browser origins are refused; native connections without an
Origin header still require remote invite and signature authentication.

For presence, send `channel:presence:join|heartbeat|profile|leave` with
`data: {channel, signed}`. Use the public channel ID in the signed body. Set
`kind: "presence"` and the corresponding `status` (`online`, `heartbeat`,
`profile`, or `offline`). Sign a fresh event with the authenticated account's
device for each action; keep the same unique `sessionId` for the lifetime of
one tab or active mobile conversation. See
[the v2 signature format](protocol/v2/signatures.md#43-聊天-swarm-帧).
Send a heartbeat every 15 seconds and a signed leave before closing normally.
An abrupt socket close clears only that socket's sessions locally. A connected
peer expires a session after 45 seconds without a heartbeat. An account stays
online while any session remains. Unsigned presence frames are ignored.

For live voice, subscribe first and use the public channel ID from the
acknowledgement. Send `channel:voice:<event>` with `data: {channel, signed}`;
sign a fresh `kind: "voice"` body as described in [voice v2](protocol/v2/voice.md).
The node emits verified `channel:voice` events to subscribers. A signal goes
only to its target session; a missing or expired target receives nothing.
WebRTC clients handle only `transport: "webrtc1"`.

## Attachments

1. Read `GET /api/node/policy` with the remote invite and signature for the
   node's actual file-size limit. Updating policy remains local administration.
2. Upload a multipart `file` field to `POST /api/publish`. Native FormData uses
   a URI, filename and MIME type; browser FormData uses a File. Do not override
   the multipart Content-Type boundary.
3. Use the returned `cid`, `fileName` and `link` in the signed body attachment.
   Set `body.content` to exactly the attachment link before signing.
4. Download from `GET /api/files/:cid/download` with remote request headers.
   This endpoint supports byte ranges. If the node has no local copy, use
   `/api/download/check` and `/api/download` before retrying the file request.

An attachment contains `kind`, `cid`, `fileName`, `link`, and optional
`mimeType`/`size`. An image can use `kind: "image"`; any file, including video,
can use `kind: "file"`. CID is the content identity. In browsers, authenticated
fetch plus a Blob URL avoids placing invite credentials in an image URL.

## Application Boundary and Deployment

MostBox membership is based on knowledge of a channel id. It does not validate
an external application's registration, follows, group size or roles. External
clients must use their own authorized conversation directory to select
channels and map message author addresses to their users. Message bodies and
attachments can remain entirely on the MostBox node.

The node allows the local Web development origins `http://localhost:2020`,
`http://127.0.0.1:2020`, `http://localhost:2021`, and
`http://127.0.0.1:2021`. Configure deployed browser origins with the
`MOSTBOX_ALLOWED_ORIGINS` environment variable as a comma-separated list.

Node deployment must include the history endpoint, send deduplication,
subscription acknowledgement and origin changes together before a client
depends on them. Updating this repository does not deploy an existing remote
node. Its reverse proxy must forward API requests, WebSocket upgrades and
multipart uploads without recording request credentials. No node invite or
production credential belongs in this document.
