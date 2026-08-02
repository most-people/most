# Changelog

All notable changes to MostBox are documented in this file.

## [Unreleased]

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
