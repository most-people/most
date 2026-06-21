# MostBox Android

Android app MVP for MostBox file sharing. This package keeps the mobile UI and Bare Worklet P2P core separate from the desktop/web code.

## Current State

- Expo / React Native Android shell is in place.
- The first screen shows node status, holdings, transfers, and logs.
- Publish and download actions prefer the Bare Worklet P2P core and fall back to the development mock only when the bundle is missing.
- `backend/backend.mjs` starts the real mobile P2P core over JSONL IPC.
- The mobile P2P core uses Hyperswarm, Corestore, Hyperdrive, CID digest topics, `/<cid>` drive paths, and CID verification before downloaded files become holdings.
- Real Hyperswarm / Hyperdrive publishing and pulling still need Android device validation across two devices or one Android device plus one desktop daemon.

## Commands

```bash
cd mobile/android
npm install
npm run start
npm run android
npm run typecheck
npm test
```

Bundle the Bare Worklet core manually when needed:

```bash
npm run bundle:core
```

`npm run start`, `npm run android`, and `npm run prebuild` run `bundle:core` first.

## Real P2P Test

1. Start one desktop seed node, publish a small file, and copy the `most://` link.
2. Install/run the Android app with `npm run android`.
3. Confirm the header reaches `Ready`.
4. Paste the `most://` link into Download and tap the download button.
5. Confirm the transfer reaches `completed`, the holding appears with `active`, and the desktop node logs a peer connection.
6. Stop the original desktop publisher, keep the Android app open, then download the same link from another desktop/mobile node to confirm Android is seeding.

## Protocol Invariants

- `most://<cid>?filename=...` remains the native share link.
- CID remains the only content identity.
- Hyperswarm topic must use `cid.multihash.digest`.
- Hyperdrive stores the file at `/<cid>`.
- Downloaded content must be re-hashed as UnixFS CID v1 before it is saved or seeded.
