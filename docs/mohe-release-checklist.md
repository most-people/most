# 墨盒大陆版发行清单

墨盒使用与 MostBox 相同的 CID、`most://`、Hyperswarm topic 和 Hyperdrive `/<cid>` 协议，但以独立产品 profile、包标识和发行材料发布。首版默认收敛功能，任何未完成评估的能力不得通过隐藏入口提供。

## 构建身份

- profile：`MOST_PRODUCT=inkbox`
- 应用名：墨盒
- Android application ID：`red.most.mohe`
- iOS Bundle ID：`red.most.mohe`
- URL scheme：`most`（继续兼容 MostBox 分享链接）
- EAS：`android-production-mohe` / `ios-production-mohe`
- 法律入口：`https://most.red/mohe/privacy/`、`https://most.red/mohe/terms/`、`https://most.red/mohe/support/`

生成候选配置并核对身份：

```bash
cd mobile/app
MOST_PRODUCT=inkbox npx expo config --json
MOST_PRODUCT=inkbox node scripts/check-ios-release.mjs
```

## 首版功能边界

首版开放文件发布、下载、CID 校验、自动做种、本地知识库、备份恢复和必要节点能力。聊天、语音、远程 daemon、MCP、Web3、后台常驻和推送能力保持关闭，待备案、隐私评估和商店审核分别完成后再逐项打开。

墨盒必须继续接受 `most://<cid>?filename=...`，但下载仍要求用户确认，完成后重算 CID；校验失败不得保存或做种。

## 备案与申报材料

发布前单独归档以下材料，并将版本号、签名指纹和构建产物互相校验：

- 运营主体、联系人、客服和投诉举报入口；
- 隐私政策、使用条款、个人信息请求和安全事件处理流程；
- 应用备案字段、备案号展示位置和备案系统链接；
- Android/iOS 权限、SDK、网络地址和数据流说明；
- 软件著作权、用户手册、图标、截图和应用商店文案；
- Android 签名证书指纹、iOS Team/证书和最终包校验值。

任何新增账号、分析、推送、云服务、中心化日志或后台任务的改动，都必须重新核对隐私政策、权限清单、备案字段和商店 Data Safety/Privacy 信息。
