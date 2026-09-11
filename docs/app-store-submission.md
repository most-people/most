# MostBox App Store 提交清单

本清单适用于不含聊天、账号、广告、付费、Web3、公开内容目录和长期后台做种的 iOS 商店版。真机技术验收仍以 `docs/mobile-ios-feasibility.md` 为准。

iOS 原生入口只创建本机 Bare Worklet 节点，不包含远程 daemon、邀请码或登录界面。`app.most.box` 的 Expo Web 远程控制台是独立 Web 构建，不进入 IPA。

## 本次首发决定（2026-09-10）

- 使用负责人本人的个人 Apple Developer 账号，会员尚未开通；个人注册不需要 D-U-N-S 编号。
- iOS 先在中国大陆以外发行，不选择中国大陆；具体国家和地区名单待确定，不能将本决定理解为已经选择所有海外地区。
- 先准备 `en-US` 商店材料，保留简体中文文案；商店本地化语言与发行国家和地区分别设置。
- 保持免费、无 App 内购买，并采用手动发布。会员激活、正式签名、TestFlight 验收和 App Review 通过后才能公开。

### 个人会员开通

负责人在同一台 iPhone 上使用 Apple Developer App，进入“账户 → 现在注册”，使用已开启双重认证的 Apple 账户，按提示填写真实姓名、身份证信息、联系方式和地址，完成自拍身份验证，实体类型选择“个人”。随后阅读协议并完成会员购买。中国大陆官方页面当前列示每年 ¥688、自动续订，以实际购买页为准。

个人法定姓名会显示为 App Store 供应商，App 名称仍可填写 `MostBox`。注册完成后记录会员激活状态和 Team ID；签名所用 Team 必须是该已激活会员的 Team。

个人作为商店卖方时，仍需确认其拥有或获得 App 发行权，以及法律页面披露的实际运营方、隐私责任方和联系方式是否准确。现有法律页面列示公司运营，不能仅因改用个人会员就擅自替换为个人。

官方依据：[个人注册流程](https://developer.apple.com/cn/help/account/membership/enrolling-in-the-app/)、[D-U-N-S 要求](https://developer.apple.com/help/account/membership/D-U-N-S/)、[发行地区设置](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-for-your-app-on-the-app-store/)。

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

- 2026-09-10 在 Windows 上运行 `npm run preflight:ios` 通过，生成 iOS Bare bundle，并校验当前 `0.5.2 (502)`、`most.box` 和 App Store 配置；本机没有 iOS 原生工程，本次检查不包含 Xcode、签名或真机执行。
- 既有验收记录中，移动端测试、TypeScript 和 iOS Bare bundle 已通过；本次预检不代表重新完成这些历史版本的全部验收。
- iPhone 17 / 17 Pro Max 模拟器 Release 可独立启动，节点进入在线状态，`most://` scheme 可被系统识别。
- 2026-08-14 使用 Xcode 26.5 对 `0.5.0 (500)` 生成无签名 Release Archive 成功；Archive 中 Bundle ID 为 `most.box`，最低系统为 iOS 16.4，设备范围仅 iPhone，主程序和 Bare Kit 原生依赖均为 arm64，并已完成 `-validate-for-store`。
- Archive 已包含应用主隐私清单和依赖隐私清单；应用主清单声明不跟踪、不收集数据，并包含当前使用的 Required Reason API 声明。
- 负责人于 2026-08-15 确认真实 iPhone 功能和 P2P 传播闭环已通过；设备型号、iOS 版本、候选包来源和原始记录待归档。
- 尚未完成 Apple 正式签名、内部 TestFlight 上传，以及从 TestFlight 安装同一候选包后的复跑验收；完成前不得提交正式审核。

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

### 英文商店文案（en-US）

应用名称（7 / 30 字符）：

> MostBox

副标题（30 / 30 字符）：

> P2P File Sharing, CID Verified

推广文本（167 / 170 字符）：

> Share files with most:// links, verify each download by CID, and help others download while MostBox stays open. Keep Markdown notes and file references on your device.

完整说明：

```text
Share files directly between online peers with MostBox.

Choose a file to create a most:// share link. The recipient opens the link, confirms the download, and receives the file from an online peer. MostBox recalculates the file's UnixFS content identifier (CID) and saves the file only if it matches the link.

Keep files available
After publishing or completing a verified download, your device automatically seeds the file while MostBox is in the foreground. Even if the original sender leaves, another online peer with a complete copy can continue sharing it.

Organize local notes
Create and organize Markdown notes in a knowledge base stored on your device. Keep most:// file references alongside your notes, and export your notes or knowledge base when needed.

Stay in control
View your local files, transfers, and node status. Each download requires your confirmation. No account is required.

Availability depends on online peers. MostBox does not provide cloud storage or guaranteed permanent access. Keep your own copies of important files. Share and download only content you have the right to use, and remember that anyone with a share link can attempt to download its file.

On iPhone, keep MostBox open in the foreground for transfers and seeding.
```

关键词（70 / 100 字节）：

> p2p,transfer,sharing,cid,integrity,peer,markdown,notes,local,documents

## App Store Connect 字段

| 项目             | 当前建议或状态                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| 隐私政策         | `https://most.red/privacy/`                                                                               |
| 使用条款         | `https://most.red/terms/`，App 内可访问                                                                   |
| 支持 URL         | `https://most.red/support/`；提交前确认满足所选地区的联系信息要求                                         |
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

> On first launch, MostBox displays its Privacy Policy and Terms of Use. The P2P core starts only after the reviewer taps Accept and Continue. MostBox is a user-initiated peer-to-peer file transfer utility. It has no public content catalog, account, chat, ads, payments, or background seeding service. Opening a most:// link only presents a confirmation screen; no download starts until the reviewer confirms it. Every completed download is recalculated and verified against its UnixFS CID before it is stored. The app blocks known application packages, scripts, and executable file types declared by the selected file or link. Seeding is only promised while the app is in the foreground.

提交审核时补充两个无版权争议且持续在线的测试种子：一个小型 TXT 文件和一个 PNG 文件。备注中写明每条 `most://` 链接、预期文件名、CID 和操作步骤；审核完成前保持至少一个对应种子在线。

## 截图与图标

- App 图标使用 `mobile/app/assets/icon.png`，1024 x 1024，不带透明通道。
- iPhone 6.9 英寸主截图使用 Apple 接受的尺寸，当前模拟器可生成 1320 x 2868 竖屏图。
- App Store 截图不能带 Alpha 通道；模拟器原始 PNG 提交前必须转换为无透明通道的 PNG 或 JPEG。
- 至少准备隐私同意页、文件首页、下载确认、CID 校验完成、知识库和节点/传输状态画面。
- 截图和文案不得宣称长期后台做种、永久存储、公开内容目录或其他当前 iOS 包中不存在的能力。
- 静态检查确认 IPA 不包含远程节点连接页、邀请码或登录入口。

## 发布顺序

1. 配置 Apple Developer Team、证书、Bundle ID 和 provisioning profile，生成可安装的签名 Development 包。
2. 在真实 iPhone 上完成隐私同意、Wi-Fi、蜂窝网络、P2P Ping、CID 下载、前台做种交接、重启恢复和文件选择/分享/导出验收。
3. 创建签名 Release Archive，执行 Validate App 并上传内部 TestFlight。
4. 从 TestFlight 安装实际 Release 包，重复最高优先级 P2P 闭环。
5. 审计最终包依赖、隐私清单和网络流量，完成 App Privacy、出口合规、年龄分级、内容权利、DSA 和销售地区选择。
6. 上传无透明通道的 iPhone 截图，填写本清单中的商店文案、审核联系人、审核说明和在线测试链接。
7. 首发选择手动发布；审核通过并完成最终烟雾测试后再公开。
