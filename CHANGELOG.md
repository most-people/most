# Changelog

All notable changes to MostBox are documented in this file.

## [Unreleased]

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
