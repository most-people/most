# Changelog

All notable changes to MostBox are documented in this file.

## [Unreleased]

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
