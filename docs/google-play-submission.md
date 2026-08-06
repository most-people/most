# MostBox Google Play 提交清单

本清单适用于不含聊天、账号、广告、付费、Web3 和长期后台做种的 Android 商店版。

## 构建基线

- 包名：`most.box`
- 版本名：与根包和 `mobile/app/package.json` 一致
- 版本码：`mobile/app/app.json` 中的 `android.versionCode`，由版本号按 `major * 10000 + minor * 100 + patch` 同步（例如 `0.4.7` 对应 `407`），每次上传必须递增
- 最低版本：Android 10 / API 29
- 目标版本：Android 16 / API 36
- 正式产物：Android App Bundle（`.aab`），当前只分发 `arm64-v8a`
- Play App Signing：在 Play Console 选择使用现有 App Signing Key，由 Google 托管其受保护副本；本机永久保管原始 App Signing Key，并用独立 Play Upload Key 签署上传的 AAB

本地构建正式 AAB 前设置以下环境变量；脚本不接受 debug key：

```powershell
$env:MOSTBOX_ANDROID_KEYSTORE='C:\secure\mostbox-upload.jks'
$env:MOSTBOX_ANDROID_KEYSTORE_PASSWORD='<keystore password>'
$env:MOSTBOX_ANDROID_KEY_ALIAS='mostbox-upload'
$env:MOSTBOX_ANDROID_KEY_PASSWORD='<key password>'
npm run build:play
```

也可以使用 EAS 的 `android-production` profile 生成由 EAS 凭据系统签名的 App Bundle：

```bash
eas build --platform android --profile android-production
```

## 商店文案

应用名称：`MostBox`

简短说明（80 字以内）：

> 通过 most:// 链接直接传输文件，完成 CID 校验后在前台继续做种。

完整说明：

> MostBox 是一个 CID 优先的 P2P 文件传输工具。选择文件即可生成 most:// 分享链接；接收方确认链接后，从在线节点下载文件并重新计算 CID，校验通过后保存到本机。
>
> 下载完成的设备会在应用前台继续做种。原发布者离线后，只要仍有其他种子在线，文件仍可继续传播。
>
> MostBox 不提供云端存储、永久可用性、公开内容目录、账号或付费服务。请自行保管重要文件，只接收你信任且有权下载的内容。

建议分类：`工具`。

## App content 建议答案

提交前必须按最终 AAB 和实际运营方式复核，不要直接照抄未验证答案。

| 项目               | 当前商店版建议                                          |
| ------------------ | ------------------------------------------------------- |
| 隐私政策           | `https://most.box/privacy/`                             |
| 广告               | 不包含广告                                              |
| App access         | 无登录、无受限入口，不需要审核账号                      |
| Target audience    | 18 岁及以上；不以儿童为目标用户                         |
| Content rating     | 工具；包含用户主动的文件交换，不包含聊天或公共 UGC 浏览 |
| News app           | 否                                                      |
| COVID-19 / health  | 否                                                      |
| Financial features | 否                                                      |
| Government         | 否                                                      |
| Account deletion   | 不适用，应用不创建账号                                  |

## Data Safety 预审结论

当前代码不包含账号、广告、分析、崩溃上报或中心化文件服务器。本机文件、CID、holding 和日志保存在设备内；文件只在用户明确发布或确认下载时通过加密 P2P 连接传输。根据 Google 对用户主动传输和端到端加密数据的例外，初步答案可为“不收集或共享 Google Data Safety 表中要求披露的数据”。

正式提交前仍需完成一次 release AAB 的依赖和网络流量审计，确认 Expo、Bare、Hyperswarm 及其 bootstrap/DHT 行为没有把设备标识、诊断信息或其他用户数据发送给开发者或第三方服务。只要增加 analytics、crash reporting、推送、账号或中心服务，就必须重填 Data Safety 并同步更新隐私政策。

## 审核说明

可在审核备注中说明：

> MostBox is a user-initiated peer-to-peer file transfer utility. It has no public content catalog, account, chat, ads, payments, or background seeding service. Opening a most:// link only presents a confirmation screen; no download starts until the reviewer taps Confirm Download. Every completed download is recalculated and verified against its UnixFS CID before it is stored. The Play build requires an explicit filename and blocks known application packages, scripts, and executable file types declared by the selected file or link.

为审核人员准备两个在线种子链接：一个小型 TXT 文件和一个 PNG 文件。审核期间必须保证至少一个对应种子在线；不要提供私密或版权不明的测试文件。

## 图像资产

- Play 图标：`mobile/app/store-assets/app-icon-512.png`，512 × 512 RGBA PNG
- Feature graphic：`mobile/app/store-assets/feature-graphic-1024x500.png`，1024 × 500 RGB PNG，不带透明通道
- 手机截图：`mobile/app/store-assets/screenshots/` 中 4 张 1080 × 1920 PNG
- 截图内容：文件列表、下载确认、CID 校验完成、节点/传输状态
- 商店素材不得出现聊天、Web3、后台常驻或其他当前 AAB 中不存在的能力

## 发布顺序

1. 验证隐私政策和使用条款公网可访问。
2. 创建 Play 应用并启用 Play App Signing。
3. 先上传 Internal testing，检查 Pre-launch report、权限和设备兼容性。
4. 完成 Data Safety、内容分级、目标受众、商店页和审核说明。
5. 若是 2023-11-13 后创建的个人开发者账号，运行至少 12 名测试者连续 14 天的 closed test，再申请 production access。
6. production 首发采用小比例 staged rollout，观察崩溃、ANR 和下载成功率后再扩大。
