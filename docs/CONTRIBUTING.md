# 贡献指南

感谢你对 MostBox 的关注！我们欢迎各种形式的贡献，包括但不限于代码优化、Bug 修复、文档完善、功能建议等。

## 行为准则

参与本项目即表示你同意遵守我们的行为准则。请阅读 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) 了解详情。

## 开发环境设置

### 1. 克隆仓库

```bash
git clone https://github.com/most-box/most.git
cd most
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm start
```

浏览器访问 `http://localhost:1976`

### 4. 运行测试

```bash
# 运行全部测试
npm test

# 只运行单元测试
npm run test:unit
```

## 代码规范

### 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型**：

| Type     | 说明                   |
| -------- | ---------------------- |
| feat     | 新功能                 |
| fix      | Bug 修复               |
| docs     | 文档变更               |
| style    | 代码格式（不影响功能） |
| refactor | 重构                   |
| test     | 测试相关               |
| chore    | 构建/工具变更          |

**示例**：

```
feat(core): 添加大文件分片上传支持

- 支持 GB 级别文件流式上传
- 优化内存占用

Closes #123
```

### 代码风格

- 使用 ES Module (ESM)
- 使用有意义的变量命名
- 添加必要的注释说明复杂逻辑
- 运行 `npm test` 确保测试通过

## 分支策略

```
main        # 稳定版本，用于发布
develop     # 开发版本，合并 feature 分支
feature/*   # 功能分支，如 feature/new-ui
bugfix/*    # Bug 修复分支，如 bugfix/upload-error
```

### 工作流程

1. 从 `develop` 创建功能分支：`git checkout -b feature/your-feature`
2. 开发并测试
3. 提交代码：`git commit -m "feat(scope): description"`
4. 推送到远程：`git push origin feature/your-feature`
5. 创建 Pull Request

## Pull Request 流程

### 创建 PR

1. Fork 本仓库
2. 从 `develop` 分支创建新分支
3. 完成开发并提交
4. 打开 Pull Request 到 `most-box/develop`

### PR 描述模板

```markdown
## 描述

<!-- 简要说明本次修改的内容 -->

## 关联 Issue

<!-- 关联的问题，如 Closes #123 -->

## 测试

<!-- 描述你如何测试这个修改 -->

## 检查清单

- [ ] 代码遵循现有代码风格
- [ ] 添加了必要的测试
- [ ] 测试全部通过
- [ ] 文档已更新（如需要）
```

### Code Review

- 所有 PR 需要至少 1 人 Review 才能合并
- 请及时回复 Review 意见
- 合并前确保所有 Conversation 已解决

## 问题反馈

- **Bug 报告**：请使用 [Bug Report](../../issues/new?template=bug_report.md) 模板
- **功能请求**：请使用 [Feature Request](../../issues/new?template=feature_request.md) 模板
- **技术问题**：请使用 [Question](../../issues/new?template=question.md) 模板

## 许可证

参与本项目即表示你同意你的贡献将遵循 MIT 许可证。
