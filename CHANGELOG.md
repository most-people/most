# 更新日志

本项目所有重要变更将记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [未发布]

### 新增
- GitHub Actions CI/CD 工作流，用于自动化测试和构建
- GitHub Actions Release 工作流，支持标签触发 npm 自动发布
- GitHub Issue 模板（Bug 报告、功能请求）
- GitHub Pull Request 模板
- CONTRIBUTING.md 贡献指南
- CODE_OF_CONDUCT.md，基于贡献者公约 v2.0
- Dockerfile 用于容器化部署
- docker-compose.yml 用于本地开发环境

### 变更
- 更新 CI 中的 Node.js 版本支持（现测试 18、20、22）

## [0.0.1] - 2026-01-01

### 新增
- 首次发布
- 基于 Hyperswarm/Hyperdrive 的 P2P 文件分享
- 确定性 CID v1 文件发布
- 大文件流式传输支持（GB 级以上）
- CID 完整性验证
- 自定义 `most://` 链接格式用于分享
- 基于 React 的 Web UI
- 命令行界面
- 单元测试与集成测试

[未发布]: https://github.com/most-people/most/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/most-people/most/releases/tag/v0.0.1
