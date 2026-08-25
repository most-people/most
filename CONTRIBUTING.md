# 参与贡献

感谢你帮助改进 MostBox。提交代码前，请先确认改动服务于当前产品边界，而不是把 MostBox 扩展为云盘、付费存储市场或上链存储协议。

## 从哪里开始

- 使用问题和方案讨论请前往 [GitHub Discussions](https://github.com/most-people/most/discussions)
- 可复现的 Bug 请提交 [Bug 报告](https://github.com/most-people/most/issues/new/choose)
- 未公开的安全问题请通过 [Private Vulnerability Reporting](https://github.com/most-people/most/security/advisories/new) 报告
- 较大的行为或协议改动，请先发起 Discussion，明确问题、范围与验收标准

## 本地开发

根项目建议使用 Node.js >= 22.12：

```bash
npm install
npm run server
```

另开一个终端运行：

```bash
npm start
```

前端默认运行在 `http://localhost:3000`，daemon 默认运行在 `http://localhost:1976`。

Android 子包建议使用 Node.js >= 22.13，并在 `mobile/app/` 目录中执行安装、测试和构建命令。

## 修改要求

- 使用 ESM，本地导入带 `.js` 扩展名
- 使用 2 空格缩进、单引号，默认不写分号
- 只修改与问题直接相关的代码，不顺手重构无关模块
- 修改 CID、发布、下载、链接解析或 P2P pull 时，不得改变 `most://`、CID 或 topic 不变量
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
