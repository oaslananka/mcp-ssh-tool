# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SSH config file parsing (`~/.ssh/config` support)
- `ssh.listSessions` tool to list all active sessions
- `ssh.ping` tool to check connection health
- Safety warning system for dangerous commands (non-blocking)
- Auto-reconnect capability for dropped connections
- Command timeout support per execution
- Port forwarding support (local/remote tunnels)
- Jump host (ProxyJump) support
- Streaming output for long-running commands
- File transfer progress tracking
- Docker-based test environment
- GitHub Actions CI/CD pipeline
- Comprehensive documentation and examples

### Changed
- Improved error messages with actionable hints
- Enhanced session management with heartbeat monitoring

### Security
- Added safety warnings for potentially dangerous commands
- Improved sensitive data redaction in logs

## [1.0.0] - 2025-01-01

### Added
- Initial release
- SSH session management (open/close)
- Command execution (`proc.exec`, `proc.sudo`)
- File system operations (read, write, stat, list, mkdir, rm, rename)
- Package management (`ensure.package`)
- Service management (`ensure.service`)
- Line-in-file management (`ensure.linesInFile`)
- Patch application (`patch.apply`)
- OS detection (`os.detect`)
- Multiple authentication methods (password, key, agent)
- SSH key auto-discovery
- LRU session cache with TTL
- Sensitive data redaction in logs

[Unreleased]: https://github.com/oaslananka/mcp-ssh-tool/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/oaslananka/mcp-ssh-tool/releases/tag/v1.0.0
