# Contributing to MostBox

Thank you for your interest in contributing to MostBox!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/most.git
   cd most
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

```bash
npm run build    # Build the project
npm start        # Build and run the server
npm test         # Run all tests
npm run test:unit # Run unit tests only
```

## Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Follow existing patterns in the codebase

## Making Changes

1. Make your changes in your feature branch
2. Write or update tests as needed
3. Ensure all tests pass: `npm test`
4. Commit your changes with a clear message:
   ```bash
   git commit -m "Add: brief description of changes"
   ```
5. Push to your fork and create a Pull Request

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `Add:` New feature
- `Fix:` Bug fix
- `Update:` Update existing functionality
- `Remove:` Remove feature
- `Refactor:` Code refactoring
- `Docs:` Documentation changes
- `Test:` Test changes
- `Chore:` Maintenance tasks

Example:
```
Add: implement file sharing via P2P network

- Add hyperswarm connection management
- Implement CID-based file discovery
- Add WebSocket for real-time updates
```

## Pull Request Process

1. Update documentation if needed
2. Update the CHANGELOG.md with your changes
3. Ensure all CI checks pass
4. Request review from a maintainer
5. Once approved, your PR will be merged

## Reporting Issues

- Use the [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.yml)
- Search existing issues first
- Include version, OS, and relevant logs
- Provide minimal reproduction steps

## Suggesting Features

- Use the [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.yml)
- Describe the problem you're trying to solve
- Explain your proposed solution
- Consider backward compatibility

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
