# MostBox Android

Android app MVP for MostBox file sharing. This package keeps the mobile UI and Bare Worklet P2P core separate from the desktop/web code.

## Current State

- Expo / React Native Android shell is in place.
- The first screen shows node status, holdings, transfers, and logs.
- Publish and download actions are wired to a development mock core.
- `backend/backend.mjs` defines the first Bare Worklet entrypoint for the real P2P core.
- Real Hyperswarm / Hyperdrive publishing and pulling still need Android device validation.

## Commands

```bash
cd mobile/android
npm install
npm run start
npm run android
npm run typecheck
```

Bundle the Bare Worklet core after implementing the real backend:

```bash
npm run bundle:core
```

## Protocol Invariants

- `most://<cid>?filename=...` remains the native share link.
- CID remains the only content identity.
- Hyperswarm topic must use `cid.multihash.digest`.
- Hyperdrive stores the file at `/<cid>`.
- Downloaded content must be re-hashed as UnixFS CID v1 before it is saved or seeded.
