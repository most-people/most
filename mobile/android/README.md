# MostBox Android

Android app MVP for MostBox file sharing. This package keeps the mobile UI and Bare Worklet P2P core separate from the desktop/web code.

## Current State

- Expo / React Native Android shell is in place.
- The first screen shows node status, holdings, transfers, and logs.
- Publish and download actions use the Bare Worklet P2P core.
- `backend/backend.mjs` starts the real mobile P2P core over JSONL IPC.
- The mobile P2P core uses Hyperswarm, Corestore, Hyperdrive, CID digest topics, `/<cid>` drive paths, and CID verification before downloaded files become holdings.
- Real Hyperswarm / Hyperdrive publishing and pulling still need Android device validation across two devices or one Android device plus one desktop daemon.

## Commands

```bash
cd mobile/android
npm install
npm start
```

From the repo root, the Android shortcut is:

```bash
npm run android
```

`npm start` bundles the Bare Worklet core, starts the Expo dev server, picks the first connected Android target unless `ANDROID_SERIAL` is set, starts the first available emulator when no target is connected, and opens the dev client automatically. Emulators use `adb reverse` with `http://127.0.0.1:8081`; physical devices use an automatically selected LAN URL.

If the machine has multiple network adapters and the selected LAN URL is not reachable from the phone, set `MOST_ANDROID_HOST` to the host IP address on the same Wi-Fi/LAN before running `npm start`. The script prints the dev server URL it is opening; manual entry in the Expo Development Servers screen should only be needed when no device is connected or Android rejects the automatic intent.

## Real P2P Test

Use a connected Android device:

1. Start the Android dev client with `npm start`.
2. Confirm the header reaches `Ready`.
3. Publish a file and confirm the transfer reaches `completed`.
4. Confirm Holdings shows the CID with `active` and `topicJoined` true.
5. Copy the `most://` link and use another MostBox node to verify download and CID check.

## Protocol Invariants

- `most://<cid>?filename=...` remains the native share link.
- CID remains the only content identity.
- Hyperswarm topic must use `cid.multihash.digest`.
- Hyperdrive stores the file at `/<cid>`.
- Downloaded content must be re-hashed as UnixFS CID v1 before it is saved or seeded.
