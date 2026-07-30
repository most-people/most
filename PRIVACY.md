# Privacy Policy

Last updated: July 30, 2026

MostBox is an open-source, peer-to-peer application. This policy describes the
data flows implemented by the software in this repository. It does not make
peer-to-peer activity private or anonymous.

## Local data

MostBox stores node configuration, local identity material, published-file
metadata, seeding holdings, downloaded content, notes, channel state, and user
preferences on the user's device. MostBox does not operate a central account
database for the P2P file-sharing flow.

Users are responsible for protecting their device, local data directory,
credentials, recovery material, shared CIDs, and channel identifiers.

## Peer-to-peer network

When a user enables P2P features, MostBox connects to Hyperswarm bootstrap
infrastructure and other peers. Network participants and infrastructure
providers may observe information needed to establish a connection, including
IP addresses, timing, topics, and traffic volume.

Files published or seeded by a user are transferred to peers that know the
corresponding `most://` link or CID. Channel messages and presence information
are replicated to peers participating in the corresponding channel. CIDs,
`most://` links, and channel identifiers act as capabilities and should be
shared accordingly.

## Optional Most.Box services

The application contacts `download.most.box` to check for release information.
Downloading an update sends the ordinary information associated with an HTTPS
request, such as the requesting IP address and user-agent information, to the
download host and its infrastructure providers.

The account backup and avatar tools are separate from the P2P file-sharing
flow. The application contacts `api.most.box` in the following cases:

- After a user completes a login, the application automatically sends a signed
  request to check whether an account backup exists and may offer to restore
  it. This check does not upload local backup content, but the service receives
  the wallet address, signature, request time, and ordinary connection metadata.
- When a user creates or updates a cloud backup, account backup uploads a
  wallet-address-authenticated encrypted payload and its content identifier.
  The service receives the encrypted payload and the authentication and
  connection data described above.
- Avatar upload sends the selected image together with wallet-address
  authentication and ordinary connection metadata. Published avatar URLs are
  intended to be retrievable by other users.

Private wallet or recovery material is used locally to create authentication
signatures and is not intentionally uploaded by these features. Users should
review the source and keep independent backups of important data.

## Third-party services

The Web3 toolbox connects only when used and may communicate with blockchain
RPC services selected or configured by the user. Those providers receive data
required to answer RPC requests and apply their own privacy policies.

GitHub, npm, Cloudflare, HyperDHT bootstrap operators, internet service
providers, and other infrastructure used to obtain or operate MostBox process
data under their own terms and policies.

## Telemetry

The application does not include a product analytics or advertising telemetry
system. Operational logs are produced locally. Network services may still keep
security and access logs according to their own configuration and legal
obligations.

## User choices

Users can stop P2P participation by closing the node or application, remove
local data using operating-system file controls, refrain from uploading account
backups or avatars, refrain from using Web3 tools, and stop sharing capability
links. Data already received by independent peers cannot be recalled by MostBox.

## Contact

For privacy questions, open a GitHub issue that does not contain secrets or
personal data. Report security-sensitive matters through the private process in
[SECURITY.md](SECURITY.md).
