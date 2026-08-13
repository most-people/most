# MostBox Google Play AAB 审计记录

审计日期：2026-08-13

## 产物身份

| 项目          | 结果                                                               |
| ------------- | ------------------------------------------------------------------ |
| 文件          | `mobile/app/dist/mostbox-android-0.5.0-release.aab`                |
| SHA-256       | `B475E8048E765777EA9225A0C9C207F2E48C0504783B8E3262F8EE686E1DAA4A` |
| 文件大小      | `51,046,057` bytes                                                 |
| applicationId | `most.box`                                                         |
| versionName   | `0.5.0`                                                            |
| versionCode   | `500`                                                              |
| minSdk        | `29`（Android 10）                                                 |
| targetSdk     | `36`（Android 16）                                                 |
| ABI           | `arm64-v8a`                                                        |

## 格式与签名

- Google `bundletool 1.18.3 validate`：通过，退出码 `0`
- `jarsigner -verify`：通过，输出 `jar 已验证`
- 上传证书：`CN=MostBox Play Upload, OU=Mobile, O=Dahai Shenzhen Information Integration Co Ltd, L=Shenzhen, ST=Guangdong, C=CN`
- 上传证书 SHA-256：`A5:DC:61:00:EA:49:CA:AF:36:EF:14:56:9B:F3:AC:A4:B7:3A:04:A3:CD:62:62:15:CF:BD:9E:5D:2D:41:AD:EE`
- 证书有效期：2026-08-06 至 2126-07-13

上传证书是自签名 upload key，这是 Play App Signing 的正常输入。`jarsigner -strict` 会因自签名证书、无时间戳和 AAB ZIP/JAR 读取差异返回警告；Google 官方 `bundletool validate` 已确认 App Bundle 结构有效。

## Android 权限

最终 merged manifest 只包含：

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.WAKE_LOCK`
- 应用自身的 signature 级 `most.box.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

`allowBackup=false`。应用不申请位置、相机、麦克风、通讯录、短信、电话、通知、广告标识或共享存储权限；文件访问通过系统文件选择器和应用私有目录完成。Expo Updates 在 manifest 中为 `ENABLED=false`。

## SDK 与网络行为

- 未发现 Firebase、AdMob、Sentry、Crashlytics、analytics、telemetry 或推送 SDK
- P2P 基础：Hyperswarm、Hyperdrive、Corestore、Bare
- DHT bootstrap：HyperDHT 公共引导节点
- 文件和笔记默认存放于应用私有目录
- 文件只在用户发布或确认下载后传输，并在保存前重新计算 UnixFS CID
- P2P 连接会让对端和网络基础设施处理 IP 地址、连接时间、派生 topic 和连接元数据；开发者不运营文件中转/存储服务器，也不记录这些数据用于分析或画像

## Data Safety 结论

当前构建建议申报“不收集或共享 Google Data Safety 要求披露的用户数据”。理由和变更触发条件见 `docs/google-play-submission.md`。该结论只适用于上述 SHA-256 的 AAB；更换依赖、网络服务或构建产物后必须重新审计。

## 发布前阻断项

- 不要上传 `mostbox-android-0.5.0-release.apk`：该 APK 为 debug 签名，仅用于本地测试
- AAB 上传后仍需查看 Play Console 的 Pre-launch report 和自动权限分析
- 审核前必须从正式版生成两个可用 `most://` 测试链接，并保证至少一个种子在审核期间在线
