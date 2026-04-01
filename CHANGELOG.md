# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI/CD workflows for automated testing and building
- GitHub Actions Release workflow for npm auto-publishing on tags
- GitHub Issue templates (Bug Report, Feature Request)
- GitHub Pull Request template
- CONTRIBUTING.md with contribution guidelines
- CODE_OF_CONDUCT.md based on Contributor Covenant v2.0
- Dockerfile for containerized deployment
- docker-compose.yml for local development environment

### Changed
- Updated Node.js version support in CI (now tests on 18, 20, 22)

## [0.0.1] - 2026-01-01

### Added
- Initial release
- P2P file sharing using Hyperswarm/Hyperdrive
- Deterministic CID v1 file publishing
- Large file streaming support (GB+ files)
- CID integrity verification
- Custom `most://` link format for sharing
- Web UI built with React
- Command-line interface
- Unit and integration tests

[unreleased]: https://github.com/most-people/most/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/most-people/most/releases/tag/v0.0.1
