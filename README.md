# mcp-ssh-tool

[![npm version](https://badge.fury.io/js/mcp-ssh-tool.svg)](https://badge.fury.io/js/mcp-ssh-tool)
[![GitHub stars](https://img.shields.io/github/stars/oaslananka/mcp-ssh-tool.svg)](https://github.com/oaslananka/mcp-ssh-tool/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) SSH client server that provides autonomous SSH operations for GitHub Copilot and VS Code. Enable natural language SSH automation without manual prompts or GUI interactions.

## Quick Start

### Install

- Global install (recommended): `npm install -g mcp-ssh-tool`
- One-off run: `npx mcp-ssh-tool`

### MCP Client Configuration (VS Code / Claude Desktop / others)

Add to your MCP configuration (`mcp.json`, `.vscode/mcp.json`, or the Claude Desktop MCP config):

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "stdio",
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

### Usage Examples

Once configured, you can use natural language with your MCP client:

- **SSH Connection**: "Connect to server 192.168.1.100 as admin using SSH key"
- **File Operations**: "Read the content of /etc/nginx/nginx.conf on the server"
- **Command Execution**: "Run 'systemctl status nginx' on the remote server"
- **Package Management**: "Install htop package on Ubuntu server"
- **Service Control**: "Restart the nginx service"

### Available Tools

- `ssh.openSession` - Establish SSH connection with various auth methods
- `ssh.closeSession` - Close SSH session
- `ssh.listSessions` - List all active SSH sessions
- `ssh.ping` - Check if a session is alive and responsive
- `ssh.listConfiguredHosts` - List hosts from ~/.ssh/config
- `ssh.resolveHost` - Resolve host alias from SSH config
- `proc.exec` - Execute commands remotely (with optional timeout)
- `proc.sudo` - Execute commands with sudo privileges
- `fs.read`, `fs.write`, `fs.list`, `fs.stat`, `fs.mkdirp`, `fs.rmrf`, `fs.rename` - File system operations
- `ensure.package` - Package management
- `ensure.service` - Service control
- `ensure.linesInFile` - File line management
- `patch.apply` - Apply patches to files
- `os.detect` - System information detection

## Overview

The SSH MCP Server acts as a bridge between GitHub Copilot and remote systems via SSH. It supports:

- **Non-interactive SSH operations** - No prompts or GUI interactions
- **Multiple authentication methods** - Password, SSH keys, or SSH agent
- **Session management** - Automatic connection pooling with TTL and LRU eviction
- **File system operations** - Read, write, list, and manage remote files via SFTP
- **Process execution** - Run commands and sudo operations remotely
- **High-level automation** - Package management, service control, and configuration management
- **Security** - Automatic redaction of sensitive data in logs

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  GitHub Copilot │────│  SSH MCP Server  │────│  Remote Systems │
│     / VS Code   │    │                  │    │   (via SSH)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │ MCP stdio protocol    │ Session management    │ SSH + SFTP
         │                       │ LRU cache + TTL       │
         │                       │ Auth strategies       │
```

## Installation

### Prerequisites

- Node.js ≥ 18 (LTS)
- SSH access to target systems
- SSH keys or credentials for authentication

### Install from npm

```bash
npm install -g mcp-ssh-tool
```

### Build from source

```bash
git clone <repository-url>
cd mcp-ssh-tool
npm install
npm run build
npm link
```

### Platform Notes

- **Linux / macOS:** Uses POSIX shell wrappers with safe quoting. Default temp directory: `/tmp`.
- **Windows targets:** Requires OpenSSH server/agent; key discovery checks `C:\\Users\\<you>\\.ssh\\`. Commands are wrapped for PowerShell-safe execution. Package/service helpers are intentionally disabled on Windows targets.
- **Host keys:** Host key checking is relaxed by default. Set `STRICT_HOST_KEY_CHECKING=true` and optionally `KNOWN_HOSTS_PATH` to enforce verification.

## VS Code Copilot Integration

### User-level Configuration (Recommended)

Open VS Code and press `Ctrl+Shift+P`, then run **"MCP: Open User Configuration"**.

Add to your `mcp.json`:

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "stdio",
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

### Workspace-level Configuration

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "ssh-mcp": {
      "type": "stdio",
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

### Verification

1. Restart VS Code
2. Open Copilot Chat
3. The SSH MCP tools should appear in the available tools list
4. Test with: *"Connect to 192.168.1.100 as admin and run 'uname -a'"*

## Usage Examples

### Basic Connection and Command Execution

```
"Connect to 10.11.12.13 as deployer with password 'mypass' and run 'df -h'"
```

### File Operations

```
"Connect to server.example.com as admin, read /etc/nginx/nginx.conf and show me the server blocks"
```

### System Administration

```
"Connect to 192.168.1.50 as root, install htop package, start nginx service, and list /var/www contents"
```

### Configuration Management

```
"Connect to web-server as admin, add these lines to /etc/hosts:
192.168.1.10 db-server
192.168.1.20 cache-server
Then restart networking service"
```

## API Reference

### Session Management

#### `ssh.openSession`

Opens a new SSH session with authentication.

**Input:**

```json
{
  "host": "example.com",
  "username": "admin",
  "port": 22,
  "auth": "auto",
  "password": "optional",
  "privateKey": "optional-inline-key",
  "privateKeyPath": "optional-path",
  "passphrase": "optional",
  "useAgent": false,
  "readyTimeoutMs": 20000,
  "ttlMs": 900000
}
```

**Output:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "host": "example.com",
  "username": "admin",
  "expiresInMs": 900000
}
```

#### `ssh.closeSession`

Closes an active SSH session.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1"
}
```

**Output:**

```json
{
  "ok": true
}
```

### Process Execution

#### `proc.exec`

Executes a command on the remote system.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "command": "ls -la /home",
  "cwd": "/tmp",
  "env": {"DEBUG": "1"}
}
```

**Output:**

```json
{
  "code": 0,
  "stdout": "total 12\ndrwxr-xr-x 3 root root 4096...",
  "stderr": "",
  "durationMs": 245
}
```

#### `proc.sudo`

Executes a command with sudo privileges.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "command": "systemctl restart nginx",
  "password": "sudo-password",
  "cwd": "/etc"
}
```

### File System Operations

#### `fs.read`

Reads a file from the remote system.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "path": "/etc/hosts",
  "encoding": "utf8"
}
```

**Output:**

```json
{
  "data": "127.0.0.1 localhost\n::1 localhost\n..."
}
```

#### `fs.write`

Writes data to a file (atomic operation using temp file + rename).

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "path": "/tmp/config.txt",
  "data": "server_name example.com;\nlisten 80;",
  "mode": 644
}
```

#### `fs.stat`

Gets file or directory statistics.

**Output:**

```json
{
  "size": 1024,
  "mtime": "2024-01-15T10:30:00.000Z",
  "mode": 33188,
  "type": "file"
}
```

#### `fs.list`

Lists directory contents with pagination.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "path": "/var/log",
  "page": 0,
  "limit": 50
}
```

**Output:**

```json
{
  "entries": [
    {
      "name": "nginx",
      "type": "directory",
      "size": 4096,
      "mtime": "2024-01-15T10:30:00.000Z",
      "mode": 16877
    }
  ],
  "nextToken": "1"
}
```

#### `fs.mkdirp`

Creates directories recursively (mkdir -p equivalent).

#### `fs.rmrf`

Removes files or directories recursively (rm -rf equivalent).

#### `fs.rename`

Renames or moves files and directories.

### High-Level Operations

#### `ensure.package`

Ensures a package is installed using the system's package manager.

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "name": "nginx",
  "sudoPassword": "optional"
}
```

**Output:**

```json
{
  "ok": true,
  "pm": "apt",
  "code": 0,
  "stdout": "Package nginx is already installed",
  "stderr": ""
}
```

#### `ensure.service`

Manages system services (systemd or traditional service).

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "name": "nginx",
  "state": "started",
  "sudoPassword": "optional"
}
```

#### `ensure.linesInFile`

Ensures specific lines exist in a file (idempotent).

**Input:**

```json
{
  "sessionId": "ssh-1645123456789-1",
  "path": "/etc/hosts",
  "lines": ["192.168.1.10 db-server", "192.168.1.20 cache-server"],
  "createIfMissing": true,
  "sudoPassword": "optional"
}
```

#### `patch.apply`

Applies a patch to a file using the `patch` command.

#### `os.detect`

Detects operating system information, package manager, and init system.

**Output:**

```json
{
  "platform": "linux",
  "distro": "ubuntu",
  "version": "22.04",
  "arch": "x86_64",
  "shell": "bash",
  "packageManager": "apt",
  "init": "systemd",
  "defaultShell": "bash",
  "tempDir": "/tmp"
}
```

## Authentication

The server supports multiple authentication methods with automatic fallback:

### Authentication Strategy Priority

1. **Password** (if provided)
2. **SSH Key** (inline → path → auto-discovery)
3. **SSH Agent** (if available)

### SSH Key Auto-Discovery

The server automatically searches for SSH keys in:

- `~/.ssh/id_ed25519`
- `~/.ssh/id_rsa`
- `~/.ssh/id_ecdsa`
- `~/.ssh/id_dsa`

Custom key directory: Set `SSH_DEFAULT_KEY_DIR` environment variable.

### Examples

**Password Authentication:**

```json
{
  "host": "server.com",
  "username": "admin",
  "auth": "password",
  "password": "secret"
}
```

**SSH Key (inline):**

```json
{
  "host": "server.com",
  "username": "admin",
  "auth": "key",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "passphrase": "optional"
}
```

**SSH Key (file path):**

```json
{
  "host": "server.com",
  "username": "admin",
  "auth": "key",
  "privateKeyPath": "/home/user/.ssh/id_rsa"
}
```

**SSH Agent:**

```json
{
  "host": "server.com",
  "username": "admin",
  "auth": "agent"
}
```

## Configuration

### Environment Variables

- `LOG_LEVEL` - Logging level (`error`, `warn`, `info`, `debug`)
- `SSH_DEFAULT_KEY_DIR` - Custom SSH key directory
- `STRICT_HOST_KEY_CHECKING` - Enable strict host key checking
- `KNOWN_HOSTS_PATH` - Custom known_hosts file path

### Default Settings

- **Connection timeout:** 20 seconds
- **Session TTL:** 15 minutes
- **Max concurrent sessions:** 20
- **Host key checking:** Relaxed (disabled by default)

## Error Codes

The server returns structured error codes for machine-readable error handling:

- **EAUTH** - Authentication failed
- **ECONN** - Connection error
- **ETIMEOUT** - Operation timeout
- **ENOSUDO** - Sudo operation failed
- **EPMGR** - Package manager not found
- **EFS** - File system operation failed
- **EPATCH** - Patch application failed
- **EBADREQ** - Invalid request parameters

Each error includes:

- `name`: Error class name
- `code`: Machine-readable error code
- `message`: Human-readable error message
- `hint`: Optional suggestion for resolution

## Security Features

### Data Redaction

Sensitive data is automatically redacted from logs:

- Passwords
- Private keys
- Passphrases
- Sudo passwords
- SSH agent socket paths

### Connection Security

- Configurable host key verification
- Support for known_hosts files
- Connection timeout enforcement
- Automatic session cleanup

### Session Management

- TTL-based session expiration
- LRU cache eviction
- Graceful connection cleanup
- No persistent credential storage

## Development

### Setup

```bash
git clone <repository-url>
cd mcp-ssh-tool
npm install
```

### Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode compilation
npm run test       # Run unit tests
npm run e2e        # Run E2E tests (requires RUN_SSH_E2E=1)
npm run lint       # Type-check (no emit)
npm run format     # Run Prettier
npm run test:coverage
npm run docs
```

### Testing

**Unit Tests:**

```bash
npm test
```

**E2E Tests (optional):**

```bash
RUN_SSH_E2E=1 npm run e2e
```

## License

MIT License

Copyright (c) 2025 Osman Aslan (oaslananka)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

E2E tests require a local Docker container or SSH server for testing.

## Contributing

1. Follow TypeScript and ESLint rules
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Use conventional commit messages

## License

MIT License - see LICENSE file for details.

## Related Links

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [VS Code MCP Guide](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview) - VS Code Copilot extensibility
- [GitHub Copilot](https://github.com/features/copilot) - GitHub Copilot documentation
