## SSH MCP Tool (Registry Package)

- **Entrypoint:** `dist/index.js`
- **Transport:** stdio
- **Runtime:** node (>=18)
- **Platforms:** linux, macos, windows
- **Command:** `mcp-ssh-tool`

### Minimal client config

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

Build before use if installing from source:

```bash
npm install
npm run build
```
