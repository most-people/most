# MostBox iOS 开发验收

当前目标是在真实 iPhone 上验证全功能版。iOS 与 Android 共享 `app/` 的 React Native 界面和 Bare Worklet 核心；本机与远程节点按当前产品能力验收，不再沿用旧“iOS 仅本机、无登录入口”的商店限制。

开发顺序见[开发与发行路线](roadmap.md)，已有构建和历史真机证据见[验证状态](validation-status.md)。模拟器、bundle 与配置预检不能代替当前签名真机包的验证，技术通过也不等于 App Store 审核通过。

## 环境与构建

Windows 可修改共享代码、跑 JS 测试和生成 iOS Bare bundle；本地 Xcode、CocoaPods、模拟器和原生诊断需要 macOS。EAS 是现有云构建入口，使用时仍需具备相应 Apple 签名与设备授权。

在 `app/` 先运行：

```bash
npm test
npm run typecheck
npm run bundle:ios
npm run preflight:ios
```

`preflight:ios` 会生成 bundle、同步原生版本并检查配置，不证明签名、真机或审核完成。在 macOS 按工程实际状态安装 Pods、运行开发包并构建 Release；生成原生工程时先保留本地改动，不盲目使用 `prebuild --clean`。

版本、最低系统、设备范围、Bundle ID 与权限以 `app/app.json`、`app/app.config.js` 和最终签名包为准。当前全功能 profile 的 Bundle ID 是 `most.box`；两个商店版的配置在适配阶段单独核对。

## 真机通过标准

1. 签名开发包和 Release 包均能安装到真实 iPhone，Bare Worklet 与原生 addon 启动，核心进入 ready。
2. 两端完成真实发现与 P2P Ping；Wi-Fi 与蜂窝分别测，不能以模拟器 NAT 或仅 UI 在线代替。
3. iPhone 凭 `most://` 链接先确认再下载；完成后重算 UnixFS CID，只有一致才保存和做种。
4. 原发布者退出后，保持 iPhone 前台，新的空节点从 iPhone 取得完整文件并通过 CID；重启后再次验证 holdings 与 topic 恢复。
5. 频道创建/加入、历史、文本、照片与语音附件、草稿和失败重试完整可用；远程节点登录、切换和断线恢复不破坏本机数据。
6. 文件选择、系统打开、分享、导出与取消正常；权限拒绝、空间不足、同名输出及损坏数据不误报成功。
7. 实时通话以双真机实际音频为准，覆盖麦克风授权、静音、音频路由、挂断释放和切网，不把现有信令当作完成。
8. 记录挂起、锁屏、系统清理和回到前台的真实行为，确保任务状态与完整副本可恢复；不承诺 iPhone 长期后台做种。

CID、topic、Hyperdrive `/<cid>`、完整副本和下载后做种保持与桌面/Android 一致。平台适配不引入另一套文件协议，不破坏 [Android 回归](mobile-android-alpha.md)。

## 候选包记录

保存 Git 提交、构建方式、包哈希、签名 Team 与 Bundle ID、版本/Build number、iPhone 型号和系统、网络、CID、接力结果及原生日志。不得把密钥、证书私钥或验证码写入文档。

正式进入海外或大陆商店适配后，再处理对应账号主体、发行地区、隐私/SDK、内容管理、商店素材和 TestFlight 同包验证。当前不复用旧 V0.5.0 的冻结结论或申报答案。
