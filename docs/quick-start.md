# MostBox MVP Quick Start

> 目标：用最少步骤验证“发布文件 -> 复制 `most://` 链接 -> 下载者下载并校验 -> 下载者继续做种”的闭环。

## 一、准备

本地源码验收需要两个进程：

```bash
npm install
node server/index.js
```

另开一个终端：

```bash
npm run dev
```

打开：

| 入口   | 地址                                     | 用途                              |
| ------ | ---------------------------------------- | --------------------------------- |
| 主应用 | `http://localhost:3000/app/`             | 发布文件、复制链接、下载文件      |
| 管理台 | `http://localhost:3000/admin/`           | 查看节点状态、holding、容量和日志 |
| API    | `http://localhost:1976/api/openapi.json` | daemon HTTP API                   |

发布包路径：正式安装包从 `/download` 或 GitHub Releases latest 下载；本地构建使用 `npm run electron:build:win`、`npm run electron:build:mac` 或 `npm run electron:build:linux`。

## 二、发布者路径

1. 启动桌面端，或按上面的源码方式启动后打开 `/app/`。
2. 点击“发布文件”，选择一个测试文件。
3. 发布成功后复制 `most://<cid>?filename=...` 分享链接。
4. 保持应用或 daemon 在线。
5. 打开 `/admin/`，确认 holding 列表里能看到对应 CID，状态为 active 或正在 joining。

API 验证：

```bash
printf 'hello mostbox\n' > /tmp/mostbox-sample.txt
curl -F "file=@/tmp/mostbox-sample.txt" http://localhost:1976/api/publish
curl http://localhost:1976/api/node/holdings
```

成功时，发布接口返回 `success: true`、`cid` 和 `link`，holding 接口能看到同一个 CID。

## 三、下载者路径

1. 在另一台机器或另一个 MostBox 节点启动桌面端/daemon。
2. 打开 `/app/`，点击“下载文件”。
3. 粘贴发布者给出的 `most://` 链接。
4. 先检测链接可用性，再开始下载。
5. 下载完成后确认界面显示成功；该节点会自动写入 holding 并继续做种。

API 验证：

```bash
curl -X POST http://localhost:1976/api/download/check \
  -H "Content-Type: application/json" \
  -d '{"link":"most://<cid>?filename=<name>"}'

curl -X POST http://localhost:1976/api/p2p/pull \
  -H "Content-Type: application/json" \
  -d '{"link":"most://<cid>?filename=<name>","timeout":60000}'
```

成功时，下载会重算 UnixFS CID v1；只有 CID 与链接一致才保存文件并加入做种列表。

## 四、daemon 路径

源码方式启动 daemon：

```bash
node server/index.js
```

常用检查：

```bash
curl http://localhost:1976/api/node/status
curl http://localhost:1976/api/node/config
curl http://localhost:1976/api/node/holdings
curl http://localhost:1976/api/node/logs
```

配置数据目录和容量后，重启 daemon，再查看 `/api/node/holdings` 或 `/admin/`。已持有 CID 应自动恢复 join topic。

## 五、MVP 自动验收命令

完整协议回归：

```bash
npm run test:protocol
```

只跑“A 发布、B/C 下载做种、A 退出、D 仍可从下载者种子下载”的本地接力测试：

```bash
node --test --test-name-pattern "pulls through local seed nodes after the uploader stops" server/tests/integration/engine.test.js
```

这个测试会启动多个本地 `MostBoxEngine`，让 uploader 发布文件，seed-b 和 seed-c 拉取后成为种子，再停止 uploader，最后验证 downloader 仍能从下载者种子拉取并通过 CID 校验。

## 六、通过标准

| 场景        | 通过标准                                       |
| ----------- | ---------------------------------------------- |
| 发布者      | 能得到 `most://` 链接，管理台看到对应 holding  |
| 下载者      | 能凭链接下载，CID 校验通过，下载后自动做种     |
| daemon 重启 | 已持有 CID 自动恢复 join topic                 |
| 发布者退出  | 至少一个下载者在线做种时，新下载者仍可完成下载 |

如果下载失败，优先检查：链接是否完整、发布者或下载者种子是否在线、端口和防火墙是否允许 P2P 连接、管理台日志中是否出现 `PEER_NOT_FOUND` 或 `INTEGRITY_ERROR`。
