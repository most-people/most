# MostBox Android

Android app MVP for MostBox file sharing. This package keeps the mobile UI and Bare Worklet P2P core separate from the desktop/web code.

## Current State

- Phase 0 device validation has passed on a real Android device.
- Android and desktop MostBox nodes have completed end-to-end publish/download/CID verification/seeding interop in foreground mode.
- The first screen shows node status, holdings, transfers, and logs.
- Publish and download actions use the Bare Worklet P2P core.
- `backend/backend.mjs` starts the real mobile P2P core over JSONL IPC.
- The mobile P2P core uses Hyperswarm, Corestore, Hyperdrive, CID digest topics, `/<cid>` drive paths, and CID verification before downloaded files become holdings.

## Commands

From the repository root:

```bash
npm run android
npm run android:test
npm run android:build
```

From this package:

```bash
cd mobile/android
npm install
npm start
npm test
npm run apk
```

`npm start` bundles the Bare Worklet core, starts the Expo dev server, picks the first connected Android target unless `ANDROID_SERIAL` is set, starts the first available emulator when no target is connected, and opens the dev client automatically. Emulators use `adb reverse` with `http://127.0.0.1:8081`; physical devices use an automatically selected LAN URL.

If the machine has multiple network adapters and the selected LAN URL is not reachable from the phone, set `MOST_ANDROID_HOST` to the host IP address on the same Wi-Fi/LAN before running `npm start`. The script prints the dev server URL it is opening; manual entry in the Expo Development Servers screen should only be needed when no device is connected or Android rejects the automatic intent.

## Alpha APK

`npm run apk` builds a release APK for device installation and writes these files to `mobile/android/dist/`:

- `mostbox-android-<version>-release.apk`
- `mostbox-android-<version>-release.apk.sha256.txt`

The release build is an internal alpha artifact. It uses the current local Android signing setup and is not a Play Store production build.

## Real P2P Test

Use one Android device and at least one desktop MostBox node:

1. Start the Android dev client with `npm start`, or install the APK from `mobile/android/dist/`.
2. Confirm the Android header reaches `Ready`.
3. Publish a file on Android and confirm the transfer reaches `completed`.
4. Confirm Holdings shows the CID with `active` and `topicJoined` true.
5. Copy the `most://` link and download it from a desktop MostBox node. The desktop download must pass CID verification.
6. Publish a file from desktop, download it on Android, and confirm Android adds it to Holdings.
7. Use `打开/分享` from the Android holding row and confirm Android shows the system share/open sheet.
8. Use `保存` from the Android holding row, choose a phone folder, and confirm a user-visible copy is created.
9. Delete that Android holding and confirm the row disappears, the app stops seeding that CID, and the user-visible copy saved in step 8 still exists.
10. Paste the same `most://` link again, download it while another seed is online, and confirm Android adds it back to Holdings with `active` and `topicJoined` true.
11. Stop the original desktop publisher. Keep Android in the foreground, then download the same link from another desktop node.
12. Restart the Android app and confirm existing holdings rejoin their CID topics.

## Known Limits

- Android alpha only promises foreground seeding. It does not promise long-running background availability.
- Exported or saved files are user-visible copies. MostBox keeps its internal holding copy for CID verification and seeding.
- Deleting an Android holding removes only the app-internal holding copy and holding record; user-visible saved/exported copies are not managed by MostBox.
- iOS, Play Store distribution, cloud relay, account sync, chat, games, notes, and Web3 toolbox migration are outside this alpha.
- Large files may expose storage, network interruption, and Android file picker/export edge cases; record those in `docs/mobile-android-alpha.md`.

## Protocol Invariants

- `most://<cid>?filename=...` remains the native share link.
- CID remains the only content identity.
- Hyperswarm topic must use `cid.multihash.digest`.
- Hyperdrive stores the file at `/<cid>`.
- Downloaded content must be re-hashed as UnixFS CID v1 before it is saved or seeded.
