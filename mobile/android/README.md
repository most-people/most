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

## Real P2P Chat And Attachment Test

Use one Android device and at least one desktop MostBox node:

1. Start the Android dev client with `npm start`, or install the APK from `mobile/android/dist/`.
2. Open the Node tab and confirm the Android node reaches `在线`.
3. Return to the Chat tab, then join or create a chat room such as `chat-android`.
4. In desktop MostBox, open `/chat/`, join the same room, and send a message both ways.
5. In Android, tap `发送附件`, choose a file, and confirm a chat message containing a `most://` link appears.
6. Download that link from the desktop node. The desktop download must pass CID verification.
7. Send a desktop `most://` attachment link into the chat room, confirm Android renders it as an attachment card, then tap the chat attachment download action.
8. Open the Node tab and confirm Android adds the downloaded file to Holdings with `active` and `topicJoined` true.
9. In the Node tab, use `打开/分享` from the Android holding row and confirm Android shows the system share/open sheet.
10. In the Node tab, use `保存` from the Android holding row, choose a phone folder, and confirm a user-visible copy is created.
11. Delete that Android holding and confirm the row disappears, the app stops seeding that CID, and the user-visible copy saved in step 10 still exists.
12. Stop the original desktop publisher. Keep Android in the foreground, then download the same link from another desktop node.
13. Restart the Android app and confirm existing holdings rejoin their CID topics.

For a local desktop seed helper, run this from the repository root:

```bash
node scripts/android-real-p2p-seed.mjs
```

## Foreground Seed Handoff Regression

Before each alpha release, use the handoff helper to replay the highest-value foreground seeding path:

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

The script publishes a small desktop fixture, prints the `most://` link, and waits while Android downloads it. Keep Android in the foreground, send or receive the printed link in the active chat room, then confirm these observations before pressing Enter in the script:

- The Node tab shows Android as `Ready` / `在线`.
- The download transfer for the printed link is completed.
- Holdings contains the printed CID, the size matches, `status` is `active`, and `topicJoined` is true.
- Android logs mention the download completion and seeding/holding update.

After Enter, the helper stops the original desktop publisher, starts a fresh verifier node with clean data, pulls the same link from the remaining Android seed, recomputes the UnixFS CID, and prints `Android foreground seed handoff regression PASSED.` on success. Keep these log lines in the alpha note: `publisher topic joined`, `verifier download status`, `verifier download success`, `verifiedCid`, `verifierHoldingStatus`, and `verifierTopicJoined`.

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
