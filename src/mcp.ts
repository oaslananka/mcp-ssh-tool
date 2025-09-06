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
import { detectOS } from './detect.js';
import { logger, redactSensitiveData } from './logging.js';
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

/**
 * SSH MCP Server implementation
 */
export class SSHMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'ssh-mcp-server',
        version: '1.0.0',
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
            name: 'ssh_openSession',
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
            name: 'ssh_closeSession',
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
            name: 'proc_exec',
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
            name: 'proc_sudo',
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
            name: 'fs_read',
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
            name: 'fs_write',
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
            name: 'fs_stat',
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
            name: 'fs_list',
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
            name: 'fs_mkdirp',
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
            name: 'fs_rmrf',
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
            name: 'fs_rename',
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
            name: 'ensure_package',
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
            name: 'ensure_service',
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
            name: 'ensure_linesInFile',
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
            name: 'patch_apply',
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
            name: 'os_detect',
            description: 'Detects operating system and environment information',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'SSH session ID' }
              },
              required: ['sessionId']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'ssh_openSession': {
            const params = ConnectionParamsSchema.parse(args);
            const result = await sessionManager.openSession(params);
            logger.info('SSH session opened', { sessionId: result.sessionId, host: redactSensitiveData(params.host) });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ssh_closeSession': {
            const { sessionId } = SessionIdSchema.parse(args);
            const result = await sessionManager.closeSession(sessionId);
            logger.info('SSH session closed', { sessionId });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'proc_exec': {
            const params = ExecSchema.parse(args);
            const result = await execCommand(
              params.sessionId, 
              params.command, 
              params.cwd, 
              params.env as Record<string, string>
            );
            logger.info('Command executed', { sessionId: params.sessionId, command: redactSensitiveData(params.command) });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'proc_sudo': {
            const params = SudoSchema.parse(args);
            const result = await execSudo(params.sessionId, params.command, params.password, params.cwd);
            logger.info('Sudo command executed', { sessionId: params.sessionId, command: redactSensitiveData(params.command) });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_read': {
            const params = FSReadSchema.parse(args);
            const result = await readFile(params.sessionId, params.path, params.encoding);
            logger.info('File read', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_write': {
            const params = FSWriteSchema.parse(args);
            const result = await writeFile(params.sessionId, params.path, params.data, params.mode);
            logger.info('File written', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_stat': {
            const params = FSStatSchema.parse(args);
            const result = await statFile(params.sessionId, params.path);
            logger.info('Path stat', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_list': {
            const params = FSListSchema.parse(args);
            const result = await listDirectory(params.sessionId, params.path, params.page, params.limit);
            logger.info('Directory listed', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_mkdirp': {
            const params = FSPathSchema.parse(args);
            const result = await makeDirectories(params.sessionId, params.path);
            logger.info('Directories created', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_rmrf': {
            const params = FSPathSchema.parse(args);
            const result = await removeRecursive(params.sessionId, params.path);
            logger.info('Path removed', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'fs_rename': {
            const params = FSRenameSchema.parse(args);
            const result = await renameFile(params.sessionId, params.from, params.to);
            logger.info('Path renamed', { sessionId: params.sessionId, from: params.from, to: params.to });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure_package': {
            const params = EnsurePackageSchema.parse(args);
            const result = await ensurePackage(params.sessionId, params.name, params.sudoPassword);
            logger.info('Package ensured', { sessionId: params.sessionId, name: params.name });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure_service': {
            const params = EnsureServiceSchema.parse(args);
            const result = await ensureService(params.sessionId, params.name, params.state, params.sudoPassword);
            logger.info('Service ensured', { sessionId: params.sessionId, name: params.name, state: params.state });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'ensure_linesInFile': {
            const params = EnsureLinesSchema.parse(args);
            const result = await ensureLinesInFile(params.sessionId, params.path, params.lines, params.createIfMissing, params.sudoPassword);
            logger.info('Lines ensured in file', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'patch_apply': {
            const params = PatchApplySchema.parse(args);
            const result = await applyPatch(params.sessionId, params.path, params.diff, params.sudoPassword);
            logger.info('Patch applied', { sessionId: params.sessionId, path: params.path });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'os_detect': {
            const { sessionId } = SessionIdSchema.parse(args);
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              throw new Error(`Session ${sessionId} not found or expired`);
            }
            const result = await detectOS(session.ssh);
            logger.info('OS detected', { sessionId });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error('Tool execution failed', { tool: name, error: error.message });
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
