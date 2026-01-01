/**
 * SSH Config Parser
 * 
 * Parses ~/.ssh/config file and resolves host configurations.
 * Supports common SSH config options: Host, HostName, User, Port, IdentityFile, ProxyJump
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logging.js';

/**
 * Parsed SSH host configuration
 */
export interface SSHHostConfig {
    host: string;
    hostName?: string;
    user?: string;
    port?: number;
    identityFile?: string;
    proxyJump?: string;
    forwardAgent?: boolean;
    strictHostKeyChecking?: string;
    userKnownHostsFile?: string;
    connectTimeout?: number;
    [key: string]: string | number | boolean | undefined;
}

/**
 * SSH config file parser
 */
export class SSHConfigParser {
    private configPath: string;
    private hosts: Map<string, SSHHostConfig> = new Map();
    private parsed = false;

    constructor(configPath?: string) {
        this.configPath = configPath || path.join(os.homedir(), '.ssh', 'config');
    }

    /**
     * Parses the SSH config file
     */
    async parse(): Promise<void> {
        if (this.parsed) {
            return;
        }

        try {
            const content = await fs.promises.readFile(this.configPath, 'utf8');
            this.parseContent(content);
            this.parsed = true;
            logger.debug('SSH config parsed successfully', {
                path: this.configPath,
                hostCount: this.hosts.size
            });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                logger.debug('SSH config file not found', { path: this.configPath });
            } else {
                logger.warn('Failed to parse SSH config', { path: this.configPath, error });
            }
            this.parsed = true;
        }
    }

    /**
     * Parses SSH config content
     */
    private parseContent(content: string): void {
        const lines = content.split('\n');
        let currentHost: SSHHostConfig | null = null;

        for (const rawLine of lines) {
            const line = rawLine.trim();

            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                continue;
            }

            // Parse key-value pairs
            const match = line.match(/^(\S+)\s+(.+)$/);
            if (!match) {
                continue;
            }

            const [, key, value] = match;
            const keyLower = key.toLowerCase();

            if (keyLower === 'host') {
                // Start new host block
                const hostPatterns = value.split(/\s+/);
                for (const pattern of hostPatterns) {
                    currentHost = { host: pattern };
                    this.hosts.set(pattern, currentHost);
                }
            } else if (currentHost) {
                // Add option to current host
                this.setHostOption(currentHost, keyLower, value);
            }
        }
    }

    /**
     * Sets a host configuration option
     */
    private setHostOption(host: SSHHostConfig, key: string, value: string): void {
        switch (key) {
            case 'hostname':
                host.hostName = value;
                break;
            case 'user':
                host.user = value;
                break;
            case 'port':
                host.port = parseInt(value, 10);
                break;
            case 'identityfile':
                // Expand ~ to home directory
                host.identityFile = value.replace(/^~/, os.homedir());
                break;
            case 'proxyjump':
                host.proxyJump = value;
                break;
            case 'forwardagent':
                host.forwardAgent = value.toLowerCase() === 'yes';
                break;
            case 'stricthostkeychecking':
                host.strictHostKeyChecking = value;
                break;
            case 'userknownhostsfile':
                host.userKnownHostsFile = value.replace(/^~/, os.homedir());
                break;
            case 'connecttimeout':
                host.connectTimeout = parseInt(value, 10);
                break;
            default:
                // Store other options as-is
                host[key] = value;
        }
    }

    /**
     * Gets configuration for a specific host
     */
    getHostConfig(hostAlias: string): SSHHostConfig | undefined {
        // Direct match
        if (this.hosts.has(hostAlias)) {
            return this.hosts.get(hostAlias);
        }

        // Wildcard matching
        for (const [pattern, config] of this.hosts) {
            if (this.matchPattern(pattern, hostAlias)) {
                return config;
            }
        }

        return undefined;
    }

    /**
     * Resolves a host alias to full connection parameters
     */
    resolveHost(hostAlias: string): {
        host: string;
        username?: string;
        port?: number;
        privateKeyPath?: string;
        proxyJump?: string;
    } {
        const config = this.getHostConfig(hostAlias);

        if (!config) {
            return { host: hostAlias };
        }

        return {
            host: config.hostName || hostAlias,
            username: config.user,
            port: config.port,
            privateKeyPath: config.identityFile,
            proxyJump: config.proxyJump
        };
    }

    /**
     * Gets all configured hosts
     */
    getAllHosts(): string[] {
        return Array.from(this.hosts.keys()).filter(h => h !== '*');
    }

    /**
     * Matches a wildcard pattern against a hostname
     */
    private matchPattern(pattern: string, hostname: string): boolean {
        if (pattern === '*') {
            return true;
        }

        // Convert SSH pattern to regex
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(hostname);
    }
}

// Global singleton instance
let globalConfigParser: SSHConfigParser | null = null;

/**
 * Gets the global SSH config parser instance
 */
export async function getSSHConfigParser(): Promise<SSHConfigParser> {
    if (!globalConfigParser) {
        globalConfigParser = new SSHConfigParser();
        await globalConfigParser.parse();
    }
    return globalConfigParser;
}

/**
 * Resolves a host alias using SSH config
 */
export async function resolveSSHHost(hostAlias: string): Promise<{
    host: string;
    username?: string;
    port?: number;
    privateKeyPath?: string;
    proxyJump?: string;
}> {
    const parser = await getSSHConfigParser();
    return parser.resolveHost(hostAlias);
}

/**
 * Gets all configured SSH hosts
 */
export async function getConfiguredHosts(): Promise<string[]> {
    const parser = await getSSHConfigParser();
    return parser.getAllHosts();
}
