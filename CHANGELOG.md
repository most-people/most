# Changelog

All notable changes to MostBox are documented in this file.

## [Unreleased]

## [0.8.4] - 2026-11-22

### Added

- Add a prominent account and data deletion request link to the mobile profile and node settings, with an email request pathway and clear local, remote-node, and P2P copy boundaries on the support page.

### Changed

- Clarify the privacy policy for channel identity data, remote-node transfers, optional account sync, HTTP transport, and deletion requests.

## [0.8.3] - 2026-11-22

### Fixed

- Build the Android Bare runtime with flexible page sizes so its ELF load segments support 16 KB memory pages.

## [0.8.2] - 2026-11-20

Protocol and data format are unchanged from 0.8.1; nodes on 0.8.1 upgrade in place, and 0.5.x nodes upgrade directly to 0.8.2 (`docs/upgrade-0.8.0.md`).

### Removed

- The node no longer rate limits requests. Behind a CDN or gateway every visitor reaches the node from the same address, so any per-address limit throttled all users together: twenty failed signatures or wrong invites from anyone returned 429 to every signed-in user for five minutes, and the 600 per minute global budget was shared by all visitors. Auth, MCP token, invite, global, upload/download and admin limits are all gone; failed requests still return 401 or 403. Use long random invite codes, and put flood protection on the gateway or CDN in front of the node.

## [0.8.1] - 2026-11-19

0.8.0 was not published on its own; 0.8.1 is the first published 0.8 release and includes everything listed under 0.8.0. The protocol is unchanged from 0.8.0, and the upgrade path stays 0.5.x to 0.8.1 directly (`docs/upgrade-0.8.0.md`).

### Changed

- Sign-in no longer asks for a device authorization period; certificates last 30 days, and the web and mobile profiles offer 4 hours, 1 day or 30 days and reissue the certificate for the same device key.
- The web profile page shows the account at the top and groups profile, account, theme and advanced settings into collapsible sections. Account sync is on by default for remote nodes.
- The connect panel names the real connection error (wrong invite code, rate limited, timeout) instead of "HTTP unreachable".
- The native and web apps start on the last connected remote node and fall back to the local node.
- When an invite supplies a customer logo, the chat sidebar shows only the logo, with no back link.

### Fixed

- Behind a same-host reverse proxy, each client is rate limited by its forwarded address instead of all clients sharing one budget.
- Expired or future device certificates, stale timestamps and missing logins return 401 without counting toward the auth failure limit, so one stale page no longer locks out everyone behind a shared IP.
- Account sync imports changes in batches and emits at most one update event per scope, and channel socket events and sync updates refresh the views once per burst, which stops request storms and "request timed out" toasts.
- Channels upgraded from v1 with no readable messages fold automatically instead of filling the chat list with empty channels.
- After upgrading from 0.5.x, signing in on the app's local node carries the v1 to v2 migration approval to remote nodes, so files and channel membership move to the new address.
- The mobile app shows and shares channel names instead of the 64-hex public channel ID.
- The custom avatar option stays available after picking a built-in avatar.

## [0.8.0] - 2026-11-18

This release completes and freezes protocol v2. It is not compatible with 0.7.0, 0.6.x or 0.5.x: nodes and web clients of different versions cannot exchange chat messages or files. The supported upgrade path for nodes is 0.5.x to 0.8.0 directly; 0.6.0 and 0.7.0 data directories are not migrated. Back up the stopped data directory first: the first start moves every file into the node's own drive (rehearsed at about 8 s per GB, with the data directory peaking at 2.1 times its size and ending at about 1.7 times). Customer-facing steps are in `docs/upgrade-0.8.0.md`.

From 0.8.0 on, links, topics, key derivations, signature and frame formats only gain additions; new capabilities are negotiated per connection.

### Changed

- **Breaking:** File topics are `H("topic/file", digest)`, so a DHT node that sees a topic cannot recover the CID. The CID drive channel is `most-cid-drive/3`: a `want` carries a proof of knowing the CID digest, bound to the connection's challenge and both Noise keys, and seeds answer only valid proofs (16 invalid proofs close the channel). Drive names use the v2 label. Holdings in 0.5.x shared drives migrate on start.
- **Breaking:** Every chat swarm frame carries `v: 2`; `channel-proof-challenge` is now `channel-challenge`, and it and `channel-proof` drop the `version` field. Non-v2 frames are dropped. Each connection starts with a `session` frame that lists features (`sig1`); signatures stay mandatory whatever a peer lists.
- **Breaking:** P2P Ping uses the v2 labels and frame version 3.
- Pre-upgrade chat history shows a small "Unsigned" note next to each message; signed messages carry no mark.
- Device authorization lasts 30 days after sign-in and can be changed to 4 hours or 1 day in the profile, which asks for the password again when needed. Renewal starts when a tenth of the period is left; the mobile app reminds the user to sign in again.
- The mobile node secret file is renamed from `cid-drive-secret` to `node-secret` on start.
- `hypercore` is upgraded to 11.39.6.

### Added

- The mobile app shows the public channel notice, and mobile hello frames carry member addresses.
- `PRIVACY.md` lists what DHT nodes, CID holders, connected peers and relays can still see.

### Fixed

- Stopping a node while channel blocks were still being verified no longer crashes with an uncaught "RocksDB session is closed".
- Node logs no longer print complete drive keys.

## [0.7.0] - 2026-11-18

This release switches chat to protocol v2 and is not compatible with 0.6.x or 0.5.x: nodes and web clients of different versions cannot exchange chat messages or files, and a 0.7.0 node rejects message requests from older clients. Upgrade the node and its web clients in the same maintenance window, and back up the stopped data directory first. Records migrate on first start and the previous program must not open the migrated directory; roll back by restoring the backup. Customer-facing steps are in `docs/upgrade-0.7.0.md`.

### Changed

- **Breaking:** Channels use v2 keys. New channels get a 52-character random credential. Custom short names (anything other than a 26-character v1 random ID) become public channels, which the web client labels as joinable by anyone who knows the name. v1 channel IDs map deterministically to v2 keys, so members who upgrade meet again without coordination.
- **Breaking:** The chat identity is derived with scrypt (N = 2^17) and is separate from the wallet. Chat addresses change and wallet addresses stay the same. On the first login after upgrading, the client proves both identities and the node moves that account's profile, channels and files to the new address.
- **Breaking:** The client signs every message, member profile, presence frame and voice event with its device key, and nodes store and forward only signed content. Nodes no longer write join events. Voice signals go only to the target session.
- Chat history written before the upgrade stays readable on that node as a read-only snapshot labeled "old message · unsigned · readable on this node only". It is shown only to members who were in the channel at upgrade time and is not replicated to other nodes.

### Fixed

- Migrated accounts see their files the first time they open the file library, without reconnecting.
- Concurrent joins no longer create duplicate channel records.
- Invite identities unlock without a password prompt.
- The active channel scrolls into view in the sidebar, and message timestamps show "yesterday" or the date.

## [0.6.0] - 2026-11-17

This release is not compatible with 0.5.x. Upgrade nodes, desktop apps and mobile apps together; 0.5.x and 0.6.0 cannot exchange files, and a 0.6.0 node rejects requests from older web clients. Back up the data directory before upgrading: file records migrate once on first start and cannot be read by 0.5.x afterwards.

### Changed

- **Breaking:** Requests are signed by a per-device key with a 30-day device certificate instead of the account seed. The `Authorization` header is now `<device-cert>,<timestamp>,<signature>` and the WebSocket query parameter `address` is now `cert`. Saved identities that still hold a seed are discarded and require a new login. Nodes need an accurate clock.
- **Breaking:** CID drive protocol v2 (`most-cid-drive/2`): each seeder serves CID content from its own drive signed with its own key; downloads try each offered drive and keep only content whose CID matches. Holdings in v1 shared-key drives migrate once on start.
- No relay is configured by default; `relayPublicKey` is empty unless the node operator sets it, and the mobile core uses no relay.
- Downloads re-run the DHT topic lookup every 5 seconds while no source is found.

### Added

- Account sync across a user's devices (profile, channels and file metadata), opt-in per remote node, with `PUT/GET/DELETE /api/user/sync`.
- Connection status in the app: status bar, per-channel online peers, HyperDHT reachability, and blocked sends while offline.
- Chat report and block, and English privacy, terms and support pages.
- Crash-consistency, cross-implementation CID, relay-churn and chat chaos test harnesses.

### Fixed

- Reading channel history no longer waits for blocks missing from an offline writer, which hung startup, history reads and sends.
- Records stay consistent when the process is killed during publish or download, and leftover temporary download directories are removed on start.
- Unverified CID drive blocks are no longer treated as local content.
- Small download progress shows B/KiB instead of 0.0 MiB.

## [0.5.5] - 2026-10-19

### Added

- Added mobile channel and conversation management, photo and voice messages, text previews, and chat notifications.
- Added Android foreground service controls for keeping the local node online.
- Added transfer byte counts, streamed CID progress, download recovery hints, and optional relay configuration.

### Changed

- Centered MostBox on decentralized chat and file transfer, with Web3 tools available separately.
- Moved the shared mobile application into `app/` and updated development and validation guidance.

### Fixed

- Fixed production startup, large-file UnixFS encoding, and local file availability checks when blobs are missing.
- Preserved mobile transfer history and partial downloads across core restarts, and improved CID verification cancellation and Android file exports.
- Cached channel authorization for presence heartbeats to prevent repeated channel joins and request timeouts.
- Restored the desktop feature portal on startup and allowed official web origins to connect to nodes by default.
- Restored npm OIDC publishing and the working Android SDK setup in the release workflow.
- Included the required UnixFS installation script in both Docker build stages.
- Selected the repository root explicitly for Electron packaging and installed the Android NDK required by the Bare runtime during release builds.

## [0.5.4] - 2026-09-17

### Changed

- npm 发布切换到 OIDC Trusted Publishing，发布不再依赖长期 `NPM_TOKEN`。

## [0.5.3] - 2026-09-13

### Added

- Added full Android chat entry as the first tab, including remote channel voice signaling controls.

### Fixed

- Fixed Android remote multipart publishing on Expo Winter fetch.
- Added a Hermes-compatible SHA-256/SHA-512 fallback for mobile CID calculation.
- Removed orphaned downloaded holdings correctly when their library record is deleted.

## [0.5.2] - 2026-09-09

### Fixed

- Allow authenticated remote clients to read the attachment size limit while keeping policy updates restricted to local node administrators.

## [0.5.1] - 2026-09-09

### Added

- Added channel-bound cursor history and WebSocket subscription acknowledgements for native chat clients.

### Fixed

- Made concurrent channel joins retain every member and message retries idempotent across node restarts, with conflicts returning HTTP 409.

## [0.5.0] - 2026-08-15

### Added

- Added explicit first-launch privacy consent before the mobile P2P core starts.
- Added iOS release configuration and App Store submission guidance.

### Changed

- Refined mobile P2P Ping diagnostics and moved first-launch consent to the maintained safe-area implementation.
- Localized mobile share-link and store file-policy validation errors.

### Removed

- Removed unused mobile RPC polling commands, redundant event declarations, and an unreferenced storage helper.

## [0.4.9] - 2026-08-11

### Added

- Added simplified Chinese, traditional Chinese, and English Android interfaces, plus x86_64 emulator builds.
- Added bidirectional P2P Ping diagnostics on desktop and Android.

### Changed

- Redesigned the Android file, transfer, and node interfaces, including explicit download cancellation and holding actions, and removed chat from the mobile app.
- Refined the `/hi/` product direction page and localized chat member tags.

### Fixed

- Made CID topic peers announce and look up simultaneously so either peer can initiate a file connection.
- Generated platform-specific Bare Worklet bundles for Android and iOS and hardened mobile state restoration.
- Kept the mobile P2P core online when restoring or switching the interface language.
- Required GitHub Android release APKs to use a persistent app-signing key and fail closed when signing credentials are unavailable.

## [0.4.8] - 2026-08-07

### Added

- Added a receiver-focused CID page with platform-aware client downloads and static deep-link routing.
- Added a separate Future page for longer-term product direction and improved GitHub contribution templates and support documentation.
- Added strict public R2 CORS verification and signed Android store APK build support.

### Changed

- Refreshed the About page and separated shipped MostBox capabilities from future plans.
- Upgraded Electron, React Table, Hypercore, Hyperdrive, Corestore, and related frontend dependencies.
- Improved release download platform detection, fallback behavior, and static application shell handling.

### Fixed

- Removed folder paths from user-facing share-link filenames.
- Increased the full engine integration-suite timeout while retaining short per-operation network timeouts.
- Kept R2 release verification read-only instead of requiring bucket configuration writes.

## [0.4.7] - 2026-08-03

### Added

- Added scoped, revocable MCP clients for node inspection, file publishing, and downloads, with management controls and dedicated documentation.
- Added an interactive OpenAPI reference and separate product, MCP, and API documentation routes.
- Added Google Play build configuration, store assets, privacy and terms pages, and Android release documentation.

### Changed

- Isolated desktop application data by account address and removed the manual data-location workflow.
- Reworked the About page around MostBox's agent-era product vision.
- Enforced synchronized Android version codes and capped MCP client credentials at 365 days.

### Fixed

- Hardened storage paths, MCP authorization, and client lifecycle handling.
- Refined MCP key creation and deletion flows in the admin interface.
- Switched the Anthropic connectivity check to a stable probe and corrected the portal node connection label.

## [0.4.6] - 2026-07-30

### Added

- Added grouped connectivity checks for MostBox services and external dependencies.
- Added privacy, security, and code-signing policy documentation.

### Changed

- Reconciled newer account profiles after login and asked before restoring differing cloud account data.
- Required users to preview the derived account address before confirming login.
- Reduced Android launcher icon artwork to fit platform safe areas.

### Fixed

- Restored deterministic DiceBear address avatars.
- Prevented same-named attachments from conflicting in the file library.
- Detected cloud channel backups that contain locally missing writer cores.
- Documented the authenticated cloud-backup lookup performed after login.

## [0.4.5] - 2026-07-27

### Added

- Added Docker, npm, and desktop deployment choices to the download page.
- Added native `most://` link handling and verified attachment downloads to Android.
- Added a data-location prompt before the first desktop restore and profile theme controls.

### Changed

- Reduced the Android alpha download by shipping an arm64-only APK with compressed native libraries.
- Bound chat synchronization to a per-connection proof of channel ID knowledge.
- Moved the file library to `/file/` while preserving `/app/` as a compatibility redirect.
- Refined the file download flow, site navigation, About page, and profile actions.

### Removed

- Removed the game routes, UI, protocol handlers, and unused mobile dependencies.

## [0.4.4] - 2026-07-24

### Added

- Added separate encrypted-friend and public-chat entry points.
- Added shared channel synchronization across the web and Android chat clients.

### Changed

- Restored the compact chat page and refined the join-chat dialog copy and layout.
- Made chat IDs case-insensitive with lowercase canonicalization and 26-character high-entropy defaults.
- Moved the Android package from `app/android` to `mobile` and updated the app icon.

### Removed

- Removed legacy direct-channel protocol and metadata paths from the shared chat flow.
