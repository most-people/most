# Native Chat Transport

This HTTP/WebSocket interface lets a native or browser client render its own
chat interface while a MostBox node stores messages and attachments. It does
not require the `/chat/join` page, a WebView, or an embedded P2P engine.

## Authentication

Remote HTTP requests send `x-mostbox-invite` and an `Authorization` header:

```text
<address>,<timestamp-ms>,<signature>
```

The signature is an EIP-191 message signature over
`<timestamp-ms>:<UPPERCASE-METHOD>:<pathname>`. Query parameters are excluded.
The node accepts signatures within five minutes of its clock. Any valid
secp256k1 signing identity is supported; the MostBox username/password
derivation is a client convention, not a server requirement.

Keep signing material and node invites out of logs and URLs other than the
authenticated WebSocket URL required below. Native clients do not need to
persist these credentials. Signing identities are independent of any financial
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

`POST /api/channels/:name/messages` accepts
`{content, author, authorName, avatar?, clientMessageId?, attachment?, mentions?}`.
The author must equal the signed request identity. Text is limited to 10,000
characters. Success retains the existing `{success: true, message}` envelope.

Use one UUID v4 `clientMessageId` per logical message and reuse it on retries.
Within one node, `(channel, author, clientMessageId)` is checked against
persisted history and sends to each channel are serialized. Repeating the
same normalized content, attachment and mentions returns the original message,
including after restart. Reusing the id with a different payload returns HTTP
409 with `code: "CONFLICT"`. Display-name or avatar updates do not create a new
message. Requests without a client id keep the legacy append behavior.

Clients merge HTTP responses, WebSocket events and history by channel, author
and clientMessageId. Legacy records without a client id can use the existing
message id or author/timestamp/content key. This is not a cross-node consensus
or deduplication guarantee if the same logical send is submitted to independent
nodes simultaneously.

## WebSocket

Connect to `/ws` using `wss:` for HTTPS nodes. Supply `invite`, `address`,
`timestamp` and `signature` query parameters. Sign `GET:/ws` with the same
timestamp format as HTTP. Build a fresh signature for each reconnection; do
not log the full URL.

```json
{"event":"channel:subscribe","data":{"channel":"example-room"}}
{"event":"channel:subscribed","data":{"channel":"example-room"}}
{"event":"channel:message","data":{"channel":"example-room","message":{}}}
{"event":"channel:unsubscribe","data":{"channel":"example-room"}}
```

The node acknowledges subscription only after validating membership and
installing the subscription. A `register` event or peer id is not required for
channel subscriptions. Reconnect, resubscribe and reload history after network
loss. Unknown browser origins are refused; native connections without an
Origin header still require remote invite and signature authentication.

## Attachments

1. Read `GET /api/node/policy` with the remote invite and signature for the
   node's actual file-size limit. Updating policy remains local administration.
2. Upload a multipart `file` field to `POST /api/publish`. Native FormData uses
   a URI, filename and MIME type; browser FormData uses a File. Do not override
   the multipart Content-Type boundary.
3. Use the returned `cid`, `fileName` and `link` in the attachment object. Send
   a message whose `content` is exactly the attachment link.
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

The node allows these explicit Popper browser origins for HTTP and WebSocket:

- `https://popper.trade`
- `http://localhost:8081`
- `http://127.0.0.1:8081`

Node deployment must include the history endpoint, send deduplication,
subscription acknowledgement and origin changes together before a client
depends on them. Updating this repository does not deploy an existing remote
node. Its reverse proxy must forward API requests, WebSocket upgrades and
multipart uploads without recording request credentials. No node invite or
production credential belongs in this document.
