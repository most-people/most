# MostBox Android 内测验收清单

> v0.5.0 Android Alpha 必须先清除旧版本应用数据。v0.5.0 不迁移旧 Corestore，也不能与 v0.4.2 桌面或移动节点互通；启动提示要求清除应用数据时，不得通过重试绕过。

本清单用于记录 Android 内测 APK 的真机复测结果。当前 Android 版本只承诺前台完整种子能力：App 在前台时可以发布、下载、CID 校验，并在发布或下载完成后继续做种。

## 构建与安装

发版版本同步以 README 的 CI/CD 说明为准；本清单只记录 Android APK 构建、安装和真机验收。

构建前先运行移动端协议测试：

```bash
cd mobile/android
npm test
npm run build
```

构建成功后检查 `mobile/android/dist/`：

- `mostbox-android-<version>-release.apk`
- `mostbox-android-<version>-release.apk.sha256.txt`

安装到真机后，打开 App 并确认默认进入聊天 Tab；切到节点 Tab 后状态进入 `Ready` / `在线`。

## 最高验收回归：前台做种交接

每次发 alpha 前，优先用仓库根目录的一键回归脚本复跑“桌面发布 -> Android 下载并做种 -> 发布者退出 -> 新节点仍能从 Android 拉取并通过 CID 校验”：

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

脚本会自动完成桌面发布、打印 `most://` 链接、等待人工确认 Android 已经前台做种，然后关闭原桌面发布者，启动一个干净的 verifier 节点继续拉取并重算 CID。

按 Enter 继续前，人工确认 Android 侧观察点：

- App 保持前台，节点 Tab 状态为 `Ready` / `在线`。
- 在聊天 Tab 的活动房间中收到脚本打印的 `most://` 链接，点附件下载动作后完成下载，transfer 状态为 completed。
- Holdings 中出现同一个 CID，文件大小与脚本打印一致。
- Holding 状态为 `active`，`topicJoined` 为 true。
- Android 日志能看到下载完成、CID 校验/保存 holding、继续做种相关输出。

脚本通过时需要保留这些桌面日志摘要：

- `publisher topic joined`：原发布者已按 CID topic 做种。
- `Stopping original desktop publisher` 和 `Original desktop publisher is stopped`：验证前发布者已退出。
- `verifier download status` / `verifier download progress` / `verifier download success`：新节点从剩余种子拉取。
- `verifiedCid` 与 `cid` 完全一致。
- `verifierHoldingStatus: active` 且 `verifierTopicJoined: true`。

## 必测场景

| 场景                            | 通过标准                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 聊天附件发送，桌面下载  | Android 在聊天房间发送附件消息，消息内容为 `most://` 链接；桌面 /chat 显示附件并下载通过 CID 校验。                                                                                |
| 桌面聊天附件发送，Android 下载  | 桌面 /chat 发送附件消息；Android 聊天房间显示附件卡片，下载完成后 CID 校验通过，并自动加入 holdings。                                                                              |
| Android 打开/分享文件           | Holding 行点击 `打开/分享` 后，系统分享或打开面板出现，目标 App 能收到文件副本。                                                                                                   |
| Android 保存文件                | Holding 行点击 `保存` 后，用户选择目录，目录中出现同名文件副本。                                                                                                                   |
| Android 删除 holding 后重新下载 | Holding 行点击 `删除` 后，该 CID 从 holdings 消失并停止做种；已保存到手机目录的副本仍存在；再次输入同一 `most://` 链接可重新下载、通过 CID 校验，并重新加入 holdings / CID topic。 |
| 发布者退出后继续传播            | `node scripts/android-real-p2p-seed.mjs --handoff-check` 通过；原桌面发布者退出后，只要 Android 仍在前台做种，新的桌面节点仍可下载、重算 CID 并校验。                              |
| Android 重启恢复                | Android App 重启后恢复 holdings，并重新 join 对应 CID topic。                                                                                                                      |
| 基础可见性                      | Android UI 能看到 CID、文件大小、topic join 状态、peer 数或基础日志。                                                                                                              |

### v0.5.0 专项检查

- 未清除旧应用数据时，节点必须拒绝启动并明确提示清除应用数据；清除后生成 storage schema 1，文件与频道 Corestore 独立。
- 桌面发布、Android 下载并校验后，Android holding 内部必须沿用发布者的同一 drive key/version；公共 UI 和 API 不显示 key/version。
- 原桌面发布者退出后，verifier 仅连接 Android 种子仍能完成下载并重算相同 CID。
- 删除 holding 后立即离开 CID topic；已导出的用户文件仍保留，内部 snapshot blocks 在下次 swarm 启动前回收。

## 已知边界

- 不承诺 Android 长期后台做种；测试传播能力时保持 App 在前台。
- 本轮不覆盖 iOS、Play Store 分发、云端中转、账号同步、游戏、笔记或 Web3 工具箱。
- 聊天测试覆盖频道消息、presence、备注/置顶/退出和 `most://` 附件主流程。
- 大文件测试失败时优先记录存储空间、网络切换、Android 文件选择器/导出行为和 App 日志。

## 单轮记录模板

```text
日期:
测试人:
Android 设备型号:
Android 系统版本:
APK 文件名:
APK SHA256:
桌面节点平台:
桌面 MostBox 版本或 commit:
网络环境:
测试文件大小:
CID:
most:// 链接:
回归命令:
脚本 workDir:
publisher topic:
verifier 下载路径:
verifier verifiedCid:
verifier holding 状态:
场景:
开始时间:
结束时间:
耗时:
结果: 通过 / 失败
失败错误:
Android holdings 状态:
Android topic join 状态:
打开/分享结果:
保存到手机结果:
删除 holding 结果:
删除后手机另存副本是否仍存在:
同一 most:// 链接重新下载结果:
重新加入 topic 状态:
桌面日志摘要:
Android 日志摘要:
备注:
```
