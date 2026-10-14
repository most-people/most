# MostBox Mobile

MostBox 的 iOS / Android 商店版和共享 Bare Worklet P2P 核心，产品定位为 DChat：去中心化频道聊天与文件传输。移动工程与桌面/Web UI 分离，但保持相同的 `most://`、CID、Hyperdrive 和做种协议。

## 当前状态

- iOS / Android 使用原生 React Native 界面，MostBox 底栏为“聊天 / 通讯录 / 发现 / 我”；频道管理在通讯录，文件和传输入口在发现，节点与账号入口在我。墨盒保持文件入口。
- 用户可选择文件发布，得到 `most://<cid>?filename=...` 链接并在前台做种。
- 外部 `most://` 深链只打开下载确认页，不会自动开始下载。
- 手工下载输入与桌面端一致，支持 `most://`、尾部为 CID 的网页入口和裸 CID。
- 下载完成后重算 UnixFS CID v1，校验通过才写入 holding 并加入 CID topic。
- holding 支持复制链接、系统分享、保存副本和删除；删除 holding 后停止本机做种。
- iOS / Android 原生构建启动内置 Bare Worklet 节点，并支持连接远程 MostBox daemon、远程节点切换、远程身份和登录。原生与 Web 共享远程 API、WebSocket 和签名协议。
- 聊天支持频道创建/加入、分页历史、草稿、未读提示、文本和 `most://` 附件；相册、拍摄和按住录音复用 CID 发布与做种流程。录音松手后可试听、取消或发送，本机已有的语音附件可在聊天中播放。相机和麦克风仅在用户使用对应功能时申请权限，切到后台取消正在录制的语音。
- 频道信息可复制名称并分享给朋友；带 `#` 的名称可直接加入或搜索。删除会话列表条目保留频道与历史，新收到的他人消息使会话重新出现。
- 文本和语音在当前页面内失败重试复用发送标识；本机和远程节点按频道、作者与标识去重。语音发送失败保留试听，已发布的录音重试时复用附件。应用重启后仍恢复草稿，但当前不持久化界面的未确认发送标识。
- “我”中可开启新消息静音提醒，点击通知进入对应频道。提醒由本机收到的消息触发，不注册云端推送 token；应用关闭或被系统暂停时不能保证及时提醒。通知不展示消息正文或附件内容。
- “关于 MostBox”可查看版本、当前能力边界，以及隐私政策、使用条款和问题反馈入口。
- 语音通话入口目前只同步加入、离开和静音等信令状态，尚未接入实时音频传输；不能把参与者状态同步当作真实通话成功。
- Expo Web 使用平台专用入口连接用户已有的 MostBox daemon；浏览器不运行 Bare Worklet，本机 P2P 传输由远程 daemon 完成。
- 原生移动端提供聊天、语音、账号身份、远程节点、文件、传输和 P2P 诊断等完整 MostBox 能力；广告、付费和公开内容目录不属于当前产品功能。
- 已知应用安装包、脚本和可执行文件类型会在发布或下载前被拒绝。

## 命令

所有移动端命令都从本目录执行：

```bash
cd app
npm install
npm start
npm run web
npm test
npm run typecheck
npm run bundle:android
npm run bundle:ios
npm run preflight:ios
npm run build
npm run build:web
```

`npm start` 启动 Expo Web，默认访问 `http://localhost:2021`。Android Dev Client 请使用对应的原生 bundle 和设备启动脚本。

`npm run preflight:ios` 会同步 iOS 原生版本、生成 iOS Bare bundle，并检查 App Store 分发档位、Bundle ID、iPhone 设备范围、最低系统版本、隐私清单和 1024 × 1024 无透明通道图标。它不执行 Apple 签名、Archive 上传或 TestFlight 验收。

## Web

Expo Web 生产入口部署在 `https://app.most.box`。浏览器不运行 Bare Worklet，也不直接参与 Hyperswarm；它连接已有 MostBox daemon，由 daemon 完成发布、下载、CID 校验、做种以及聊天和语音信令。原生 Android/iOS 同样可在节点页连接远程 daemon，并在本机与远程节点之间切换。

本地导出：

```bash
npm run build:web
```

Web 导出固定写入 `web-dist/`，不会覆盖 `dist/` 下的 Android、iOS 构建产物。生产环境由 Cloudflare Pages 直接连接 `most-people/most` 仓库，production branch 为 `pre`，Root directory 为 `mobile`，Build command 为 `npm run build:web`，Build output directory 为 `web-dist`。推送到 `pre` 后 Pages 自动发布到 `app.most.box`，不需要 Cloudflare API Token。

## 内部 APK

Android 最低支持 Android 12（API 31），与 `react-native-bare-kit 0.15.0` 的原生运行时要求一致。升级 Bare Kit 前需在最低支持版本真机验证冷启动和本机节点。

`npm run build` 生成用于真机内测的 arm64 APK 和 SHA256：

- `dist/mostbox-android-<version>-release.apk`
- `dist/mostbox-android-<version>-release.apk.sha256.txt`

该 APK 使用本地 Alpha 签名配置，不能上传 Google Play。

## GitHub Release APK

GitHub Release APK 必须使用跨版本不变的永久 App Signing Key。发布构建缺少任一签名变量时会在构建前失败，不会回退到 debug key：

```powershell
$env:MOSTBOX_ANDROID_KEYSTORE='C:\secure\mostbox-app-signing.p12'
$env:MOSTBOX_ANDROID_KEYSTORE_PASSWORD='<keystore password>'
$env:MOSTBOX_ANDROID_KEY_ALIAS='mostbox-app-signing'
$env:MOSTBOX_ANDROID_KEY_PASSWORD='<key password>'
npm run build:release
```

产物：

- `dist/mostbox-android-<version>-release.apk`
- `dist/mostbox-android-<version>-release.apk.sha256.txt`

构建脚本会使用 Android SDK Build Tools 的 `apksigner` 验证最终 APK，并要求唯一 signer 的证书 SHA-256 为 `476989ca590dc9b87f80d0ed19effb649376d6aa5180bb45f3ac79e5f2306233`。永久 Key 必须长期保管且每个版本复用，否则 Android 无法覆盖升级。

GitHub Release workflow 使用同一组签名值，并从 `MOSTBOX_ANDROID_KEYSTORE_BASE64` Secret 还原 keystore。

## 模拟器 APK

x86_64 Android 模拟器使用独立构建，避免通过 ARM 转译层运行 Bare Worklet 原生扩展：

```bash
npm run build:emulator
```

产物：

- `dist/mostbox-android-<version>-emulator-x86_64.apk`
- `dist/mostbox-android-<version>-emulator-x86_64.apk.sha256.txt`

该 APK 仅用于本地 x86_64 模拟器验证；真机内测和应用商店构建仍使用 arm64。

## 应用商店 APK

Google Play 以外、接受 APK 的应用商店使用永久 App Signing Key 构建：

```powershell
$env:MOSTBOX_ANDROID_KEYSTORE='C:\secure\mostbox-app-signing.p12'
$env:MOSTBOX_ANDROID_KEYSTORE_PASSWORD='<keystore password>'
$env:MOSTBOX_ANDROID_KEY_ALIAS='mostbox-app-signing'
$env:MOSTBOX_ANDROID_KEY_PASSWORD='<key password>'
npm run build:store
```

产物：

- `dist/mostbox-android-<version>-store-release.apk`
- `dist/mostbox-android-<version>-store-release.apk.sha256.txt`

永久 App Signing Key 必须跨版本、跨应用商店保持不变；不得改用 debug key 或 Play Upload Key。

## Google Play AAB

本地 AAB 构建必须提供独立 upload key；缺少任一变量时脚本会在构建前失败，不会回退到 debug key：

```powershell
$env:MOSTBOX_ANDROID_KEYSTORE='C:\secure\mostbox-upload.jks'
$env:MOSTBOX_ANDROID_KEYSTORE_PASSWORD='<keystore password>'
$env:MOSTBOX_ANDROID_KEY_ALIAS='mostbox-upload'
$env:MOSTBOX_ANDROID_KEY_PASSWORD='<key password>'
npm run build:play
```

产物：

- `dist/mostbox-android-<version>-release.aab`
- `dist/mostbox-android-<version>-release.aab.sha256.txt`

也可以使用 EAS `android-production` profile 构建 App Bundle，由 EAS credentials 管理 upload key：

```bash
npx eas-cli@latest build --platform android --profile android-production
```

Play Console 填报、审核说明和素材要求见 `../docs/google-play-submission.md`。

## 验收

Android 真机验收清单见 `../docs/mobile-android-alpha.md`。最高优先级回归仍是原发布者退出后，由 Android 前台种子继续向新节点传播：

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

## 边界

- 本机节点在应用进入后台时受系统调度限制，返回前台后恢复节点和 topic；远程节点可按 daemon 能力继续后台传输。
- 保存或分享产生的是用户可见副本；MostBox 内部 holding 副本用于 CID 校验和做种。
- Android、iOS 和 Expo Web 均验收远程节点断线与重连、身份登录和节点切换；Web 仅额外受浏览器无法运行 Bare Worklet 的限制。
- CID 即权限，链接泄露后无法从 P2P 网络统一撤回。
- iOS 模拟器 Release 和无签名 `iphoneos` arm64 Release 已构建通过；正式发布仍以签名真机和内部 TestFlight 完成 P2P 闭环为准。

## 协议不变量

- 原生链接固定为 `most://<cid>?filename=...`。
- CID 是唯一内容身份。
- Hyperswarm topic 使用 `cid.multihash.digest`。
- Hyperdrive 文件路径固定为 `/<cid>`。
- 下载内容必须重算 UnixFS CID v1，校验通过后才保存和做种。
