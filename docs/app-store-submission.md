# MostBox App Store 提交清单

本清单适用于不含聊天、账号、广告、付费、Web3、公开内容目录和长期后台做种的 iOS 商店版。真机技术验收仍以 `docs/mobile-ios-feasibility.md` 为准。

## 构建基线

- Bundle ID：`most.box`
- 版本：与根包、`mobile/app/package.json` 和 `mobile/app/app.json` 一致
- Build number：`mobile/app/app.json` 中的 `ios.buildNumber`，当前从版本号基线开始，例如 `0.4.9` 从 `409` 开始；每次上传前手动递增，且必须大于 App Store Connect 中已有构建，不依赖 EAS 隐式自增
- 最低版本：iOS 16.4
- 设备范围：仅 iPhone
- 正式产物：使用 Xcode 26 或更高版本以及 iOS 26 SDK 构建的签名 Archive / IPA
- 原生工程：`mobile/app/ios/` 是 Expo prebuild 生成物；版本、Bundle ID、权限和隐私清单以受版本控制的 `mobile/app/app.json` 为准

提交候选包前从干净配置重新生成并构建：

```bash
cd mobile/app
npm install
npm run preflight:ios
npx expo prebuild --platform ios --clean --no-install
(cd ios && pod install)
npx expo run:ios --configuration Release
```

`npm run preflight:ios` 是提交候选包的仓库配置门禁，覆盖版本、Build number、Bundle ID、iPhone 设备范围、最低系统版本、隐私清单、App Store EAS profile 和图标。Apple 签名、Archive Validate、TestFlight 安装和真机 P2P 闭环仍必须在最终候选包上单独完成。

## 当前验证状态

- 移动端测试、TypeScript 和 iOS Bare bundle 已通过。
- iPhone 17 / 17 Pro Max 模拟器 Release 可独立启动，节点进入在线状态，`most://` scheme 可被系统识别。
- 2026-08-14 使用 Xcode 26.5 对 `0.5.0 (500)` 生成无签名 Release Archive 成功；Archive 中 Bundle ID 为 `most.box`，最低系统为 iOS 16.4，设备范围仅 iPhone，主程序和 Bare Kit 原生依赖均为 arm64，并已完成 `-validate-for-store`。
- Archive 已包含应用主隐私清单和依赖隐私清单；应用主清单声明不跟踪、不收集数据，并包含当前使用的 Required Reason API 声明。
- 尚未完成 Apple 签名、真实 iPhone 运行和内部 TestFlight 验收；完成前不得提交正式审核。

## 商店文案

应用名称：`MostBox`

副标题（30 字以内）：

> P2P 文件传输与 CID 校验

推广文本（170 字以内）：

> 通过 most:// 链接直接传输文件，下载完成后重算 CID 校验，并在应用前台继续做种。

完整说明：

> MostBox 是一个 CID 优先的 P2P 文件传输工具。选择文件即可生成 most:// 分享链接；接收方确认链接后，从在线节点下载文件并重新计算 CID，校验通过后保存到本机。
>
> 下载完成的设备会在应用前台继续做种。原发布者离线后，只要仍有其他种子在线，文件仍可继续传播。
>
> 应用还提供保存在本机的 Markdown 知识库，用于整理笔记和 most:// 附件引用。
>
> MostBox 不提供云端存储、永久可用性、公开内容目录、账号或付费服务。请自行保管重要文件，只接收你信任且有权下载的内容。

关键词（100 字节以内，提交时按 App Store Connect 实际计数复核）：

> P2P,文件传输,CID,点对点,知识库,Markdown,完整性校验

建议主分类：`工具`。

## App Store Connect 字段

| 项目             | 当前建议或状态                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| 隐私政策         | `https://most.box/privacy/`                                                                               |
| 使用条款         | `https://most.box/terms/`，App 内可访问                                                                   |
| 支持 URL         | `https://github.com/most-people/most/issues`；提交前确认满足所选地区的联系信息要求                        |
| 登录             | 无账号、无受限入口，不需要审核账号                                                                        |
| 广告与跟踪       | 不包含广告或跟踪                                                                                          |
| App Privacy      | 初步为开发者不收集数据；必须按最终 Release 网络流量和全部第三方依赖复核后填写                             |
| 内容权利         | 应用不提供公共内容目录；用户只能传输自己有权处理的文件                                                    |
| 年龄分级         | 不面向儿童；按最新问卷如实申报用户文件交换、网络访问和其他能力                                            |
| 加密出口合规     | Hyperswarm 使用标准 Noise 加密；必须完成 App Store Connect 出口合规问卷后再决定是否在 Info.plist 固定答案 |
| 中国大陆         | 未取得所需备案或专项合规前不选择中国大陆销售范围                                                          |
| DSA / 交易者状态 | 由 Apple Developer 账号主体按真实身份填写                                                                 |
| 价格             | 免费，无 App 内购买                                                                                       |

## 审核说明

可在 App Review Notes 中填写：

> On first launch, MostBox displays its Privacy Policy and Terms of Use. The P2P core starts only after the reviewer taps Accept and Continue. MostBox is a user-initiated peer-to-peer file transfer utility. It has no public content catalog, account, chat, ads, payments, or background seeding service. Opening a most:// link only presents a confirmation screen; no download starts until the reviewer confirms it. Every completed download is recalculated and verified against its UnixFS CID before it is stored. The app requires an explicit filename and blocks known application packages, scripts, and executable file types declared by the selected file or link. Seeding is only promised while the app is in the foreground.

提交审核时补充两个无版权争议且持续在线的测试种子：一个小型 TXT 文件和一个 PNG 文件。备注中写明每条 `most://` 链接、预期文件名、CID 和操作步骤；审核完成前保持至少一个对应种子在线。

## 截图与图标

- App 图标使用 `mobile/app/assets/icon.png`，1024 x 1024，不带透明通道。
- iPhone 6.9 英寸主截图使用 Apple 接受的尺寸，当前模拟器可生成 1320 x 2868 竖屏图。
- App Store 截图不能带 Alpha 通道；模拟器原始 PNG 提交前必须转换为无透明通道的 PNG 或 JPEG。
- 至少准备隐私同意页、文件首页、下载确认、CID 校验完成、知识库和节点/传输状态画面。
- 截图和文案不得宣称长期后台做种、永久存储、公开内容目录或其他当前 iOS 包中不存在的能力。

## 发布顺序

1. 配置 Apple Developer Team、证书、Bundle ID 和 provisioning profile，生成可安装的签名 Development 包。
2. 在真实 iPhone 上完成隐私同意、Wi-Fi、蜂窝网络、P2P Ping、CID 下载、前台做种交接、重启恢复和文件选择/分享/导出验收。
3. 创建签名 Release Archive，执行 Validate App 并上传内部 TestFlight。
4. 从 TestFlight 安装实际 Release 包，重复最高优先级 P2P 闭环。
5. 审计最终包依赖、隐私清单和网络流量，完成 App Privacy、出口合规、年龄分级、内容权利、DSA 和销售地区选择。
6. 上传无透明通道的 iPhone 截图，填写本清单中的商店文案、审核联系人、审核说明和在线测试链接。
7. 首发选择手动发布；审核通过并完成最终烟雾测试后再公开。
