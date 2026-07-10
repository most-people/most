# MostBox Android

Android foreground P2P alpha for MostBox. This package keeps the React Native UI and Bare Worklet P2P core separate from the desktop/web code while preserving the same `most://`, CID, Hyperdrive, and seeding rules.

## Current State

- Android opens on the Chat tab with a native chat list aligned to the Web `/chat/` entry.
- The Chat tab includes chat room and chat settings screens, message compose, attachment compose, and received `most://` links rendered as chat attachment cards with download actions.
- The secondary Node tab is for diagnostics: node status, holdings, transfers, logs, and holding export/delete actions.
- Channel create/list/messages/presence use the mobile Bare Worklet P2P core over JSONL IPC.
- Sending an attachment publishes the selected file, creates the `most://<cid>?filename=...` link, posts that link into the active chat room, and keeps the Android node seeding in the foreground.
- Received chat messages that contain a `most://` link render as chat attachment cards; tapping the attachment download action downloads and verifies the file with the Android node.
- Android and desktop MostBox nodes have completed end-to-end publish/download/CID verification/seeding interop in foreground mode.
- `backend/backend.mjs` starts the real mobile P2P core.
- The mobile P2P core uses Hyperswarm, Corestore, Hyperdrive, CID digest topics, `/<cid>` drive paths, and CID verification before downloaded files become holdings.

## Commands

Run Android development, test, and packaging commands from this package. The repository root does not provide `android:start`, `android:test`, or `android:build` wrappers.

```bash
cd mobile/android
npm install
npm start
npm test
npm run build
```

`npm start` bundles the Bare Worklet core, starts the Expo dev server, picks the first connected Android target unless `ANDROID_SERIAL` is set, starts the first available emulator when no target is connected, and opens the dev client automatically. Emulators use `adb reverse` with `http://127.0.0.1:8081`; physical devices use an automatically selected LAN URL.

If the machine has multiple network adapters and the selected LAN URL is not reachable from the phone, set `MOST_ANDROID_HOST` to the host IP address on the same Wi-Fi/LAN before running `npm start`. The script prints the dev server URL it is opening; manual entry in the Expo Development Servers screen should only be needed when no device is connected or Android rejects the automatic intent.

## Alpha APK

`npm run build` builds a release APK for device installation and writes these files to `mobile/android/dist/`:

- `mostbox-android-<version>-release.apk`
- `mostbox-android-<version>-release.apk.sha256.txt`

The release build is an internal alpha artifact. It uses the current local Android signing setup and is not a Play Store production build.

## Alpha Acceptance

Use `../../docs/mobile-android-alpha.md` for the current Android alpha acceptance checklist. The highest-value foreground seeding regression is:

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

## Known Limits

- Android alpha only promises foreground seeding. It does not promise long-running background availability.
- Android chat currently focuses on private room messages, presence, and `most://` attachment links; notes, games, and Web3 remain desktop/web-first surfaces.
- Exported or saved files are user-visible copies. MostBox keeps its internal holding copy for CID verification and seeding.
- Deleting an Android holding removes only the app-internal holding copy and holding record; user-visible saved/exported copies are not managed by MostBox.
- iOS, Play Store distribution, cloud relay, account sync, background seeding guarantees, and full notes/games/Web3 migration are outside this alpha.
- Large files may expose storage, network interruption, and Android file picker/export edge cases; record those in `docs/mobile-android-alpha.md`.

## Protocol Invariants

- `most://<cid>?filename=...` remains the native share link.
- CID remains the only content identity.
- Hyperswarm topic must use `cid.multihash.digest`.
- Hyperdrive stores the file at `/<cid>`.
- Downloaded content must be re-hashed as UnixFS CID v1 before it is saved or seeded.
