## MCP SSH Tool - Registry Submission

- **Repository:** https://github.com/oaslananka/mcp-ssh-tool
- **NPM Package:** mcp-ssh-tool
- **Command:** `mcp-ssh-tool`
- **Entrypoint:** `dist/index.js`
- **Runtime:** node (>=18)
- **Transport:** stdio
- **Supported Platforms:** linux, macos, windows
- **Capabilities:** tools (true), resources (false), prompts (false)

### Minimal MCP client config

```jsonc
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

### Notes
- Build before use when installing from source: `npm install && npm run build`.
- Uses stdio transport; no network listeners are opened by the server itself.
- Logs redact passwords/private keys/passphrases/sudo passwords by default.
