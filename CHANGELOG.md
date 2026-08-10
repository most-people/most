# Changelog

All notable changes to MostBox are documented in this file.

## [Unreleased]

## [0.4.9] - 2026-08-10

### Added

- Added a local Markdown knowledge base on Android with single-note transfer, versioned snapshot backup and restore, and verified `most://` attachments.
- Added simplified Chinese, traditional Chinese, and English Android interfaces, plus x86_64 emulator builds.
- Added bidirectional P2P Ping diagnostics on desktop and Android.

### Changed

- Redesigned the Android file, chat, transfer, and node interfaces, including explicit download cancellation and holding actions.
- Replaced the Future page with the `/hi/` knowledge direction page and separated available capabilities from future plans.
- Expanded desktop note import and export flows and localized chat member tags.

### Fixed

- Made CID topic peers announce and look up simultaneously so either peer can initiate a file connection.
- Generated platform-specific Bare Worklet bundles for Android and iOS and hardened mobile knowledge snapshot restoration.
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
- Added Git-backed history and restore workflows for desktop Markdown note vaults.
- Added Google Play build configuration, store assets, privacy and terms pages, and Android release documentation.

### Changed

- Stored knowledge-base articles as plain Markdown and automatically migrated decryptable legacy encrypted notes to plaintext.
- Isolated desktop note vaults by account address and removed the manual vault-location workflow.
- Reworked the About page around MostBox's agent-era product vision.
- Enforced synchronized Android version codes and capped MCP client credentials at 365 days.

### Fixed

- Hardened note-vault paths, Git operations, MCP authorization, and client lifecycle handling.
- Refined MCP key creation and deletion flows in the admin interface.
- Switched the Anthropic connectivity check to a stable probe and corrected the portal node connection label.

## [0.4.6] - 2026-07-30

### Added

- Added CID-backed file and image attachments to Markdown notes.
- Added grouped connectivity checks for MostBox services and external dependencies.
- Added privacy, security, and code-signing policy documentation.

### Changed

- Reconciled newer account profiles after login and asked before restoring differing cloud account data.
- Required users to preview the derived account address before confirming login.
- Reduced Android launcher icon artwork to fit platform safe areas.

### Fixed

- Restored deterministic DiceBear address avatars.
- Prevented same-named note attachments from conflicting in the file library.
- Detected cloud channel backups that contain locally missing writer cores.
- Documented the authenticated cloud-backup lookup performed after login.

## [0.4.5] - 2026-07-27

### Added

- Added Docker, npm, and desktop deployment choices to the download page.
- Added native `most://` link handling and verified attachment downloads to Android.
- Added a note-vault location prompt before the first desktop restore and profile theme controls.

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
- Moved the Android package from `mobile/android` to `mobile/app` and updated the app icon.

### Removed

- Removed legacy direct-channel protocol and metadata paths from the shared chat flow.
