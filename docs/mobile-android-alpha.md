# MostBox Android 内测验收清单

本清单用于 Android Google Play 候选版真机验收。当前 Android 版本包含本地文件、知识库工具以及本机/远程节点切换；不包含聊天、云同步、公开内容目录、远程管理后台或长期后台服务。远程账号只用于签名访问用户自己的 daemon 文件。

## V0.5.0 封版状态

- 开发完成日期：2026-08-15。
- 版本：`0.5.0`，Android `versionCode` 为 `500`。
- 负责人已确认 Android 真机完成本清单的核心功能和最高优先级 P2P 传播闭环。
- 最终归档仍需补充设备型号、Android 版本、候选包文件名与 SHA-256、网络环境和测试记录编号；这些字段不改变本次功能验收结论。

## 构建与安装

先运行移动端测试和内部 APK 构建：

```bash
cd mobile/app
npm test
npm run typecheck
npm run bundle:android
npm run bundle:ios
npm run build
```

内部 APK 位于 `mobile/app/dist/`，用于真机功能回归。Google Play 候选包必须使用独立 upload key 运行 `npm run build:play` 生成 `.aab`，不得上传 debug 签名 APK。

安装后确认默认进入“文件”页，底部显示“文件 / 知识库 / 传输”三个入口；节点状态从右上角进入，并最终显示“在线”。

## 远程节点闭环

准备一个启用远程访问并配置邀请码的 daemon，分别使用 HTTP、HTTPS 和带路径的反向代理地址验收：

1. 未登录连接后只能查看公开节点状态，文件发布、接收和删除保持禁用。
2. 使用与 Web 端相同的用户名和密码登录，确认显示相同用户地址；重启后不需要重新输入密码。
3. 从 Android 流式发布文件，远程列表显示相同 CID、`source`、topic join 状态和 peer 数。
4. 远程下载、取消和重试均同步进度；完成后由 daemon 做种，手机不产生本机 holding。
5. 保存、分享和知识库打开附件时，手机拉取缓存并重算 CID；篡改缓存必须被删除和拒绝。
6. 断开 daemon 网络后保持远程模式并显示重连，期间文件变更操作不可用；恢复网络后继续同步。
7. 让原发布者退出，使用干净 verifier 从远程 daemon 下载并重算出相同 CID。
8. 远程首选启动失败时本次会话回退本机；首选记录保留，下一次启动仍优先尝试远程节点。

公网 HTTP 会明文传输邀请码和文件内容，只验证兼容性；实际部署继续推荐 HTTPS。

## 最高优先级：前台做种交接

从仓库根目录运行：

```bash
node scripts/android-real-p2p-seed.mjs --handoff-check
```

验收步骤：

1. 桌面发布者发布文件并打印 `most://` 链接。
2. Android 点击“接收文件”，输入链接并先执行“检查链接”。
3. 确认页展示文件名和 CID；只有点击“确认下载”后才开始传输。
4. 下载完成后 holding 状态为“做种中”，topic 已加入，CID 与桌面一致。
5. 关闭原桌面发布者，保持 Android 在前台。
6. 让脚本启动干净 verifier；verifier 必须从 Android 下载并重算出相同 CID。

## 必测场景

| 场景             | 通过标准                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Android 发布文件 | 系统文件选择器出现；发布完成后生成 holding、复制 `most://` 链接并加入 CID topic                  |
| 手工输入链接     | `most://`、网页入口和裸 CID 均可解析；非法 CID、额外路径和额外参数被拒绝；有效输入先展示确认信息 |
| 外部深链         | 冷启动和运行中打开 `most://` 都只进入确认页；用户点击确认后才开始下载                            |
| 下载校验         | 下载完成后重算 CID；不一致时不得保存或做种                                                       |
| 已有文件         | 同一 CID 已在本机时不重复下载                                                                    |
| 文件策略         | 用户选择或链接声明的 APK、AAB、XAPK、DEX、EXE、脚本等类型在传输前被拒绝                          |
| 保存和分享       | 系统分享面板可接收文件；Storage Access Framework 可把副本保存到用户选择的目录                    |
| 删除 holding     | holding 消失并停止做种；已保存到用户目录的副本保留；相同链接之后可重新下载                       |
| 重启恢复         | App 重启后恢复 holdings，并重新 join 对应 CID topic                                              |
| 知识库本地持久化 | 创建、编辑和显式保存 Markdown 后，App 重启仍能按原目录读取内容                                   |
| 知识库资源管理   | 文件名、路径和正文搜索可用；重命名、移动和删除不会误改其他笔记                                   |
| 编辑交互         | 标题、粗体、斜体、列表、代码、链接和附件工具可用；未保存离开必须确认                             |
| 备份与导入       | 单篇使用 UTF-8 `.txt`，内容为 Markdown；同名可取消、覆盖或生成副本；单篇可通过系统面板导出       |
| 快照恢复         | 无效路径、重复项或错误版本在写入前被拒绝；确认后完整替换，失败保留原知识库                       |
| 知识库附件       | Markdown 保持标准 `most://` 引用；等待下载时可取消，无种子约 30 秒结束；校验成功并做种后才能打开 |
| 前后台切换       | 返回前台后节点和 topic 自动恢复；不宣称或依赖长期后台做种                                        |
| 远程前后台恢复   | 返回前台后恢复远程 WebSocket；断线不静默切换到本机，文件变更在重连期间保持禁用                   |
| 远程 P2P Ping    | host/join 均通过当前远程 daemon 的 REST 状态机运行并轮询到终态                                   |
| 可见性           | 能查看 CID、文件大小、做种状态、topic 状态、peer 数、传输进度和基础日志                          |
| 政策入口         | 节点页可打开隐私政策、使用条款和问题反馈页面                                                     |
| 权限             | 系统设置中不出现通讯录、短信、位置、相机、麦克风、悬浮窗或全盘存储权限                           |

## Google Play 候选包检查

上传 Internal testing 前确认：

- `.aab` 的 package name 是 `most.box`。
- `versionCode` 大于 Play Console 中已上传的所有版本。
- `targetSdkVersion` 和 `compileSdkVersion` 均为 36。
- AAB 使用独立 upload key 签名，不是 Android debug key。
- Play App Signing 已启用。
- 首次安装或政策版本更新后，未同意隐私政策前不创建或启动 P2P 核心；拒绝后退出应用。
- `https://most.red/privacy/`、`https://most.red/terms/` 和 `https://most.red/support/` 可从公网无登录访问。
- 提供至少两个有在线种子的审核测试链接，并在审核期间保持可下载。
- 商店截图只展示当前 AAB 实际存在的文件、知识库、传输和节点能力。

详细提交字段见 `docs/google-play-submission.md`。

## 单轮记录模板

```text
日期:
测试人:
设备型号:
Android 版本:
MostBox 版本:
versionCode:
包类型: APK / AAB Internal testing
包 SHA256:
签名证书 SHA256:
网络环境: Wi-Fi / 蜂窝 / 跨网络
测试文件名与大小:
CID:
most:// 链接:
深链是否先确认:
Android holding 状态:
Android topic join 状态:
发布者退出后 verifier CID:
重启恢复结果:
保存/分享/删除结果:
知识库创建/搜索/移动/删除结果:
知识库单篇导入导出结果:
知识库快照恢复/失败回滚结果:
知识库附件发布/下载/打开结果:
可执行文件拦截结果:
隐私政策公网结果:
Pre-launch report:
开始时间:
结束时间:
结果: 通过 / 失败
错误与日志摘要:
```
