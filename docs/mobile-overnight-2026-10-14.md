# MostBox 移动聊天夜间开发与验收记录

本文记录已验收的八小时开发结果。验收后的 loading、蜂窝复测和剩余问题研究见 [移动端后续记录](mobile-followup-2026-10-14.md)。夜间构建 33 已归档到 `.codex-logs/overnight-2026-10-14/mostbox-android-accepted33.apk`，原 SHA256 不变；`app/dist/` 现为后续构建，当前包和设备设置以后续记录为准。

## 工作窗口与目标

- 用户授权：自主发现需求、决策和开发，参考已登录的微信测试账号；连续推进 8 小时，09:00 验收。
- 开始：2026-10-14 00:32:11（北京时间）。连续工作至 08:32，完成本轮八小时开发、真机验证和交付整理。
- 目标：让现有 P2P 频道聊天具备日常即时通信的可用体验。保持频道协议、`most://`、CID 校验、完整副本和自动做种不变量。
- 已有未提交改动：`app/App.tsx`、移动依赖及锁文件、“我”页面、核心文案、主题。保留这些改动，继续在当前工作区开发。

## 09:00 快速验收入口

- 夜间内部 ARM64 APK（已归档）：`.codex-logs/overnight-2026-10-14/mostbox-android-accepted33.apk`，版本 0.5.3 / versionCode 503。这是内部验收构建，不是商店提交或正式发版。
- 最终构建 33 已覆盖安装：67.81 MiB，SHA256 `0233ab95898dac5c5e703a0419cdf90fa064a6ed89f8dd25ef925cfc765a9eed`；校验文件与 APK 同目录。最终安装及复验状态在本文末尾记录。
- 测试频道：`10141001`、`10141002`。保留原账号、已有频道和文件；没有清空 App 数据。
- 最终真机四页截图：`.codex-logs/overnight-2026-10-14/acceptance-four-tabs-33.png`。手机留在本机模式聊天首页；“我”显示 23 个做种文件，提醒关闭，语言为简体中文，主题跟随系统。
- 真机操作演示：`.codex-logs/overnight-2026-10-14/acceptance-walkthrough-33.mp4`，45.44 秒，540 × 1200，包含四个入口和聊天附件。结构化验收索引为同目录 `final-acceptance-summary-33.json`。

建议按以下顺序验收：

1. 聊天列表查看最后消息、时间与未读；搜索 `#10141001`，在键盘打开时点击清除。
2. 两个频道分别输入草稿，切换后检查独立保留；返回桌面再打开，检查草稿恢复。
3. 在频道发送文字，长按复制；通讯录编辑备注、置顶，打开频道信息并复制名称，再在加入面板粘贴。
4. 聊天加号选择图片或文件；按住说话录制、松开试听、取消或发送。附件成功后进入“我 → 文件库”，检查做种状态。
5. 打开图片全屏，返回；播放语音、暂停及重播。录音权限只在实际录制时申请。
6. “我 → 新消息提醒”默认已关闭。需要时自行开启，再返回桌面接收另一节点消息，点击提醒检查频道。提醒依赖 App 仍运行，系统清理进程后不会靠外部推送唤醒。
7. “我 → 关于 MostBox”查看版本、政策入口、文件可用性和手机后台限制。实时通话当前只有既有信令界面，尚无实时音频传输。

最高优先级接力的本轮结果为通过：原发布者退出后，由手机继续向空节点传播 4 MiB 文件并重算 CID。重新跑这一场景可在根目录执行官方 `node scripts/android-real-p2p-seed.mjs --handoff-check`，按脚本提示在手机确认接收后继续。

明确限制：MIUI 本轮一小时息屏时约 25 分钟自动清理本机进程，持续做种失败；重新打开可恢复。手机蜂窝下载 128 KiB 文件通过，但两次蜂窝向电脑做种 4 MiB 文件失败，原因未确认。iOS 真机、Web 浏览器真实交互、实际相机拍摄发送没有在本轮完成，静态导出或配置预检不等于这些设备场景通过。

## 计划与成功标准

1. 建立真机和测试基线，观察微信会话列表、聊天输入、返回与消息操作。验证：ADB、截图、当前移动测试和类型检查。
2. 补齐会话预览、时间、未读、搜索和频道草稿，修复切换竞态。验证：状态与持久化测试、双频道真机切换、重启和新消息。
3. 改进历史阅读、返回、消息操作和连接反馈。验证：对应回归测试及真机聊天操作。
4. 构建内部 APK，验证手机与桌面聊天和 CID 附件传播，整理早晨验收入口。验证：相关协议检查、真机安装与 P2P 接力；明确记录未覆盖部分。

## 基线

- 设备：Redmi K30S Ultra / M2007J3SC，Android 12 / MIUI 14，ADB 序列号 `14cdba73`，1080 × 2400。
- 00:32 起初仅有 MTP；用户打开 USB 调试后，00:36 ADB 连接成功。
- 已安装：微信 `com.tencent.mm`、MostBox `most.box`。
- 移动端 `npm run typecheck`：通过。
- 移动端 `npm test`：176 项通过（前端/协议 99，后端/原生脚本 77）。
- 截图等本地证据保存在 `.codex-logs/overnight-2026-10-14/`；不将微信账号内容写入产品或测试夹具。

## 观察与问题

- 微信首页提供最后消息、消息时间、草稿提示和未读提示；MostBox 会话列表只有频道名和“点击进入聊天”。
- MostBox 聊天草稿是整个页面的单一状态，频道切换后可能把前一频道文字带到下一频道。
- 频道历史 API 支持游标，但移动聊天界面目前只获取最近 100 条。
- 多个异步频道加载没有请求归属检查；旧频道加载或发送完成可能覆盖当前频道。
- 聊天详情的 Android 系统返回目前未由聊天页处理。

## 本轮完成与验收

### 第一批：会话状态与历史阅读（00:32–01:20）

已实现：

- 会话列表展示最后消息、附件名称、时间和未读标记；置顶优先，普通会话按最近消息排序。提供频道/备注/最近消息搜索。
- 草稿与阅读状态按节点、账号和频道持久化；原生文件写入串行执行，避免隐藏会话与草稿保存互相覆盖。后台与返回时立即保存。
- 快速切换频道的异步加载按请求和节点/账号归属检查；发送完成只更新原频道，保留发送期间新输入的文字。
- 原生与远程历史分页接入；打开聊天默认定位最新消息，阅读旧消息时提供返回最新入口。加载旧历史不覆盖最新会话预览。
- Android 系统返回关闭聊天详情；文本和附件支持长按复制。
- 远程聊天订阅所有已加入频道，重连确认后补拉历史。后台会话预览保留最近 100 条，未读超过 99 显示 `99+`，不宣称无限历史的精确未读数。
- 远程 WebSocket 在异步认证阶段关闭后不会再打开旧连接，旧事件不再触发重连；连接建立增加 15 秒超时，并提供同步恢复提示。

验证结果：

- 移动端全量测试：183 项通过（前端/协议 105、后端/脚本 78）。后续 WebSocket 竞态新增 3 项，相关 6 项单独通过；最终仍会补全量验证。
- 根项目类型检查、严格路由类型检查、lint：通过。
- 根协议回归：13 项通过。
- 内部 ARM64 APK 构建与覆盖安装成功，原有账号、频道和文件保留。
- 真机分别写入两频道草稿，强制关闭后重启，两个草稿分别恢复。测试产生的旧频道草稿主要文字已清理；纯空白草稿不再显示提示。
- 桌面 QA 节点与手机在 `10141001` 双向收发：桌面文本到手机，手机 `101401` 回传到桌面，桌面事件记录确认。
- 手机查看另一频道时桌面发送新消息：`10141001` 出现 1 条未读；打开会话后清除。
- 长按复制手机消息 `101401`，粘贴回输入框得到相同内容；测试输入随后清理。
- `10141002` 同步 120 条消息：打开显示 `History QA 119`，加载历史后能读到 `History QA 000`。
- 发现长距离动画返回最新停在中途，改为直接定位后真机回归通过，显示 `New arrival while reading history` 与 `History QA 119`。

本地证据：`inbox-01.png`、`drafts-restart-01.png`、`unread-other-channel-02.png`、`copied-message-pasted-02.png`、`history-first-page-02.png`、`history-jump-fixed-03.png`、`desktop-messages.json`，以及各轮构建/测试日志，均在本轮 `.codex-logs/` 目录。

### CID 附件接力（01:20–01:25）

- 桌面发布 144 字节测试文件，在 `10141002` 发送 `most://` 链接。
- 安卓通过聊天附件按钮接收；提示 CID 校验通过并开始做种，附件动作变为“打开文件”。
- 停止原发布者，再启动空数据目录的新验证节点。新节点从安卓下载，重算 CID 一致，并进入 active 做种状态，耗时 5.7 秒。
- CID：`bafkreifnjf7baxfjfsqplzyqmdkah5vdkx427risfnpt42u3535cnxakra`。
- 使用官方 `scripts/android-real-p2p-seed.mjs --handoff-check`，退出码 0。此结果覆盖同一网络的实机传播，不推断所有 NAT、长时间后台或大文件场景。
- 本地截图：`attachment-receive-03.png`、`attachment-downloaded-03.png`、`attachment-seeding-03.png`；节点数据和测试文件位于本轮日志目录的 `handoff/`。

### 第二批：发现入口与真实照片附件（01:27–01:55）

- 补齐“发现”页面：加入频道、接收分享文件、文件、传输、节点。所有入口复用真实业务流程；没有虚构公共频道目录或推荐服务。
- 会话列表加 MostBox 标题与加入面板。创建/加入从独立面板操作，保留搜索与列表空间。
- 底栏聊天未读角标按全部可见会话计算，不受搜索过滤影响。真机停留“发现”时收到桌面消息，出现 1 条未读；进入该频道后清除。
- 无聊天的墨盒配置恢复文件标签、文件首页与返回行为，避免误显示通讯录。该配置目前仅代码检查，尚未单独安装墨盒 APK。
- 接入系统相册选择和拍摄，选择的图片沿用发布、CID 附件、自动做种流程。不会因打开相册而请求整库访问；相机拒绝权限提供可恢复提示。
- 聊天图片在本机内容已确认可用后通过 CID 导出预览；预览失败仍保留打开/接收文件操作，Web Blob 预览释放 URL。
- 使用自行放入手机 Pictures 的 `MostBox-QA.png` 验证：手机发布 13,587 字节 PNG，桌面收到 image 附件，手机显示预览。独立空节点从手机取回图片，CID 重算一致，耗时 6.165 秒，并进入 active 做种。
- 图片 CID：`bafkreiedq2hn27wthpbjlilw7kvx4nnymmdgucfb7b25j4ktatkjkb432i`。
- 构建 05 APK：57.55 MiB ARM64；SHA256 `7846c69331c3925e84ecbce1c079b0dbefb7b59485243e95322b8b7a68555d8d`，已覆盖安装。
- 相机拒绝权限实测正确提示；实际拍摄发送与 iOS 相册尚未验收。

本地证据：`discover-04.png`、`discover-unread-04.png`、`join-sheet-04.png`、`joined-from-discover-04.png`、`discover-receive-04.png`、`discover-files-04.png`、`discover-transfers-04.png`、`discover-node-04.png`、`image-sent-05.png`、`camera-denied-05.png`、`attachment-verified-bafkreiedq2hn27wthpbjlilw7kvx4nnymmdgucfb7b25j4ktatkjkb432i.json`。

验证：构建 04 时移动端全量 186 项通过（108 + 78），lint 通过。新增相册后类型检查和构建通过，最终继续补全量检查。

### 第三批：远程恢复与软键盘（01:56–02:26）

- 独立 QA daemon 通过 ADB reverse 的 `http://127.0.0.1:1987` 接入真机；保留原身份，验证 HTTP 签名与 WebSocket 订阅路径。该场景不覆盖公网邀请码拒绝、HTTPS 证书或 NAT 穿透。
- 暂停 HTTP/WebSocket 服务时，聊天显示恢复连接提示；停服期间由 daemon 添加 `Remote offline catch-up 0209`，恢复后手机补齐消息并消除恢复提示。
- 远程频道草稿 `020911` 与本机同名频道隔离；切回本机没有该草稿，再连接远程后恢复。随后成功发送该测试草稿，daemon 记录确认，输入框清空。
- 实机暴露远程入群/资料系统事件占用会话预览、出现原始内部事件键。会话预览、未读与普通气泡现与本机一致，排除这些系统事件。
- 自己的消息按以太坊地址规范比较大小写；不把其他大小写敏感的作者标识改为不区分大小写。补充纯逻辑回归。
- 实机软键盘发现 Android 聊天输入与发送按钮被遮住。补齐 Android 高度避让及安全区偏移；加入面板也避让键盘。真机键盘打开时直接点发送 `021501`，桌面收到，输入框清空。
- 加入面板输入 `10141002` 时，输入框、加入、取消均在键盘上方可见。
- 相机授权本次运行后拉起 `com.android.camera/.OneShotCamera`；取消拍摄回到聊天，没有产生额外附件。未拍摄周围环境作为测试内容。
- 增加已有 iOS 工程的相机/相册用途描述同步，避免只更新 app.json 后旧原生工程缺少权限描述；对应脚本 4 项通过。iOS 真机仍未覆盖。
- 构建 07 APK：SHA256 `acfa708c9a54ae3ea456059d9fdb7d29e77fc6b8da73314e610c19657347d353`，已覆盖安装。

本地证据：`remote-disconnected-05.png`、`remote-recovered-05.png`、`remote-draft-05.png`、`local-inbox-draft-scope-05.png`、`remote-inbox-07.png`、`remote-sent-07.png`、`keyboard-chat-06.png`（修复前）、`keyboard-chat-07.png`、`keyboard-sent-07.png`、`join-typing-07.png`、`camera-cancelled-05.png`、`remote-qa-messages.json`。

移动全量测试 186 项（照片批次）通过；系统事件和大小写新增的相关测试及 iOS 权限脚本通过，最终继续补全量检查。

### 第四批：真实语音消息（02:28–03:10）

- 接入真实麦克风录音；首次使用时才请求权限。按住录制，松手试听、取消或发送，最短半秒，60 秒结束录制。
- 录音作为音频附件发布，沿用 UnixFS CID v1、精确 CID 内容、自动做种与频道消息协议。没有新增中心化语音上传服务。
- 录音会话控制器覆盖授权过程中提前松手、重复开始/结束、后台取消、关闭页面后的异步返回、短录音和失败后重试；6 项通过。
- 真机发现重复请求已有麦克风权限会短暂进入后台，导致每次录制取消。改为先查询权限；原生录音准备显式传入平台录音选项。
- Android 拒绝权限可重试；“本次运行允许”后录制成功。试听 4 秒录音后取消，没有发送；8 秒录音试听/暂停后发送，桌面收到 `audio` 附件，126,782 字节。
- 录音 CID：`bafkreidk5vc7z5tc63hdujfkk45x33ndhcy3fsptnrulim2ebvonhztwf4`。独立空节点从手机下载，重算一致并做种，耗时 5.214 秒。
- 桌面另发布自行生成的 12 秒静音 WAV（192,044 字节），手机从聊天确认接收并通过 CID 校验，聊天内播放成功。切换两条语音只播放当前一条；结束后可以重播。
- 接收语音 CID：`bafkreihmzycyneixq6k2z57vwfencr4k3qoxpjtqjdzhslqrsb6fw6jnl4`。停止原发布节点后，独立新节点从手机下载并校验，耗时 5.164 秒。
- 真机录音中返回桌面：系统记录 03:02:17 开始、03:02:19 停止；返回没有试听或发送。播放中切后台的系统播放器状态为 paused，返回不自动续播。
- 原生 Android 已有工程同步新增 RECORD_AUDIO 权限并撤销旧阻止声明；墨盒继续阻止麦克风。iOS 工程同步补充麦克风用途描述，iOS 真机未覆盖。
- 构建 11 APK：64.26 MiB ARM64，SHA256 `93f778cf4d366e6f9fe2b795a1996d7323b60cdb6c10adae569b94ae891fcbbf`，已覆盖安装。移动全量 195 项通过；额外权限拒绝回归后录音控制器 6 项、类型检查和 lint 通过。
- Expo Web 静态导出通过。浏览器检查工具 daemon 可用，但没有已连接的 BrowserSkill 扩展，未把 Web 交互或录音记为通过；保留这项待验收。
- 更新移动 README、Android Alpha 验收及仓库中的照片/麦克风隐私说明。没有发布网页或提交商店包。

本地证据：`voice-review-11.png`、`voice-long-review-11.png`、`voice-play-active-11.png`、`voice-sent-11.png`、`voice-incoming-playing-11.png`、`voice-switch-playing-11.png`、`voice-replay-11.png`、`voice-recording-background-return-11.png`、`audio-background-11.txt`、`audio-recording-background-11.txt` 和两个音频的 `attachment-verified-<cid>.json`。

### 第五批：键盘操作、全屏图片与权限边界（03:10–03:51）

- 通讯录备注编辑修正 Android 键盘避让：键盘打开时保存 `032000`，搜索命中对应频道，再恢复测试前的空备注并清空搜索。
- 图片缩略图可打开全屏预览，提供保存和打开文件。后台或离开聊天时关闭预览；仍只读取本机已确认可用的 CID 内容。
- 真机保存 `MostBox-QA.png`：通过系统目录选择器选择专用 QA 目录，文件为 13,587 字节，SHA256 与原始测试图片一致（`83868edd7ed33bc295a176faab7e35b863066a08a1f875d4f15304d495079bd2`）。
- 连接面板修正键盘避让与顶部安全区，长表单可以在键盘上方滚动；连接失败直接在面板内显示原因，避免普通 toast 被原生弹窗挡住。已验证 QA 远程连接成功、切回本机，以及错误地址提示；键盘首次点击仅收起键盘的问题继续改为保留点击，下一批复测。
- 语音输入模式隐藏无关文字发送按钮，按住录音获得完整输入宽度。
- Web 录音适配器补充资源释放、停止失败、构造失败和权限拒绝的 3 项回归；MostBox 和墨盒的相机/麦克风权限按产品能力同步，避免现有原生工程残留权限。
- 移动端全量 200 项通过（119 + 81），类型检查通过；Expo Web 静态导出通过，Web 真实交互仍待验收。
- 构建 16 APK 已安装：64.27 MiB，SHA256 `037887c65043eb89eb8696974eb1570e867426d9b547f087e82283bf93442803`。此为阶段性构建，最终以随后验收构建为准。

本地证据：`contact-rename-keyboard-13.png`、`contacts-renamed-13.png`、`contacts-search-13.png`、`contact-remark-restored-13.png`、`unicode-chat-12.png`、`image-fullscreen-14.png`、`image-saved-14.png`、`node-keyboard-visible-16.png`、`node-remote-ready-16.png`、`node-local-ready-16.png`、`node-invalid-action-visible-16.png`、`test-08.log`。

### 后台观测（03:51–04:22）

- 03:51 将本机模式 MostBox 返回安卓桌面，未强制停止进程。
- 04:01 从新的空数据节点获取手机此前发送的语音：126,782 字节，CID 重算一致，14.699 秒完成。该证据仅说明这台充电中的 Android 12 测试设备在约 10 分钟后台后仍可传输，不承诺其他系统、熄屏、省电或永久后台可用。
- 04:12 手动熄屏，保留设备原有“充电时保持唤醒”设置；系统随后记录 `mWakefulness=Asleep`。04:21 独立空节点从手机取回 13,587 字节测试图片，CID 一致，耗时 5.177 秒。
- 04:22 返回应用：`10141001` 两条后台消息恢复并显示 2 条未读，`10141002` 一条熄屏期间消息恢复并显示 1 条未读，列表最后消息与时间正确。总未读为 3。
- 条件为同一 Wi-Fi 网络、Android 12 / MIUI 14、充电状态，未强制进入 Doze、未模拟系统杀进程；不据此推断所有 Android 系统的长期后台能力。
- 证据：`background-seed-10min.log`、`background-seed-30min-screen-off.log`、`background-screen-off-power.txt`、`background-30min-return-16.png`。

尚未验收：更长后台/熄屏恢复、iOS 真机、Web 交互与真实通话。后续批次继续推进。

### 第六批：本地消息提醒、关于页面与连接首次点击（04:22–04:48）

- “我”增加可选择的新消息提醒，默认关闭，用户明确开启后才请求系统通知权限。当前只在应用仍运行、收到在线节点消息时触发本地通知；没有注册推送 token，也不依赖 FCM/APNs。
- 只提醒新增的他人消息；历史补齐、自己的消息、系统事件、隐藏频道以及前台消息保持安静。提示不含消息正文，同一频道替换已有提醒，点击按当前节点和已加入频道校验后打开会话。
- 实机开启后，前台收到消息没有系统提醒；返回桌面收到消息后出现静默提醒。点击进入对应频道；再在后台保留提醒、终止应用后台进程后点击，冷启动仍打开 `10141002`。关闭提醒后后台新消息不再通知，返回应用仍正常显示未读。已恢复关闭状态。
- iOS 配置真实 introspection 发现 Expo 通知插件自动加入 APNs entitlement；增加仅本地通知的配置插件并验证最终 entitlement 为空，没有 remote-notification 后台模式。iOS 真机仍未覆盖。
- 原先不可用的“关于 MostBox”现在展示实际版本 0.5.3、产品边界、隐私政策和使用条款入口。实机页面通过；没有把仍属信令的语音通话标为真实通话。
- 连接弹窗首次点击问题来自外层节点页面的 ScrollView 先消耗点击；设置外层键盘点击处理后，键盘打开时单击连接按钮即可执行。实机第一次点击错误地址显示失败提示，修正地址并输入邀请码后第一次点击成功进入远程节点。
- 移动全量 205 项通过（124 + 81）；根类型检查、严格路由检查、lint 和 13 项协议回归通过。构建 22 已安装，SHA256 `1826f773b6063dc66d1abe1720805b643f13fd6ade800cf0d51b385725b91a65`。
- 本地证据：`notification-foreground-me-21.png`、`notification-shade-21.png`、`notification-channel-open-21.png`、`notification-cold-channel-21.png`、`notification-disabled-return-21.png`、`about-visible-21.png`、`node-keyboard-before-click-22.png`、`node-keyboard-first-result-22.log`、`node-valid-settled-22.png`、`expo-notifications-introspect-04.json`。

### 第七批：语音失败重试与真实网络切换（04:48–05:07）

- 语音试听面板内显示发送错误，失败保留原录音供试听、重试或取消。节点未就绪时也在面板直接反馈，不再额外弹出重复提示。
- 实机录制约 5 秒后暂停 QA 远程 HTTP/WebSocket；发送显示未就绪，录音保留。恢复服务后重试暴露远程上传文件名与聊天附件名称不一致的问题：原生上传使用缓存文件名。聊天附件现采用发布结果链接中的实际名称，普通文件和照片也同步修正。
- 构建 24 复测：停服时原录音保留、错误可见，恢复后重试成功，远程节点记录一致的 `audio` 附件和分享链接，79,229 字节，CID `bafkreih6lici62lsyvayinqwq2y67kwpsugh2cp3vjo5vorcocsnj3qoj4`。
- 持续按住 65 秒，系统日志记录麦克风约 60.1 秒后停止，自动进入试听。长录音随后取消，没有发布。将试听时长按最接近的整数秒显示，避免 60 秒上限因毫秒延迟显示 61 秒；该显示微调在下一构建验收。
- Wi-Fi 关闭后手机实际切换 4G：两端双向消息同步通过，此轮不记为完全断网。
- 临时关闭 Wi-Fi 和实际移动数据连接，系统确认 `Active default network: none`。手机发送 `050314` 后本机显示、桌面无记录；桌面发送 `Fully offline catch-up 0504` 时手机无该消息。恢复两种网络设置后约 12 秒桌面收到手机消息，手机补齐桌面消息。
- 测试脚本设 3 分钟自动恢复，实际断网约 58 秒；结束时 Wi-Fi、两张卡移动数据开关及旧 global 值全部与基线一致。
- 移动全量 205 项、类型检查、根协议 13 项、lint 通过，新的 Expo Web 静态导出通过。构建 24 已安装，SHA256 `dfb5455b81885efedc854f6b6d2f1e0795e2672cc4c2be1f429c6bfd26c6439b`。
- 证据：`voice-error-inline-24.png`、`voice-retry-complete-24.png`、`remote-qa-messages.json`、`voice-max-final-24.png`、`network-cellular-chat-24.png`、`network-total-offline-system.txt`、`network-total-offline-confirm-24.png`、`network-recovered-chat-24.png`、`network-total-offline-evidence.json`、`desktop-messages.json`。

### 第八批：频道分享与带前缀的搜索（05:07–05:19）

- 聊天详情和会话菜单增加频道信息，可复制真实频道名称或打开系统分享面板；通讯录菜单也提供复制与原生系统分享。分享内容为现有 `#频道名称`，不会创建新的分享协议或把个人备注当作频道标识。
- 真机打开信息页、复制 `#10141001`、拉起 Android 系统分享面板并取消。没有向外部联系人发送测试消息。
- 复制内容粘贴到“创建或加入频道”，点击加入后打开原频道并保留历史，闭环通过。
- 粘贴带 `#` 的名称搜索原先无结果；会话列表和通讯录搜索现复用频道输入规范化。构建 26 分别在两个搜索框粘贴，均命中 `10141001`，相关回归通过。
- 类型检查、lint、相关 16 / 12 项检查通过，新的 Expo Web 导出通过；Web 原生交互仍未验收。
- 构建 26 已安装：67.80 MiB，SHA256 `3ba7bdb8153e70fbbf26e302f0fc57e0a2ce0d0be245cd748341907264273068`。
- 证据：`share-info-visible-25.png`、`share-copied-25.log`、`share-system-visible-25.png`、`share-pasted-join-25.png`、`share-join-complete-25.png`、`share-contacts-menu-25.log`、`share-contact-search-hash-after-26.png`、`share-chat-search-hash-proof-26.png`。

05:19 将本机模式手机返回桌面并熄屏，开始约一小时后台观测。此期间继续开发，但暂不安装新包，避免重启进程干扰观测。

### 一小时息屏观测与系统清理后的恢复（05:19–06:21）

- 05:19 返回桌面并熄屏，系统保持 `Asleep`；未开启 Doze 强制模式，设备仍充电、同一 Wi-Fi。
- 05:39 新空节点从手机获得原语音，CID 一致，24.281 秒完成。
- 系统退出记录显示 05:44:17 将 `most.box` 进程以 `AutoLockOffClean` 原因清理，约为息屏 25 分钟后。记录的 Android 原因为 `USER REQUESTED`，但描述明确是 MIUI 自动锁屏清理，不是本轮手动结束应用；没有代码崩溃记录。
- 06:19 满一小时后新空节点下载，等待 60 秒仍没有在线 peer 或精确 CID 文件，失败。不能将这一轮记为一小时连续后台做种成功。
- 06:20 重新打开应用，先恢复清理前已保存的第一条消息及 1 条未读，再补齐清理后桌面发送的第二条消息，未读变为 2；打开 `10141002` 可见两条，阅读后清除未读。
- 重新打开后，同一语音自动恢复做种，新节点 5.459 秒下载并重算 CID 一致。未更改 MIUI 后台清理或省电设置。
- “关于”补充本机节点可能被手机系统暂停/清理的说明，以及持续传输保持前台、重新打开恢复的使用方式。当前没有原生前台服务，不能承诺后台持续在线或及时提醒。
- 证据：`background-hour-exit-info.txt`、`background-hour-seed-60min.log`、`background-hour-return-initial-26.png`、`background-hour-return-settled-26.png`、`background-hour-history-26.png`、`background-hour-recovered-seed.log`。

### 第九批：会话恢复和发送重试（05:19–06:50）

- 会话和通讯录搜索增加清除按钮，便于在键盘打开时直接清空粘贴的频道名称。
- 删除会话保留频道及历史，记录当时的阅读位置；新收到他人消息后重新显示，旧历史、自己的消息和系统事件不触发恢复。恢复会持久化，避免阅读后再次隐藏。
- 文字与语音发送为同一次失败重试保留 UUID；语音还复用已经发布的附件。移动核心按频道串行写入，同一作者与 UUID 重试返回原消息，内容或附件冲突拒绝；没有 UUID 的旧消息继续兼容。
- 实际 Hyperswarm 互通：独立移动核心和桌面节点双向保留 UUID，每端同一 ID 两次发送均只有一条历史；移动核心重启后再次提交同一 ID 仍只有一条。证据 `retry-p2p-interop.json`。
- 当前 UI 的失败尝试 ID 只保留在本次运行，不能承诺应用重启后自动恢复未确认发送。
- 构建 31 真机：两个搜索框在键盘打开时点击清除，均恢复完整列表；删除 `10141002` 后通讯录仍保留频道，重启并重新连接同一远程节点后旧历史不使其出现。新他人消息使会话恢复为 1 条未读；阅读后保持可见，再次重启和重连仍可见且无未读。
- 用构建 26 建立真实故障基线：服务端保存 `062326` 后返回 504，重试使历史出现两条。构建 31 同样故障发送 `062631`，原草稿保留，重试后历史仅一条，UUID 为 `482d2323-2ee4-486b-af1e-d52baed3cb58`。随后主动再次发送相同文字，使用新 UUID，得到第二条，正常重复文字不被误删。
- 构建 31 本机频道发送 `062431`，独立桌面节点收到并在持久化历史保留 UUID `e729648a-0a1b-4ce0-b595-7f59b69b47b1`。
- 语音保存后返回 504，试听和错误保留；重试后远程历史只有一条 UUID `edbe23a2-f330-4d09-8a9b-9270ab0819d1`。HTTP 请求审计确认整个首次发送与重试只有一次 `POST /api/publish`，附件 CID 不变。
- 证据：`native-client-id-real-phone-31.json`、`baseline-response-lost-duplicate-26.json`、`retry-remote-after-31.json`、`retry-intentional-second-31.json`、`voice-loss-after-retry-audit.json`、`voice-loss-after-retry-31.json`、`hidden-restored-after-read-restart-31.png`、`search-clear-chat-result-31.png`、`search-clear-contacts-result-31.png`。
- 息屏约 20 分钟后独立新节点从手机取回原 126,782 字节语音，CID 重算一致，24.281 秒完成。证据 `background-hour-seed-20min.log`。该结果仅覆盖当前充电、同一 Wi-Fi 设备条件。

### 第十批：预览失败与请求截止时间（06:00–07:03）

- 图片预览读取失败时显示可点击的重试入口，重新通过当前节点按精确 CID 导出并校验，不从文件名推断已有内容。
- 远程聊天 API 增加 30 秒截止时间，覆盖请求和响应正文读取；超时中止请求，显示可本地化提示，保留原草稿或录音供重试。切换节点后旧发送失败不再弹到新节点。
- 回归覆盖请求无响应、响应正文停滞、成功与服务端失败后的计时器清理；相关 17 项通过。移动端全量 214 项通过（130 + 84），无失败或跳过。
- 真机服务端保存文字 `062831` 后延迟 35 秒返回，客户端约 30 秒中止并保留草稿；重试后历史仅一条，UUID `2a9bc5e4-5259-488e-912e-23925e333a4d`。
- 语音同样保存后延迟响应，试听面板直接显示“请求超时，请检查连接后重试。”，录音保留。重试后同一 UUID `5344a30f-94ee-4d0e-b31a-8225063f41dc` 和 CID 只有一条历史。
- 图片下载第一次故意返回 503，真机显示“重新加载图片”入口。点击后第二次请求相同 CID，图片预览恢复，全屏查看和返回通过。请求审计确认两次都是精确 CID 下载。
- 真机按住录音 65 秒，约 60 秒自动停止，试听显示 60 秒，播放显示 60s；最后取消，没有发布或留下播放中的音频。
- 类型检查、lint、Android 构建通过；iOS Bare 核心打包及发布配置预检通过，未做本轮 iPhone 真机验收。
- 官方接力脚本发布 4,194,304 字节随机文件，手机接收、通过多块 UnixFS CID 校验并默认做种。停止原发布者后，新空节点从手机获取完整副本并重算同一 CID，5.0 秒完成，状态 active / joined，脚本退出码 0。
- CID：`bafybeibug4o4vhdn2ax7ia75s6mub6sv3zqcwfthfemxxan5pdeuwlu3jm`；topic：`34371dca9c6dd02ff403fd979940fa55de602b166729197b81bd78c94b2e9b4b`。验证数据在 `handoff-4m/verifier-node-data/`，holding 记录的来源是 downloaded。
- 证据：`timeout-after-retry-31.json`、`voice-timeout-state-31.png`、`voice-timeout-after-retry-31.json`、`image-retry-failure-settled-31.png`、`image-retry-loaded-31.png`、`image-retry-fullscreen-31.png`、`request-audit.jsonl`、`max-voice-review-ready-31.png`、`max-voice-playing-31.png`、`large-phone-seeding-handoff-31.png`。

### 第十一批：缺失历史块时的离线发送（07:13–07:19）

- 检查发现发送前计算时间戳会等待读取全部作者的历史。如果已验证的 Hypercore 长度包含本机缺失的消息块，且该作者离线，新的本机消息会被阻塞。
- 用本轮两个移动核心真实复制过的频道数据构造缺块夹具：保留已验证 header 和长度，只清除本地消息 body；关闭原作者并使用无网络 swarm。修复前发送在 2.5 秒观察窗口内没有保存。
- 时间戳计算现只读取本机可用块，仍取本机时钟与可读历史最大时间的较大值。同一夹具修复后约 5 毫秒保存成功；正常历史同步逻辑没有改成跳过缺块。
- 新增真实 Corestore 稀疏历史回归，验证离线保存、同 UUID 重试和 snapshot 只有一条。移动核心 36 项通过；移动全量 215 项通过（130 + 85），类型检查、lint 和根 CID 协议 13 项通过。
- 构建 32 完成，SHA256 `35b90282e5c89f810d928d9b9bf4a6b3f7e4d1e408aeccd993ca91a0c2aaf5e1`。暂不安装，以免干扰 07:13 开始的远程模式息屏比较；随后覆盖安装并复验。
- 证据：`sparse-offline-before.json`、`sparse-offline-after.json`、`sparse-history-test-01.log`、`test-16.log`、`build-apk-32.log`。夹具为人为制造的本地缺块条件，不把它描述成真机自然断网时必然发生。

### 第十二批：旧消息解析兼容（07:39–07:42）

- 复核发现界面解析先展开原始 metadata，格式错误的 `clientMessageId` 会留在返回值中。相同作者的不同旧消息若携带相同错误 ID，合并逻辑会错误地只显示一条。
- 增加 HTTP 历史与 WebSocket 事件回归：错误字符串、数字和对象形式的 ID 都不能合并不同消息；合法大写 UUID 仍规范化并去重。修复前回归实际失败，显示 `1 !== 2`。
- 解析时先移除原始 ID，只加入通过 UUID v4 校验的值，保留其他展示 metadata。相关 18 项通过，移动全量 216 项通过（131 + 85），类型检查与 lint 通过，Expo Web 静态导出通过。
- 证据：`invalid-id-before.log`、`invalid-id-after.log`、`test-17.log`、`typecheck-35.log`、`lint-18.log`、`web-export-08.log`。该回归使用明确的畸形输入，不宣称已有真实节点发送过此类消息。

### 远程节点模式息屏比较（07:13–07:46）

- 系统日志记录 07:13:23 息屏，App 已确认连接 QA 远程节点 `127.0.0.1:1987`。截至 07:46，约 33 分钟，手机进程仍为 PID 16230，系统没有新增自动清理记录。本轮结果不能推翻之前本机模式 `AutoLockOffClean` 的实际失败。
- 07:33 新空节点获取远程节点持有的 80,725 字节语音，重算 CID 一致，5.151 秒完成。
- 07:46 明确执行本轮手动 `force-stop`，手机进程消失后，新空节点仍获得同一语音，4.629 秒完成并做种。证明在线桌面 daemon 可以独立于手机继续传输；不把手动停止记为系统清理。
- 手机应用重新启动仍默认本机模式，需要从历史连接显式选择远程节点。重连后 `10141002` 显示 2 条未读，打开可见 07:14 和 07:33 两条息屏消息，阅读后清除。
- 证据：`remote-soak-power-log.txt`、`remote-soak-exit-32min.txt`、`remote-soak-force-stop-exit.txt`、`remote-soak-seed-20min.json`、`remote-soak-seed-phone-stopped.json`、`remote-soak-cold-local-31.png`、`remote-soak-inbox-restored-31.png`、`remote-soak-history-restored-31.png`。

### 最终构建与网络复验（07:49–08:18）

- 构建 33 覆盖安装成功，版本 0.5.3 / versionCode 503 / targetSdk 36，账号和原有频道、文件保留。实机确认本机节点在线、22 个原有 holding 恢复。安装包 SHA256 与同目录校验文件一致，为 `0233ab95898dac5c5e703a0419cdf90fa064a6ed89f8dd25ef925cfc765a9eed`。
- 更新并重启后，新空节点取得手机的 4 MiB 文件，CID 相同，6.739 秒完成并做种。原发布者已经退出，不以文件名或已有 metadata 判定成功。
- 完全关闭 Wi-Fi 和两张卡的移动数据，系统为 `Active default network: none`。手机发送 `075233` 后本地立即保存，远端历史为 0 条。远端此时发送 `Final offline catch-up 0753`，手机尚不可见。约 74 秒后恢复原网络开关，远端收到唯一一条 UUID `203857ab-9aef-4566-bc6c-51dc958be375`，手机也补齐远端消息。
- 07:55 关闭 Wi-Fi，系统默认网络为蜂窝，`MOBILE[NR]` / `CELLULAR`。两个独立空节点分别在网络切换后、手机仅在蜂窝网络下重新启动后请求原 4 MiB CID，均在 60 秒内未发现 peer，退出码 1 / `PEER_NOT_FOUND`。第二次失败发生在 Wi-Fi 自动恢复之前，不能记为跨蜂窝做种成功，也不能仅归因于切换后的旧连接。
- 08:02 再次关闭 Wi-Fi，手机通过 `most://` 深链先看到确认接收，再确认下载电脑发布的 128 KiB 文件。08:05 仍在蜂窝网络时附件已变为“打开文件”，CID 校验完成。CID 为 `bafkreic773rxrik6nde6dwolqgtclaezsniqzhzuwhmqzobm7jcialkfvq`；这一轮证明蜂窝下载路径可用。
- 08:06:23 Wi-Fi 按 4 分钟保险自动恢复，所有网络设置与原值一致。随后停止 128 KiB 原发布者，新节点从手机取回同一 CID，5.884 秒完成。此验证开始前已恢复 Wi-Fi，明确只记为 Wi-Fi 接力。
- 已确认蜂窝下并非所有通信都不可用；文件做种失败的具体发现或穿透原因仍待诊断，不增加未经验证的网络配置或 relay。此前 4G 双向消息同步的结果与本轮文件失败分别记录。
- 08:11 通过界面清理早期草稿测试在 `nmr92` 留下的一个换行，操作前确认只有该换行，没有清除原有文字或删除频道。
- 08:16–08:18 重新检查聊天、通讯录、发现、我四页并保存截图。随后返回聊天首页，未留下键盘、弹窗或播放中的音频。原媒体音量恢复为 32 / 150，Wi-Fi 为 1，两张卡数据开关均为 1；旧全局 `mobile_data` 的原值仍为 0，不用它误判双卡数据状态。保持原有充电常亮设置 7，未启用强制 Doze。
- 为 09:00 验收保留本轮桌面频道节点与远程 QA 节点，当前进程分别为 17472 和 7056。后者地址 `http://127.0.0.1:1987`、测试邀请码 `10141987`，依赖当前 USB 的 ADB reverse；App 默认仍为本机模式，需显式选择历史连接才连接远程。两者是本机测试服务，不是上线的公共节点；不要将 QA 邀请码作为生产凭证。用户原有 Node 进程 7628 保留。
- 修改保留在工作区，未创建提交、推送或正式发布。政策源文件和 Web 静态政策页已同步修改，未部署到远程网站。
- 最终检查：移动端全量 216 项（131 + 85）、根 CID/P2P 协议 13 项全部通过，均无失败或跳过。移动及根类型检查、严格路由检查、lint、格式化通过。Android 内部构建和安装通过，Web 静态导出与 iOS 配置/Bare 核心预检通过。对应日志：`test-17.log`、`protocol-05.log`、`typecheck-35.log`、`root-typecheck-03.log`、`lint-19.log`、`format-51.log`、`build-apk-33.log`、`web-export-08.log`、`ios-preflight-02.log`。
- 证据：`install-33.log`、`final-native-node-33.png`、`final33-restart-seed-4m.json`、`final-offline-network-33.txt`、`final-offline-before-33.json`、`final-offline-after-33.json`、`final-offline-recovered-33.png`、`network-total-offline-final33.json`、`final33-cellular-seed-4m.log`、`final33-cellular-cold-seed-4m.log`、`final-cellular-node-state-33.png`、`wifi-cellular-final33.json`、`final-cellular-receive-confirm-33.png`、`final-cellular-download-result-33.png`、`wifi-cellular-receive33.json`、`final33-cellular-new-holding-handoff.log`、`final-old-draft-cleared-33.png`。

### 最终前台稳定观察（08:18–08:29）

- 网络恢复后的 12 次采样覆盖约 10 分钟，手机 PID 始终为 24277，前台 Activity 始终为 MostBox，Wi-Fi 保持开启；观测脚本正常结束，退出码 0。这是前台条件下的观察，不替代此前后台清理失败的记录。
- 08:27 桌面发送 `Final foreground acceptance: chat and seeding ready`，手机收到，会话更新最近消息与时间并显示 1 条未读。打开频道后清零，返回聊天首页。
- 08:28 原发布者仍已退出，新空节点从手机取回完整 4 MiB 文件，5.016 秒完成，重算 CID 一致，holding 为 downloaded / active / joined；验证节点随后正常停止。桌面 QA 聊天节点没有该文件 holding，在线远程 QA 节点也未持有该 CID。
- 真机截图与 45.44 秒操作录像已保存。手机最终留在本机模式聊天首页，无测试未读、空白草稿、键盘、弹窗或播放中的音频；网络、媒体音量和充电常亮设置恢复为本轮开始时的值。
- 证据：`final-foreground-observation-33.json`、`final-foreground-observation-33.log`、`final-foreground-inbox-33.png`、`final-foreground-history-33.png`、`acceptance-final-chat-33.png`、`final33-foreground-seed-4m.json`、`final33-foreground-seed-4m.log`、`acceptance-four-tabs-33.png`、`acceptance-walkthrough-33.mp4`、`acceptance-video-metadata-33.json`、`final-acceptance-summary-33.json`。
- 08:32 最终环境读回确认手机仍为 PID 24277、MostBox 前台，Wi-Fi 和双卡数据开关、媒体音量 32 / 150、充电常亮设置 7 均与恢复目标一致。证据 `final-environment-33.json`。完成八小时工作窗口，本轮阶段性交付结束；已知后台和蜂窝做种问题继续保留为未解决项。
