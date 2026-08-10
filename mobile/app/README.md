# MostBox Mobile

MostBox 的 Android 商店版和共享 Bare Worklet P2P 核心。移动工程与桌面/Web UI 分离，但保持相同的 `most://`、CID、Hyperdrive 和做种协议。

## 当前状态

- Android 使用原生 React Native 工具界面，包含“文件 / 知识库 / 传输 / 节点”四个入口，默认进入“文件”。
- 用户可选择文件发布，得到 `most://<cid>?filename=...` 链接并在前台做种。
- 外部 `most://` 深链只打开下载确认页，不会自动开始下载。
- 下载完成后重算 UnixFS CID v1，校验通过才写入 holding 并加入 CID topic。
- holding 支持复制链接、系统分享、保存副本和删除；删除 holding 后停止本机做种。
- 知识库以 UTF-8 `.md` 明文保存在 App 文档目录的 `mostbox-knowledge/`，支持目录、搜索、编辑、预览、单篇导入导出和整库快照替换恢复。
- 知识库附件只在 Markdown 中保存 `most://` 引用；发布、确认下载、CID 校验和自动做种仍复用文件模块。
- Google Play 版本不暴露聊天、账号、广告、付费、Web3、公开内容目录或后台常驻能力。
- 已知应用安装包、脚本和可执行文件类型会在发布或下载前被拒绝。

## 命令

所有移动端命令都从本目录执行：

```bash
cd mobile/app
npm install
npm start
npm test
npm run typecheck
npm run bundle:android
npm run bundle:ios
npm run build
```

`npm start` 会打包 Bare Worklet、启动 Expo 开发服务器并打开已连接的 Android 设备或模拟器。

## 内部 APK

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

Play Console 填报、审核说明和素材要求见 `../../docs/google-play-submission.md`。

## 验收

Android 真机验收清单见 `../../docs/mobile-android-alpha.md`。最高优先级回归仍是原发布者退出后，由 Android 前台种子继续向新节点传播：

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

## 边界

- Android 只承诺前台做种，返回前台后恢复节点和 topic。
- 保存或分享产生的是用户可见副本；MostBox 内部 holding 副本用于 CID 校验和做种。
- 移动端知识库与桌面/Web 知识库独立，不接入账号、云同步、Git 或 daemon；迁移只通过单篇 Markdown 或整库 JSON 快照手工完成。
- 整库恢复会在完整校验和用户确认后完全替换当前知识库，不自动合并；失败时保留恢复前的数据。
- 笔记本身不发布到 Hyperdrive，也不生成分享链接；只有用户主动选择的附件进入文件发布流程。
- CID 即权限，链接泄露后无法从 P2P 网络统一撤回。
- iOS 本轮只要求共享代码类型检查和 bundle 成功，不做签名、真机或 TestFlight 验收。

## 协议不变量

- 原生链接固定为 `most://<cid>?filename=...`。
- CID 是唯一内容身份。
- Hyperswarm topic 使用 `cid.multihash.digest`。
- Hyperdrive 文件路径固定为 `/<cid>`。
- 下载内容必须重算 UnixFS CID v1，校验通过后才保存和做种。
