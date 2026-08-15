# MostBox V0.5.0 封版验证档案

记录日期：2026-08-15

最后更新：2026-08-16

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

已归档 Google Play AAB SHA-256：`B475E8048E765777EA9225A0C9C207F2E48C0504783B8E3262F8EE686E1DAA4A`。本地同名 Release APK 是调试签名，仅供测试，不能作为中国应用商店或 APP 备案候选包。

iPhone 型号和系统版本可在“设置 > 通用 > 关于本机”查看；连接 Mac 后也可在 Xcode 的“Window > Devices and Simulators”中复制设备型号、系统版本和设备标识。TestFlight build ID 需在 App Store Connect 的 TestFlight 页面取得；D-U-N-S、Apple Developer 组织账号和首个 TestFlight build 尚未完成前，该 ID 不存在。最终 IPA 可在 Mac 上运行 `shasum -a 256 '<ipa-path>'` 记录哈希。

## 外部阻断项

- D-U-N-S 编号尚未下发，Apple Developer 组织账号暂不能完成注册。
- APP 备案尚未启动；中国大陆公开分发前必须完成备案，并按要求展示服务备案编号。
- Google Play 组织身份验证状态仍需完成并归档。
- 软件著作权 V0.5.0 已由负责人于 2026-08-16 确认为未发表；首次发表日期和地点不适用。

## 发布门禁

- [x] 软著源程序鉴别材料和用户操作说明书已生成并逐页复核。
- [ ] 软著申请字段、说明书、源程序、营业执照名称和版本交叉核对完成。
- [ ] APP 备案已提交并保存受理回执；中国大陆分发以取得备案结果为准。
- [ ] Google Play 组织身份验证、内容分级、数据安全和政策表单完成。
- [ ] Apple Developer 组织账号、正式签名、内部 TestFlight 和候选包复跑完成。
- [x] Google Play AAB 文件哈希和 upload key 证书已归档。
- [ ] 中国大陆实际分发 APK 的文件哈希、公钥和证书指纹已归档。
- [ ] iOS Archive/IPA 的文件哈希、正式签名和 TestFlight build ID 已归档。
- [ ] 发布负责人确认销售地区；备案完成前不选择中国大陆。
- [ ] 发布负责人明确授权创建并推送 `v0.5.0` 标签。

在以上门禁未关闭前，不创建或推送 `v0.5.0` 标签，避免触发 npm、GitHub Release、R2 和安装包的公开发布流水线。
