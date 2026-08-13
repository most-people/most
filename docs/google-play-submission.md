# MostBox Google Play 提交清单

> 已审计产物基线：2026-08-13；Android `0.5.0`（versionCode `500`）。
> 本文中的公司主体信息只用于 Google Play 账号核验、法律页面和审核材料，**不要求在 `most.box` 官网公开展示企业归属**。

本清单适用于不含聊天、账号、广告、付费、Web3 和长期后台做种的 Android 商店版。

## 构建基线

- 包名：`most.box`
- 版本名：与根包和 `mobile/app/package.json` 一致
- 版本码：`mobile/app/app.json` 中的 `android.versionCode`，由版本号按 `major * 10000 + minor * 100 + patch` 同步（例如 `0.4.8` 对应 `408`），每次上传必须递增
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

> 本地整理知识与文件，通过 most:// 链接传输并完成 CID 校验。

完整说明：

> MostBox 是一个本地知识库和 CID 优先的 P2P 文件传输工具。无需注册即可在本机创建、编辑、搜索、导入、导出和备份 Markdown 笔记；知识库默认只保存在本机。
>
> 选择文件即可生成 most:// 分享链接；接收方确认链接后，从在线节点下载文件并重新计算 CID，校验通过后保存到本机。
>
> 下载完成的设备会在应用前台继续做种。原发布者离线后，只要仍有其他种子在线，文件仍可继续传播。
>
> MostBox 不提供云端存储、永久可用性、公开内容目录、账号或付费服务。请自行保管重要文件，只接收你信任且有权下载的内容。

建议分类：`工具`。

## App content 建议答案

提交前必须按最终 AAB 和实际运营方式复核，不要直接照抄未验证答案。

| 项目               | 当前商店版建议                                          |
| ------------------ | ------------------------------------------------------- |
| 隐私政策           | `https://most.red/privacy/`                             |
| 广告               | 不包含广告                                              |
| App access         | 无登录、无受限入口，不需要审核账号                      |
| Target audience    | 18 岁及以上；不以儿童为目标用户                         |
| Content rating     | 工具；包含用户主动的文件交换，不包含聊天或公共 UGC 浏览 |
| News app           | 否                                                      |
| COVID-19 / health  | 否                                                      |
| Financial features | 否                                                      |
| Government         | 否                                                      |
| Account deletion   | 不适用，应用不创建账号                                  |

### 可直接照填的顺序

1. **Privacy policy**：`https://most.red/privacy/`
2. **Ads**：`No, my app does not contain ads`
3. **App access**：`All functionality is available without special access`
4. **Target audience**：只选择 `18 and over`；应用不面向儿童
5. **News apps**：`No`
6. **COVID-19 contact tracing or status apps**：`No`
7. **Data safety**：按下方“Data Safety 最终建议”填写
8. **Content rating**：选择工具/生产力类应用；按实际情况回答无暴力、色情、赌博、毒品、粗俗语言、恐怖内容。应用没有公开内容目录、聊天或用户资料流，但允许用户主动选择并通过链接传输文件；若问卷询问用户交换数字内容，应如实选择对应选项
9. **Financial features**：`No financial features`
10. **Health apps**：`Not a health app`
11. **Government apps**：`No`

### 开发者账号与商店联系方式

- Public developer name：`MostBox`
- Organization website：`https://most.box/`
- Google 联系邮箱：`developer@most.box`
- 商店支持邮箱：`developer@most.box`
- 应用网站：`https://most.red/`
- 隐私政策：`https://most.red/privacy/`
- 用户支持：`https://most.red/support/`

`developer@most.box` 已满足“组织关联邮箱”的用途。Google 要求组织账号提供组织网站和公开开发者联系方式，但不要求在该网站首页展示公司法定名称；组织法定名称、地址和 D-U-N-S 信息仍以 Google Payments / D&B 核验资料为准。

## Data Safety 最终建议

当前代码不包含账号、广告、分析、崩溃上报、推送或中心化文件服务器。本机笔记、知识库备份、文件、CID、holding 和日志保存在设备内；文件只在用户明确发布或确认下载时通过加密 P2P 连接传输。P2P 节点和 DHT 基础设施会处理建立连接所需的 IP 地址、连接时间、派生 topic 和网络元数据；这些行为已在首次启动同意页和隐私政策中披露。

按 2026-08-13 的代码与 AAB 审计结果，建议填写：

| Data safety 问题                                                      | 答案                                           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| Does your app collect or share any of the required user data types?   | `No`                                           |
| Is all of the user data collected by your app encrypted in transit?   | 不出现；仅在声明收集数据后出现                 |
| Do you provide a way for users to request that their data is deleted? | 不适用；应用不创建账号且不由开发者保存用户数据 |

依据是：本机处理不属于收集；文件传输由用户明确发起且通过 Hyperswarm/Noise 加密的节点连接完成，开发者无法读取或保存传输内容；用户主动向其指定接收方传输也属于 Google 的 sharing 例外。IP 和临时连接元数据不被开发者记录、用于定位、广告、分析或用户画像。若后续加入 analytics、crash reporting、推送、账号、中心化服务，或运营方开始保存 IP/连接日志，必须重新填写 Data Safety 并同步更新隐私政策。

本轮已完成 `0.5.0` release AAB 的依赖、manifest、签名和静态网络行为审计，记录见 `docs/google-play-aab-audit.md`。只要增加 analytics、crash reporting、推送、账号或中心服务，就必须重填 Data Safety 并同步更新隐私政策。

## 审核说明

可在审核备注中说明：

> MostBox is a user-initiated peer-to-peer file transfer utility. It has no public content catalog, account, chat, ads, payments, or background seeding service. Opening a most:// link only presents a confirmation screen; no download starts until the reviewer taps Confirm Download. Every completed download is recalculated and verified against its UnixFS CID before it is stored. The Play build requires an explicit filename and blocks known application packages, scripts, and executable file types declared by the selected file or link.

首次启动时，应用会先展示隐私政策和使用条款；只有审核人员点击“同意并继续”并成功保存同意记录后，应用才创建并启动 P2P 核心。拒绝时不会启动 P2P 网络。

为审核人员准备两个在线种子链接：一个小型 TXT 文件和一个 PNG 文件。审核期间必须保证至少一个对应种子在线；不要提供私密或版权不明的测试文件。

## 图像资产

- Play 图标：`mobile/app/store-assets/app-icon-512.png`，512 × 512 RGBA PNG
- Feature graphic：`mobile/app/store-assets/feature-graphic-1024x500.png`，1024 × 500 RGB PNG，不带透明通道
- 手机截图：`mobile/app/store-assets/screenshots/` 中 6 张 1080 × 1920 PNG
- 截图内容：文件列表、下载确认、传输记录、知识库列表、知识库笔记详情、节点状态
- 商店素材不得出现聊天、Web3、后台常驻或其他当前 AAB 中不存在的能力

建议上传顺序：

1. `files.png`
2. `download-confirmation.png`
3. `transfers.png`
4. `knowledge-list.png`
5. `knowledge-note.png`
6. `node.png`

## 审核测试材料

- TXT 测试文件：`mobile/app/store-assets/reviewer-files/mostbox-review.txt`
- PNG 测试文件：`mobile/app/store-assets/app-icon-512.png`
- 审核备注无需账号或密码
- 两个 `most://` 链接必须在提交审核前由同一正式版本发布并记录；审核期间至少保持一个对应种子在线
- 链接和在线种子是有时效的运行状态，不能提前写死在仓库。上线前将最终链接填入 Play Console 的审核说明，并实测另一台设备能下载且 CID 校验通过

## 发布顺序

1. 验证 `https://most.red/privacy/`、`https://most.red/terms/` 和 `https://most.red/support/` 可从公网无登录访问。
2. 创建 Play 应用并启用 Play App Signing。
3. 先上传 Internal testing，检查 Pre-launch report、权限和设备兼容性。
4. 完成 Data Safety、内容分级、目标受众、商店页和审核说明。
5. 若是 2023-11-13 后创建的个人开发者账号，运行至少 12 名测试者连续 14 天的 closed test，再申请 production access。
6. production 首发采用小比例 staged rollout，观察崩溃、ANR 和下载成功率后再扩大。

## 只需账号所有者本人完成

当前 Play Console 停留在“为某组织创建开发者账号所需提供的信息”页面。以下动作涉及身份、验证码、付款或法律确认，只由账号所有者完成：

1. 等待 D&B 返回九位 D-U-N-S 编码；Google 提示申请流程最长可能需要 28 天
2. 使用 D-U-N-S 编码和正式企业文件完成组织核验；企业文件名称必须与 D&B 档案一致
3. 验证 Google 私下联系用邮箱/电话，以及 Play 商店公开展示的开发者邮箱/电话
4. 支付一次性 25 美元注册费
5. 审阅并确认最终账号资料、Data Safety 和发布声明

除上述身份、验证码、付款和最终确认外，文案、素材、AAB 审计与审核说明由项目资料承担，不需要把企业归属增加到 `most.box` 首页。
