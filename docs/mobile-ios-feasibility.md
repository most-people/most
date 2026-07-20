# MostBox iOS 可行性验证计划

本文用于验证 MostBox 的完整前台 P2P 节点能否在真实 iPhone 上成立。iOS 验证通过前，不开始大规模移动端跨平台重构，也不把举报、审核后台等完整商店合规建设作为前置工作。

当前实现状态：iOS Expo 配置、EAS development/preview/production 构建档位、iOS Bare bundle 脚本和平台感知 UI 已加入源码；尚未使用 Apple 签名在真实 iPhone 上完成首次云构建，因此本计划仍处于第 1 阶段。

2026-07-18 Windows 侧预检结果：基于 Expo 57 / React Native 0.86 的 iOS Bare bundle 和 Metro/Hermes production bundle 均已生成；Bare Kit 成功链接 19 个含 `ios-arm64` 真机架构的 addon XCFramework；移动端测试、TypeScript 和 Expo 依赖兼容性检查通过；Android Release APK 回归构建通过。以上结果不能替代 EAS macOS、CocoaPods、Xcode 签名和 iPhone 真机运行验证。

## 决策与成功标准

当前 Android Alpha 已验证前台闭环：桌面发布，Android 下载并校验 CID，Android 继续做种，原发布者退出后新节点仍能完成下载。iOS 下一步不是重新证明协议，而是验证同一套 Bare Worklet、Hyperswarm、Corestore、Hyperdrive 和 UnixFS CID 实现在 Apple 的构建、签名、沙箱、网络与生命周期约束下仍然成立。

iOS 技术验证只有同时满足以下条件才算通过：

- 签名的开发版和 Release 版均可安装到真实 iPhone，不能只在模拟器或 Debug 环境运行。
- Bare Worklet 启动，P2P 核心进入 ready 状态，所需原生 addon 均成功链接。
- iPhone 能加入桌面端频道并双向收发消息。
- iPhone 能凭 `most://` 链接下载文件、重算同一个 UnixFS CID，并写入 holding。
- iPhone 在前台做种时，原桌面发布者退出后，新的干净桌面节点仍能从 iPhone 下载并通过 CID 校验。
- App 重启后恢复 holding，并重新 join 对应 CID topic。
- iOS 文件选择、打开、分享和导出流程使用公开系统 API 正常工作。
- Wi-Fi 和蜂窝网络分别完成至少一次真实发现与传输测试。

验证通过只代表技术路线可继续推进，不代表已经满足 App Store 审核、内容治理、隐私披露或特定地区的法律要求。

## 当前基线与约束

- Android 现有行为是回归基线，iOS 验证不得破坏 `docs/mobile-android-alpha.md` 中的最高验收回归。
- `react-native-bare-kit` 当前依赖包含 iOS Pod、真机 framework 和模拟器 framework，但完整 MostBox 依赖链仍需真机构建验证。
- 当前移动端位于 `mobile/android/`，构建脚本使用 Android preset，Expo 配置只有 Android 包名和权限，保存文件使用 Android Storage Access Framework。
- 本轮保持 `most://`、CID、topic、Hyperdrive key 和下载后自动做种等协议不变量，不为 iOS 引入第二套协议。
- 本轮只承诺 App 在前台时做种。后台测试用于记录系统挂起与恢复行为，不以长期后台常驻为通过条件。
- 验证阶段不先把 `mobile/android/` 改名，也不先抽取推测性的跨平台架构；真机闭环通过后再决定目录和共享模块调整。

## Windows 与 macOS 开发边界

不需要立即把主力电脑换成 macOS。Windows 可以启动本计划，并通过 EAS 的 macOS 云构建生成 iOS 包；但是 Windows 不能提供完整的 iOS 原生开发环境。

| 工作                                           | Windows        | EAS 云构建                   | Mac          |
| ---------------------------------------------- | -------------- | ---------------------------- | ------------ |
| 修改 TypeScript、React Native 和 Bare 业务代码 | 可以           | 不适用                       | 可以         |
| 运行 CID、协议和纯 JS 单元测试                 | 可以           | 可作为 CI 补充               | 可以         |
| 配置 Expo、EAS、bundle identifier 和构建参数   | 可以           | 执行远程构建                 | 可以         |
| 构建签名的 iPhone 开发包或商店包               | 不能本地构建   | 可以                         | 可以         |
| 在真实 iPhone 安装 EAS 开发包或 TestFlight 包  | 可以发起和管理 | 负责构建与签名               | 可以直接调试 |
| 运行 iOS Simulator                             | 不可以         | 云构建不能替代交互式模拟器   | 可以         |
| 运行 Xcode、CocoaPods、本地 `expo run:ios`     | 不可以         | 远程执行构建步骤             | 可以         |
| 调试 Pod、链接器、崩溃、原生线程和 Instruments | 不可以         | 只能查看构建日志和已收集日志 | 可以         |
| 本地 Archive、Validate App 和原生签名诊断      | 不可以         | 可构建并提交                 | 可以         |

对 MostBox 而言，推荐的环境安排是：

1. 继续使用 Windows 完成共享代码、协议测试和 EAS 配置。
2. 使用 EAS 云构建尽快拿到第一份可安装的 iPhone 开发包。
3. 准备一台可用的 Mac 处理 Bare Kit、native addon、Pod、链接器、崩溃和生命周期问题。可以是自有、借用或受控的远程 Mac，不要求先更换主力电脑。
4. 最终发布前在 Mac/Xcode 上至少完成一次真机调试和 Release Archive/Validate App 复核，避免只依赖云构建日志。

从 Windows 通过 EAS 给真实 iPhone 构建开发包，需要 Apple Developer Program 账号完成签名。iOS Simulator 只能在 macOS 上使用，且模拟器不能替代蜂窝网络、系统挂起和真实设备文件流程测试。

## 验证前置条件

- 一台真实 iPhone，开启测试开发包所需的 Developer Mode。
- Apple Developer Program 账号，以及为 MostBox 预留的唯一 iOS bundle identifier。
- Expo/EAS 账号，用于从 Windows 发起 macOS 云构建。
- 一台桌面发布节点和一台使用独立数据目录的桌面 verifier 节点。
- 可切换 Wi-Fi 与蜂窝网络的测试条件。
- 一台可访问的 Mac，最迟在首次原生构建或运行问题无法仅凭 EAS 日志定位时投入使用。

不要在验证前提交正式 App Store 审核。先通过开发包或内部 TestFlight 完成技术闭环。

## 分阶段验证

### 0. 固定 Android 回归基线

执行移动端现有测试，并复跑 Android 前台做种交接：

```bash
cd mobile/android
npm test

cd ../..
node scripts/android-real-p2p-seed.mjs --handoff-check
```

通过标准：保存测试 commit、Android 设备、APK、CID 和交接日志，后续 iOS 调整可与其对照。

### 1. 建立最小 iOS 壳与签名构建

- 增加 iOS bundle identifier、图标、协议 scheme 和必要权限说明。
- 为 Bare bundle 增加 iOS preset 和原生同步步骤，不删除现有 Android 脚本。
- 生成可安装到注册 iPhone 的 EAS development build。
- 生成一次签名的 Release 构建，确认不是只有 Debug 配置能够链接。

通过标准：开发版和 Release 版都完成签名构建，至少开发版能在真实 iPhone 启动并显示应用界面。

### 2. 验证 Bare Worklet 与完整依赖链

- 启动 Bare Worklet，确认 IPC 请求和事件双向可用。
- 初始化 Corestore、Hyperdrive 和 Hyperswarm。
- 验证 iOS 沙箱中的持久数据目录和缓存目录可读写。
- 记录所有 native addon、Pod 和 linker 结果，不用降级协议或跳过 CID 校验来换取启动成功。

通过标准：P2P 核心进入 ready，应用重启后可重新读取本地节点数据，不出现原生链接缺失或启动崩溃。

### 3. 验证频道与真实网络

- iPhone 加入由桌面端创建的私有频道。
- 桌面向 iPhone 发送一条文本消息，iPhone 再回复一条。
- 分别在同一 Wi-Fi、不同网络和 iPhone 蜂窝网络下测试发现与传输。

通过标准：双向消息只通过现有 Channel 协议完成；失败时能区分构建问题、发现问题、NAT/网络问题和生命周期问题。

### 4. 验证 CID 下载与前台做种交接

这是最高优先级场景：

1. 桌面发布一个小型黄金样本文件并输出 `most://` 链接和 CID。
2. iPhone 凭链接下载，重新计算 CID，写入 Hyperdrive 的 `/<cid>`，并记录 holding。
3. 确认 iPhone 已加入 `cid.multihash.digest` 对应 topic，且 App 保持前台。
4. 完全退出原桌面发布者。
5. 使用干净数据目录启动新的桌面 verifier，从 iPhone 下载同一内容。
6. verifier 重算 CID，并确认与原 CID 完全一致。

通过标准：原发布者退出后，verifier 仅依赖前台 iPhone 种子完成下载和校验；iPhone 与 verifier 均记录 active holding 和已 join topic。

### 5. 验证恢复与 iOS 文件流程

- 重启 App，确认 holding 恢复并重新 join CID topic。
- 从 iOS 文件选择器发布文件。
- 将 holding 通过系统分享、打开或导出流程交给其他 App。
- 删除 holding 后确认停止做种，但已导出的副本不被删除；再次使用相同 `most://` 链接能够重新下载。

通过标准：内容身份始终以 CID 判断，显示文件名或导出路径不替代本地内容可读性检查。

### 6. 记录生命周期边界

- 分别测试锁屏、切到后台、系统挂起、网络切换、回到前台和强制结束 App。
- 记录 Worklet、socket、topic、transfer 和 holding 在每个阶段的状态。
- 回到前台后应自动恢复节点状态和 topic；若传输被系统中断，应给出可理解的状态并允许重试。

通过标准：前台能力稳定，恢复行为可重复；产品文案不得宣称 iOS 能长期后台做种。

### 7. TestFlight 发布验证

- 生成签名 Release 构建并上传 App Store Connect。
- 完成自动验证，不存在禁止使用的私有 API、无效签名或缺失架构。
- 通过内部 TestFlight 安装，再复跑频道、CID 下载和前台做种交接。

通过标准：从 TestFlight 安装的实际 Release 包通过最高验收场景。只上传成功但真机闭环失败，不算通过。

## Go / No-Go 条件

满足以下全部条件后，iOS 路线进入 Go：

- 真实 iPhone 上的完整 P2P 核心无需改变 MostBox 协议即可运行。
- TestFlight Release 包完成频道、CID 下载校验、前台做种交接和重启恢复。
- Wi-Fi 与蜂窝网络结果已记录，已知限制可通过产品边界而不是私有 API 或后台规避手段处理。
- 文件选择、分享、导出和沙箱存储使用公开 iOS API。
- 原生依赖的构建方式可重复，不依赖手工修改未记录的 Xcode 工程状态。

出现以下任一情况时暂停完整 iOS 节点路线，评估“iOS 薄客户端连接用户远程节点”：

- Bare Worklet 或核心 native addon 无法为 iPhone Release 架构稳定链接和启动。
- 真实网络中的发现或传输持续失败，且不能在现有协议边界内解决。
- 产品成立必须依赖 iOS 不允许的长期后台执行或私有 API。
- 只有 Debug/模拟器构建可运行，签名 Release 或 TestFlight 包无法完成闭环。

No-Go 不是放弃 iOS App，而是将 iOS App 限定为连接用户自有远程节点的前端，完整做种继续由桌面端、NAS 或 Android 节点承担。

## 验证产物

每轮验证至少保留：

- Git commit、移动端版本、EAS build ID、iOS 构建 profile 和 TestFlight build number。
- iPhone 型号、iOS 版本、网络环境和是否使用蜂窝网络。
- 测试文件大小、CID、`most://` 链接和 verifier 的 `verifiedCid`。
- Worklet ready、topic joined、下载完成、CID 校验、holding 恢复和发布者退出的日志摘要。
- 失败所属层级：JS/IPC、native addon、Pod/linker、签名、文件系统、P2P 发现、传输或生命周期。

单轮记录模板：

```text
日期:
测试人:
MostBox commit:
iPhone 型号:
iOS 版本:
Apple Developer Team:
iOS bundle identifier:
EAS build ID:
构建 profile:
构建类型: development / release / TestFlight
网络环境: Wi-Fi / 蜂窝 / 跨网络
测试文件大小:
CID:
most:// 链接:
Worklet ready:
频道双向消息:
iPhone 下载并校验:
iPhone holding 状态:
iPhone topic join 状态:
原桌面发布者已退出:
verifier verifiedCid:
重启恢复:
文件选择/分享/导出:
后台与前台恢复结果:
结果: 通过 / 失败
失败层级:
日志摘要:
备注:
```

## 官方资料

- [Expo：使用 EAS 创建构建](https://docs.expo.dev/build/setup/)
- [Expo：从非 macOS 平台创建 iPhone development build](https://docs.expo.dev/develop/development-builds/create-a-build/)
- [Expo：iOS 云构建在远程 macOS VM 上执行](https://docs.expo.dev/build-reference/ios-builds/)
- [Expo：iOS Simulator 只能安装在 macOS](https://docs.expo.dev/workflow/ios-simulator/)
- [Apple：Xcode 支持与 macOS 要求](https://developer.apple.com/support/xcode/)
- [Apple：TestFlight 与 App Store 发布](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)
- [Bare：在 React Native/Expo 中嵌入 Bare Worklet](https://docs.pears.com/explanation/bare-on-native/)
