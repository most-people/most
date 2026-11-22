# 参与贡献

MostBox 的最高目标是成为能脱离创始人长期存在的公共协议。贡献应帮助第三方理解、实现、运行和维护协议，保持聊天与文件传输边界；云盘、付费存储市场和上链存储协议不在本项目范围内。

## 独立实现与协议维护

- [协议规范](docs/protocol/README.md)与测试向量是独立实现入口，源码中的说明和口头答复不能代替规范；发现歧义请记录并补充可复现样例。
- 可复用公开上游协议库；仅封装或复制本仓库生产核心的客户端不作为独立实现验收，具体范围见[公共协议独立性验收](docs/acceptance.md#公共协议独立性验收)。
- 遵守仓库许可和既有频道授权规则的兼容实现、自行分发与节点运营，无需创始人批准。可以使用自己的仓库、域名和发行签名；不依赖官方账号或私钥。
- 协议提案公开说明需求、线上字节变化、支持版本、旧节点与旧数据处置、测试向量和同版本互通证据；合入参考仓库由维护者公开说明决定与理由，互通性以指定版本的公开规范和证据检查。
- 部署、恢复、构建和发布中的隐性步骤须补回公开文档，便于第三方接手；新维护权限随实际贡献逐步交接，不预设委员会或投票系统。

## 从哪里开始

- 使用问题和方案讨论请前往 [GitHub Discussions](https://github.com/most-people/most/discussions)
- 可复现的 Bug 请提交 [Bug 报告](https://github.com/most-people/most/issues/new/choose)
- 未公开的安全问题请通过 [Private Vulnerability Reporting](https://github.com/most-people/most/security/advisories/new) 报告
- 较大的行为或协议改动，请先发起 Discussion，明确问题、范围与验收标准

## 本地开发

根项目建议使用 Node.js >= 24：

```bash
npm install
npm run server
```

另开一个终端运行：

```bash
npm start
```

前端默认运行在 `http://localhost:2020`，daemon 默认运行在 `http://localhost:1976`。

Android 子包建议使用 Node.js >= 24，并在 `app/` 目录中执行安装、测试和构建命令。

## 修改要求

- 使用 ESM，本地导入带 `.js` 扩展名
- 使用 2 空格缩进、单引号，默认不写分号
- 只修改与问题直接相关的代码，不顺手重构无关模块
- 修改 CID、发布、下载、链接解析或 P2P pull 时，保持目标版本的内容身份、完整性与权限不变量；早期不承担历史版本兼容，允许按[envelope §7](docs/protocol/v2/envelope.md#7-协议演进规则)设计不兼容升级，同步规范、版本边界与测试，不默认添加兼容分支或旧数据迁移
- 用户界面文案通过 i18n 消息键维护，前端样式使用 CSS class
- 新行为需要覆盖对应的 `node:test` 回归；修复 Bug 时优先添加能够复现问题的测试

完整的代码结构、协议边界和开发约定见 [AGENTS.md](AGENTS.md)。

## 验证

根据改动范围运行最小必要检查：

```bash
npm run format
npm run lint
npm test
```

协议相关改动还需运行：

```bash
npm run test:protocol
```

前端结构或样式相关改动还需运行：

```bash
npm run typecheck
npm run typecheck:strict-router
npm run test:frontend
```

提交 Pull Request 时，请说明目标、行为变化、验证命令和结果。涉及界面的改动请附桌面与移动端截图；无法执行的检查需要说明原因和剩余风险。

参与社区即表示你同意遵守 [贡献者公约](docs/CODE_OF_CONDUCT.md)。
