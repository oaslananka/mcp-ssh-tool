import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import our modules
import { sessionManager } from './session.js';
import { execCommand, execSudo } from './process.js';
import {
  readFile,
  writeFile,
  statFile,
  listDirectory,
  makeDirectories,
  removeRecursive,
  renameFile
} from './fs-tools.js';
import {
  ensurePackage,
  ensureService,
  ensureLinesInFile,
  applyPatch
} from './ensure.js';
import { logger, redactSensitiveData } from './logging.js';
import { getConfiguredHosts, resolveSSHHost } from './ssh-config.js';
import { addSafetyWarningToResult } from './safety.js';
import { execWithStreaming } from './streaming.js';
import { createLocalForward, createRemoteForward, closeTunnel, listTunnels } from './tunnel.js';
import { uploadFileWithProgress, downloadFileWithProgress } from './transfer.js';
import {
  ConnectionParamsSchema,
  SessionIdSchema,
  ExecSchema,
  SudoSchema,
  FSReadSchema,
  FSWriteSchema,
  FSStatSchema,
  FSListSchema,
  FSPathSchema,
  FSRenameSchema,
  EnsurePackageSchema,
  EnsureServiceSchema,
  EnsureLinesSchema,
  PatchApplySchema
} from './types.js';

const TOOL_ALIASES: Record<string, string> = {
  ssh_openSession: 'ssh.openSession',
  ssh_closeSession: 'ssh.closeSession',
  proc_exec: 'proc.exec',
  proc_sudo: 'proc.sudo',
  fs_read: 'fs.read',
  fs_write: 'fs.write',
  fs_stat: 'fs.stat',
  fs_list: 'fs.list',
  fs_mkdirp: 'fs.mkdirp',
  fs_rmrf: 'fs.rmrf',
  fs_rename: 'fs.rename',
  ensure_package: 'ensure.package',
  ensure_service: 'ensure.service',
  ensure_linesInFile: 'ensure.linesInFile',
  patch_apply: 'patch.apply',
  os_detect: 'os.detect',
  ssh_listSessions: 'ssh.listSessions',
  ssh_ping: 'ssh.ping',
  ssh_listConfiguredHosts: 'ssh.listConfiguredHosts',
  ssh_resolveHost: 'ssh.resolveHost'
};

/**
 * SSH MCP Server implementation
 */
export class SSHMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'ssh-mcp-server',
        version: '1.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Session management
          {
            name: 'ssh.openSession',
            description: 'Opens a new SSH session with authentication',
            inputSchema: {
              type: 'object',
              properties: {
                host: { type: 'string', description: 'SSH server hostname or IP' },
                username: { type: 'string', description: 'SSH username' },
                port: { type: 'number', description: 'SSH port (default: 22)' },
                auth: {
                  type: 'string',
                  enum: ['auto', 'password', 'key', 'agent'],
                  description: 'Authentication method (default: auto)'
                },
                password: { type: 'string', description: 'Password for authentication' },
                privateKey: { type: 'string', description: 'Inline private key content' },
                privateKeyPath: { type: 'string', description: 'Path to private key file' },
                passphrase: { type: 'string', description: 'Passphrase for encrypted private key' },
                useAgent: { type: 'boolean', description: 'Use SSH agent for authentication' },
                readyTimeoutMs: { type: 'number', description: 'Connection timeout in milliseconds (default: 20000)' },
                ttlMs: { type: 'number', description: 'Session TTL in milliseconds (default: 900000)' }
              },
              required: ['host', 'username']
            }
          },
          {
            name: 'ssh.closeSession',
            description: 'Closes an SSH session',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'Session ID to close' }
              },
              required: ['sessionId']
            }
          },

          // Process execution
          {
            name: 'proc.exec',
            description: 'Executes a command on the remote system',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                command: { type: 'string', description: 'Command to execute' },
                cwd: { type: 'string', description: 'Working directory' },
                env: { type: 'object', description: 'Environment variables' }
              },
              required: ['sessionId', 'command']
            }
          },
          {
            name: 'proc.sudo',
            description: 'Executes a command with sudo privileges',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                command: { type: 'string', description: 'Command to execute with sudo' },
                password: { type: 'string', description: 'Sudo password' },
                cwd: { type: 'string', description: 'Working directory' }
              },
              required: ['sessionId', 'command']
            }
          },

          // File system operations
          {
            name: 'fs.read',
            description: 'Reads a file from the remote system',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'File path to read' },
                encoding: { type: 'string', description: 'File encoding (default: utf8)' }
              },
              required: ['sessionId', 'path']
            }
          },
          {
            name: 'fs.write',
            description: 'Writes data to a file on the remote system',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'File path to write' },
                data: { type: 'string', description: 'Data to write to file' },
                mode: { type: 'number', description: 'File permissions mode' }
              },
              required: ['sessionId', 'path', 'data']
            }
          },
          {
            name: 'fs.stat',
            description: 'Gets file or directory statistics',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'Path to stat' }
              },
              required: ['sessionId', 'path']
            }
          },
          {
            name: 'fs.list',
            description: 'Lists directory contents',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'Directory path to list' },
                page: { type: 'number', description: 'Page number for pagination' },
                limit: { type: 'number', description: 'Maximum items per page (default: 100)' }
              },
              required: ['sessionId', 'path']
            }
          },
          {
            name: 'fs.mkdirp',
            description: 'Creates directories recursively',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'Directory path to create' },
                mode: { type: 'number', description: 'Directory permissions mode' }
              },
              required: ['sessionId', 'path']
            }
          },
          {
            name: 'fs.rmrf',
            description: 'Removes files or directories recursively',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'Path to remove' }
              },
              required: ['sessionId', 'path']
            }
          },
          {
            name: 'fs.rename',
            description: 'Renames or moves a file/directory',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                from: { type: 'string', description: 'Source path' },
                to: { type: 'string', description: 'Destination path' }
              },
              required: ['sessionId', 'from', 'to']
            }
          },

          // High-level automation
          {
            name: 'ensure.package',
            description: 'Ensures a package is installed or removed',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                name: { type: 'string', description: 'Package name' },
                state: { type: 'string', enum: ['present', 'absent'], description: 'Desired state' }
              },
              required: ['sessionId', 'name', 'state']
            }
          },
          {
            name: 'ensure.service',
            description: 'Ensures a service is in the desired state',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                name: { type: 'string', description: 'Service name' },
                state: { type: 'string', enum: ['started', 'stopped', 'enabled', 'disabled'], description: 'Desired state' }
              },
              required: ['sessionId', 'name', 'state']
            }
          },
          {
            name: 'ensure.linesInFile',
            description: 'Ensures specific lines are present or absent in a file',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'File path' },
                lines: { type: 'array', items: { type: 'string' }, description: 'Lines to manage' },
                state: { type: 'string', enum: ['present', 'absent'], description: 'Desired state' }
              },
              required: ['sessionId', 'path', 'lines', 'state']
            }
          },
          {
            name: 'patch.apply',
            description: 'Applies a patch to a file',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' },
                path: { type: 'string', description: 'File path to patch' },
                patch: { type: 'string', description: 'Patch content (unified diff format)' }
              },
              required: ['sessionId', 'path', 'patch']
            }
          },
          {
            name: 'os.detect',
            description: 'Detects operating system and environment information',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' }
              },
              required: ['sessionId']
            }
          },

          // Session utilities
          {
            name: 'ssh.listSessions',
            description: 'Lists all active SSH sessions with their details',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'ssh.ping',
            description: 'Checks if an SSH session is still alive and responsive',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID to check' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'ssh.listConfiguredHosts',
            description: 'Lists all hosts configured in ~/.ssh/config',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'ssh.resolveHost',
            description: 'Resolves a host alias from ~/.ssh/config to connection parameters',
            inputSchema: {
              type: 'object',
              properties: {
                hostAlias: { type: 'string', description: 'Host alias from SSH config' }
              },
              required: ['hostAlias']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolName = TOOL_ALIASES[name] ?? name;

      try {
        switch (toolName) {
          case 'ssh.openSession': {
            const params = ConnectionParamsSchema.parse(args);
            const result = await sessionManager.openSession(params);
            logger.info('SSH session opened', { sessionId: result.sessionId, host: redactSensitiveData(params.host) });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ssh.closeSession': {
            const { sessionId } = SessionIdSchema.parse(args);
            const result = await sessionManager.closeSession(sessionId);
            logger.info('SSH session closed', { sessionId });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'proc.exec': {
            const params = ExecSchema.parse(args);
            const result = await execCommand(
              params.sessionId,
              params.command,
              params.cwd,
              params.env as Record<string, string>,
              params.timeoutMs
            );
            // Add safety warning (never blocks, only warns)
            const resultWithWarning = addSafetyWarningToResult(params.command, result);
            logger.info('Command executed', { sessionId: params.sessionId, command: redactSensitiveData(params.command) });
            return { content: [{ type: 'text', text: JSON.stringify(resultWithWarning, null, 2) }] };
          }

          case 'proc.sudo': {
            const params = SudoSchema.parse(args);
            const result = await execSudo(params.sessionId, params.command, params.password, params.cwd, params.timeoutMs);
            // Add safety warning (never blocks, only warns)
            const resultWithWarning = addSafetyWarningToResult(params.command, result);
            logger.info('Sudo command executed', { sessionId: params.sessionId, command: redactSensitiveData(params.command) });
            return { content: [{ type: 'text', text: JSON.stringify(resultWithWarning, null, 2) }] };
          }

          case 'fs.read': {
            const params = FSReadSchema.parse(args);
            const result = await readFile(params.sessionId, params.path, params.encoding);
            logger.info('File read', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.write': {
            const params = FSWriteSchema.parse(args);
            const result = await writeFile(params.sessionId, params.path, params.data, params.mode);
            logger.info('File written', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.stat': {
            const params = FSStatSchema.parse(args);
            const result = await statFile(params.sessionId, params.path);
            logger.info('Path stat', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.list': {
            const params = FSListSchema.parse(args);
            const result = await listDirectory(params.sessionId, params.path, params.page, params.limit);
            logger.info('Directory listed', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.mkdirp': {
            const params = FSPathSchema.parse(args);
            const result = await makeDirectories(params.sessionId, params.path);
            logger.info('Directories created', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.rmrf': {
            const params = FSPathSchema.parse(args);
            const result = await removeRecursive(params.sessionId, params.path);
            logger.info('Path removed', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs.rename': {
            const params = FSRenameSchema.parse(args);
            const result = await renameFile(params.sessionId, params.from, params.to);
            logger.info('Path renamed', { sessionId: params.sessionId, from: params.from, to: params.to });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure.package': {
            const params = EnsurePackageSchema.parse(args);
            const result = await ensurePackage(params.sessionId, params.name, params.sudoPassword);
            logger.info('Package ensured', { sessionId: params.sessionId, name: params.name });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure.service': {
            const params = EnsureServiceSchema.parse(args);
            const result = await ensureService(params.sessionId, params.name, params.state, params.sudoPassword);
            logger.info('Service ensured', { sessionId: params.sessionId, name: params.name, state: params.state });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure.linesInFile': {
            const params = EnsureLinesSchema.parse(args);
            const result = await ensureLinesInFile(params.sessionId, params.path, params.lines, params.createIfMissing, params.sudoPassword);
            logger.info('Lines ensured in file', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'patch.apply': {
            const params = PatchApplySchema.parse(args);
            const result = await applyPatch(params.sessionId, params.path, params.diff, params.sudoPassword);
            logger.info('Patch applied', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'os.detect': {
            const { sessionId } = SessionIdSchema.parse(args);
            const result = await sessionManager.getOSInfo(sessionId);
            logger.info('OS detected', { sessionId });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ssh.listSessions': {
            const sessions = sessionManager.getActiveSessions();
            const result = {
              count: sessions.length,
              sessions: sessions.map(s => ({
                sessionId: s.sessionId,
                host: s.host,
                username: s.username,
                port: s.port,
                createdAt: new Date(s.createdAt).toISOString(),
                expiresAt: new Date(s.expiresAt).toISOString(),
                lastUsed: new Date(s.lastUsed).toISOString(),
                remainingMs: Math.max(0, s.expiresAt - Date.now())
              }))
            };
            logger.info('Sessions listed', { count: sessions.length });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ssh.ping': {
            const { sessionId } = SessionIdSchema.parse(args);
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ alive: false, error: 'Session not found or expired' }, null, 2)
                }]
              };
            }

            try {
              const startTime = Date.now();
              const pingResult = await session.ssh.execCommand('echo pong');
              const latencyMs = Date.now() - startTime;

              const result = {
                alive: pingResult.code === 0,
                latencyMs,
                sessionId,
                host: session.info.host,
                remainingMs: Math.max(0, session.info.expiresAt - Date.now())
              };
              logger.info('Session ping', { sessionId, alive: result.alive, latencyMs });
              return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ alive: false, error: 'Connection test failed' }, null, 2)
                }]
              };
            }
          }

          case 'ssh.listConfiguredHosts': {
            const hosts = await getConfiguredHosts();
            const result = {
              count: hosts.length,
              hosts
            };
            logger.info('Configured hosts listed', { count: hosts.length });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ssh.resolveHost': {
            const { hostAlias } = z.object({ hostAlias: z.string() }).parse(args);
            const resolved = await resolveSSHHost(hostAlias);
            logger.info('Host resolved', { hostAlias, resolved: resolved.host });
            return { content: [{ type: 'text', text: JSON.stringify(resolved, null, 2) }] };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error('Tool execution failed', { tool: toolName, error: error.message });
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      logger.error('Server error', { error: error.message });
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('SSH MCP Server started successfully');
  }
}
