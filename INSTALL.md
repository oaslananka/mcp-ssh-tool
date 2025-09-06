# Installation Guide - mcp-ssh-tool

## Quick Installation

### NPM Installation (Recommended)

Install globally to use as a command-line tool:

```bash
npm install -g mcp-ssh-tool
```

Verify installation:

```bash
mcp-ssh-tool --version
```

## VS Code Setup

### 1. Install GitHub Copilot Extension

Make sure you have the GitHub Copilot extension installed in VS Code.

### 2. Configure MCP Server

Create or edit your MCP configuration file. You can do this in two ways:

#### Option A: VS Code Settings

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "MCP"
3. Add the following configuration:

```json
{
  "mcp.servers": {
    "ssh-tool": {
      "type": "stdio",
      "command": "mcp-ssh-tool",
      "args": []
    }
  }
}
```

#### Option B: MCP Configuration File

Create a `mcp.json` file in your workspace or user settings directory:

```json
{
  "mcpServers": {
    "ssh-tool": {
      "command": "mcp-ssh-tool",
      "args": [],
      "transport": {
        "type": "stdio"
      }
    }
  }
}
```

### 3. Restart VS Code

After configuring, restart VS Code to load the MCP server.

## Usage with GitHub Copilot

Once configured, you can use natural language commands with GitHub Copilot:

### Basic SSH Operations
- "Connect to server 192.168.1.100 as admin using SSH key"
- "Open SSH session to my production server"
- "Close all SSH connections"

### Remote Commands
- "Run 'systemctl status nginx' on the server"
- "Check disk usage on remote server"
- "Execute 'whoami' command remotely"

### File Operations
- "Read the content of /etc/nginx/nginx.conf"
- "Write 'Hello World' to /tmp/test.txt on server"
- "List files in /var/log directory"
- "Check if /etc/config.ini exists"

### System Administration
- "Install htop package on Ubuntu server"
- "Start nginx service"
- "Restart apache2 service"
- "Add line 'PasswordAuthentication no' to /etc/ssh/sshd_config"

## Prerequisites

### System Requirements
- Node.js 20 or later
- VS Code with GitHub Copilot extension
- SSH access to target systems

### SSH Authentication Setup

#### SSH Key Authentication (Recommended)

1. Generate SSH key pair (if you don't have one):
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

2. Copy public key to target server:
```bash
ssh-copy-id user@server-ip
```

3. Place your private key in standard location:
- `~/.ssh/id_ed25519` (preferred)
- `~/.ssh/id_rsa`
- `~/.ssh/id_ecdsa`

#### Password Authentication

While supported, SSH key authentication is more secure:
```bash
# The tool will prompt for password when needed
```

#### SSH Agent

For additional security, use SSH agent:
```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add your SSH key
ssh-add ~/.ssh/id_ed25519
```

## Troubleshooting

### Common Issues

#### SSH Connection Problems
```bash
# Test SSH connection manually first
ssh user@hostname

# Check SSH key permissions
chmod 600 ~/.ssh/id_*
chmod 700 ~/.ssh
```

#### MCP Server Not Loading
1. Check VS Code output panel for errors
2. Verify MCP configuration syntax
3. Ensure `mcp-ssh-tool` is in your PATH
4. Restart VS Code completely

#### Permission Denied
```bash
# Fix SSH key permissions
chmod 600 ~/.ssh/private_key
chmod 644 ~/.ssh/public_key.pub
```

#### Command Not Found
```bash
# Check if mcp-ssh-tool is installed globally
which mcp-ssh-tool

# Reinstall if needed
npm uninstall -g mcp-ssh-tool
npm install -g mcp-ssh-tool
```

### Debug Mode

Enable debug logging by setting environment variable:
```bash
LOG_LEVEL=debug mcp-ssh-tool
```

## Security Best Practices

### SSH Security
- Use SSH keys instead of passwords
- Regularly rotate SSH keys
- Use strong passphrases for SSH keys
- Limit SSH access by IP when possible

### Key Management
- Never commit SSH private keys to version control
- Use SSH agent for key management
- Monitor SSH access logs regularly

### MCP Security
- Only connect to trusted servers
- Review commands before execution
- Use least privilege principle for SSH users

## Development Setup

### Install from Source

```bash
# Clone repository
git clone https://github.com/oaslananka/mcp-ssh-tool.git
cd mcp-ssh-tool

# Install dependencies
npm install

# Build project
npm run build

# Link for global use
npm link
```

### Running Tests

```bash
# Unit tests
npm test

# E2E tests (requires SSH server)
RUN_SSH_E2E=1 npm run e2e
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | info |
| `SSH_MCP_DAEMON` | Run in daemon mode | false |
| `SSH_MCP_ONESHOT` | Exit after processing one command | false |

## Support

### Getting Help
- GitHub Issues: https://github.com/oaslananka/mcp-ssh-tool/issues
- Documentation: https://github.com/oaslananka/mcp-ssh-tool#readme

### Contributing
- Fork the repository
- Create a feature branch
- Submit a pull request

## License

MIT License - Copyright (c) 2025 Osman Aslan (oaslananka)

See LICENSE file for full license text.
