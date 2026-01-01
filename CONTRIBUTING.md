# Contributing to mcp-ssh-tool

Thank you for your interest in contributing to mcp-ssh-tool! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-ssh-tool.git
   cd mcp-ssh-tool
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the project:

   ```bash
   npm run build
   ```

5. Run tests:

   ```bash
   npm test
   ```

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:

```
feat(session): add auto-reconnect capability
fix(auth): handle SSH agent timeout
docs(readme): update installation instructions
```

### Code Style

- Use TypeScript
- Follow ESLint rules
- Format with Prettier
- Add JSDoc comments for public APIs

### Testing

- Write tests for new features
- Maintain test coverage
- Run `npm test` before submitting

### Pull Request Process

1. Create a feature branch
2. Make your changes
3. Add/update tests
4. Update documentation
5. Run linter and tests
6. Submit PR with clear description

## Project Structure

```
mcp-ssh-tool/
├── src/
│   ├── index.ts        # Entry point
│   ├── mcp.ts          # MCP server
│   ├── session.ts      # SSH session management
│   ├── process.ts      # Command execution
│   ├── fs-tools.ts     # File operations
│   ├── ensure.ts       # Package/service management
│   ├── detect.ts       # OS detection
│   ├── ssh-config.ts   # SSH config parsing
│   ├── safety.ts       # Safety warnings
│   ├── types.ts        # TypeScript types
│   ├── errors.ts       # Error handling
│   └── logging.ts      # Logging utilities
├── test/
│   ├── unit/           # Unit tests
│   └── e2e/            # E2E tests
└── dist/               # Compiled output
```

## Adding New Features

### Adding a New MCP Tool

1. Define the schema in `src/types.ts`
2. Add tool definition in `src/mcp.ts` (ListToolsRequestSchema)
3. Implement handler in `src/mcp.ts` (CallToolRequestSchema)
4. Add tests in `test/`
5. Update documentation

### Adding New Dependencies

- Evaluate necessity carefully
- Prefer lightweight packages
- Check for security vulnerabilities
- Update `package.json` appropriately

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
