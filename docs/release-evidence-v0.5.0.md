# MostBox V0.5.0 封版验证档案

记录日期：2026-08-15

最后更新：2026-08-22

本文记录 V0.5.0 代码封版、自动化检查、真机结论和正式发布门禁。商店账号、签名、备案和提交回执必须在对应平台完成后补充，不以口头结论代替平台证据。

## 版本基线

| 项目                         | 固定值                                     |
| ---------------------------- | ------------------------------------------ |
| 产品版本                     | `0.5.0`                                    |
| Android application ID       | `most.box`                                 |
| Android versionCode          | `500`                                      |
| iOS bundle ID                | `most.box`                                 |
| iOS build number             | `500`                                      |
| iOS 最低版本                 | `16.4`                                     |
| Android target / compile SDK | `36` / `36`                                |
| 封版前基线提交               | `a5ec2ec3fc36041f1153d72da72d373056c933c7` |

最终封版提交在本地 `pre` 合入 `main` 后，以 `git rev-parse main` 的结果补入发布回执；正式标签必须指向该提交。

## 首发范围与负责人决定

- 负责人于 2026-08-21 确认：V0.5.0 商店首发不选择中国大陆销售地区。
- APP 备案继续作为进入中国大陆分发前的门禁，不阻塞本轮境外商店资料准备和内测。
- D-U-N-S 编号仍在等待下发；不得将等待中记录为已完成，也不得在编号下发前虚构平台回执。
- 当前 tag 流水线会把 Android APK 上传到 GitHub Release 和公开 R2 下载页。正式推送 `v0.5.0` 前，必须明确境外商店首发时是否移除公开 APK；仅在商店后台排除中国大陆不能限制官网直接下载。

## 自动化验证

| 检查          | 结果 | 备注                                                      |
| ------------- | ---- | --------------------------------------------------------- |
| `npm test`    | 通过 | 626 项：625 通过，0 失败，1 项因 Windows 符号链接权限跳过 |
| 前端测试      | 通过 | 84 项通过                                                 |
| Electron 测试 | 通过 | 12 项通过                                                 |
| 移动端测试    | 通过 | 72 项通过                                                 |
| 协议测试      | 通过 | 9 项通过                                                  |
| TypeScript    | 通过 | 常规及 strict-router 检查通过                             |
| 生产构建      | 通过 | Vite/TanStack 静态产物构建通过；存在非阻断的大 chunk 提示 |
| 版本一致性    | 通过 | 根项目、移动端和 Expo 配置均为 `0.5.0`                    |
| iOS 配置预检  | 通过 | `0.5.0 (500)`、`most.box`、iPhone-only 配置通过           |
| 代码格式      | 通过 | `npm run format` 通过                                     |

## 真机验收

- Android：负责人确认已通过真实设备上的文件、知识库、发布、下载、CID 校验、前台做种，以及原发布者退出后的传播闭环。
- iPhone：负责人确认已通过真实设备上的功能和 P2P 传播闭环。
- 待补证据：设备型号、系统版本、候选包文件名和 SHA-256、网络环境、测试时间、测试人、原始日志或录屏编号。
- iOS 商店门禁：取得 Apple Developer 组织资格后，必须生成正式签名的内部 TestFlight build，从 TestFlight 安装并复跑同一闭环，补充 build ID 和结果。

### 负责人待补真机证据

- [ ] Android 设备型号、系统版本、build fingerprint、`versionName` 和 `versionCode`。
- [ ] iPhone 设备型号、iOS 版本，以及候选包来源。
- [ ] Android AAB / iOS TestFlight 的候选包文件名、SHA-256 和平台 build ID。
- [ ] 测试时间、测试人、Wi-Fi / 蜂窝网络环境，以及原始日志或录屏编号。
- [ ] 从正式候选包复跑发布、下载、CID 校验、前台做种和原发布者退出后的传播闭环。

### 证据获取方法

Android 设备连接电脑并打开 USB 调试后执行：

```powershell
adb devices -l
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.build.fingerprint
adb shell dumpsys package most.box | Select-String 'versionName|versionCode'
```

当前检查时 `adb devices -l` 没有发现已连接设备，因此无法从本机自动补齐型号和系统版本。重新连接测试手机并授权调试后，将上述输出连同测试日期、网络环境和测试人写入本档案。

Android 候选包文件名和哈希：

```powershell
Get-ChildItem mobile\app\dist\mostbox-android-0.5.0-*
Get-FileHash -Algorithm SHA256 mobile\app\dist\mostbox-android-0.5.0-release.aab
```

已归档 Google Play AAB SHA-256：`B475E8048E765777EA9225A0C9C207F2E48C0504783B8E3262F8EE686E1DAA4A`。该记录证明候选 AAB 曾经完成构建和审计。2026-08-21 在仓库、Android 原生构建输出、Downloads 和 Desktop 中未找到对应 `.aab`；提交前必须找回原文件并核对哈希，或使用同一 upload key 重新构建、重新审计并归档新哈希。本地同名 Release APK 是调试签名，仅供测试，不能作为商店或备案候选包。

iPhone 型号和系统版本可在“设置 > 通用 > 关于本机”查看；连接 Mac 后也可在 Xcode 的“Window > Devices and Simulators”中复制设备型号、系统版本和设备标识。TestFlight build ID 需在 App Store Connect 的 TestFlight 页面取得；D-U-N-S、Apple Developer 组织账号和首个 TestFlight build 尚未完成前，该 ID 不存在。最终 IPA 可在 Mac 上运行 `shasum -a 256 '<ipa-path>'` 记录哈希。

## 商店资料与审核入口核验

2026-08-21 完成以下只读核验：

- Google Play 图标为 512 x 512 PNG，Feature Graphic 为 1024 x 500 无 Alpha PNG，6 张手机截图均为 1080 x 1920 PNG；文件已纳入版本控制。
- Google Play 审核 TXT 与 PNG 文件已准备；SHA-256 分别为 `e5fc1600226a514297c128d484e5090ee80bb288439a4812c6f6dce29987467e` 和 `fb741372b11c87ad8f55130b7a4c5aba8b9b4ef6dda2721d93fef9391d14d688`。
- 已使用 V0.5.0 引擎对两份审核文件完成临时发布演练：TXT CID 为 `bafkreihf7qlaaitkkfbjpqji2scokcio5af3fccdtjebfrxw3trjtb2gpy`，PNG CID 为 `bafkreih3oqjxfmi4q6wy6vitbn5eywv2ronu55w5ujzb3e767e4r2fgwra`；两项 holding 均达到 active 且 CID topic join 成功。演练节点随后停止，因此这不作为审核期间在线证明。
- Google Play、App Store 和移动 App 统一使用 `https://most.red/privacy/`、`https://most.red/terms/`、`https://most.red/support/` 作为 canonical 法律与支持入口；2026-08-22 已将 `most.red` 通过 Cloudflare Pages Git 集成部署到生产环境，根页面及三个 canonical 入口均从公网无登录访问并返回 HTTP 200。
- 线上使用条款的生效日期已核验为 2026 年 8 月 21 日，正文已改为适用于实际开放销售地区，并明确中国大陆移动应用分发须在取得所需备案和合规条件后开放；法律页面门禁已关闭。`most.box` 中的旧法律页副本不再作为商店提交依据。
- 当前仓库中的 1080 x 1920 截图是 Google Play 素材，不能替代 App Store 所需的无 Alpha iPhone 截图；iOS 截图仍需在最终候选包上生成并复核。
- 最终 TXT / PNG `most://` 审核链接不提前写死。提交审核前由正式候选版本发布，在另一台设备上完成下载和 CID 校验，并在整个审核期间保持至少一个节点持续做种。

## 外部阻断项

- D-U-N-S 编号尚未下发，Apple Developer 组织账号暂不能完成注册。
- APP 备案不阻塞本轮境外商店首发；负责人于 2026-08-18 确认申请中，但提交平台、提交日期、受理号和回执待归档。中国大陆公开分发以取得备案结果为准，并按要求展示服务备案编号。
- Google Play 组织身份验证状态仍需完成并归档。
- 软件著作权 V0.5.0 已于 2026-08-18 完成在线填报，并于 2026-08-19 完成申请确认签章页上传和在线提交（负责人确认）；流水号为 `2026R11L2802126`，受理状态和回执待平台更新后归档。

## 发布门禁

- [x] 软著源程序鉴别材料和用户操作说明书已生成并逐页复核。
- [x] 软著申请字段、说明书、源程序、营业执照名称和版本交叉核对完成。
- [x] 软著申请确认签章页完成盖章、扫描和上传，在线提交成功，流水号为 `2026R11L2802126`。
- [ ] 软著受理状态和平台回执完成归档。
- [x] 发布负责人确认 V0.5.0 商店首发不选择中国大陆。
- [ ] 公开 GitHub / R2 Android APK 与“境外商店首发”范围的处理方式已确认；需要时从本次 tag 资产中移除 APK。
- [ ] Google Play 组织身份验证、内容分级、数据安全和政策表单完成。
- [ ] Apple Developer 组织账号、正式签名、内部 TestFlight 和候选包复跑完成。
- [x] Google Play AAB 文件哈希和 upload key 证书已归档。
- [ ] Google Play 候选 AAB 文件已找回或重新构建，且实际文件哈希与归档记录一致。
- [ ] iOS Archive/IPA 的文件哈希、正式签名和 TestFlight build ID 已归档。
- [x] Google Play 商店素材和审核文件已核验。
- [x] Canonical 法律/支持页面修正已部署，公网正文与境外商店首发范围一致。
- [ ] 最终审核链接已由正式候选版本发布、跨设备下载校验，并安排审核期间持续做种。
- [x] APP 备案本轮不适用：商店首发排除中国大陆；进入中国大陆分发前必须重新启用并完成该门禁。
- [ ] 发布负责人明确授权创建并推送 `v0.5.0` 标签。

在以上门禁未关闭前，不创建或推送 `v0.5.0` 标签，避免触发 npm、GitHub Release、R2 和安装包的公开发布流水线。
