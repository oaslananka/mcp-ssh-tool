import { NodeSSH } from 'node-ssh';
import SftpClient from 'ssh2-sftp-client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConnectionParams, SessionInfo, SessionResult, AuthConfig } from './types.js';
import { createAuthError, createConnectionError, createTimeoutError } from './errors.js';
import { logger } from './logging.js';

/**
 * SSH session with connection and SFTP client
 */
export interface SSHSession {
  ssh: NodeSSH;
  sftp: SftpClient;
  info: SessionInfo;
  connectionParams?: ConnectionParams; // For auto-reconnect
}

/**
 * Session manager with LRU cache and TTL
 */
export class SessionManager {
  private sessions = new Map<string, SSHSession>();
  private readonly maxSessions: number;
  private sessionCounter = 0;

  constructor(maxSessions = 20) {
    this.maxSessions = maxSessions;

    // Clean up expired sessions every 60 seconds
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * Opens a new SSH session with authentication
   */
  async openSession(params: ConnectionParams): Promise<SessionResult> {
    logger.debug('Opening SSH session', { host: params.host, username: params.username });

    const sessionId = this.generateSessionId();
    const now = Date.now();
    const ttl = params.ttlMs || 900000; // 15 minutes default

    try {
      // Clean up old sessions if we're at the limit
      if (this.sessions.size >= this.maxSessions) {
        this.evictOldestSession();
      }

      const ssh = new NodeSSH();
      const authConfig = await this.buildAuthConfig(params);

      const connectConfig = {
        host: params.host,
        username: params.username,
        port: params.port || 22,
        readyTimeout: params.readyTimeoutMs || 20000,
        hostVerifyMethod: params.strictHostKeyChecking
          ? undefined  // Use default strict checking
          : () => true, // Relaxed host key checking
        knownHosts: params.knownHostsPath,
        ...authConfig
      };

      logger.debug('Connecting to SSH server');
      await ssh.connect(connectConfig);

      // Initialize SFTP client
      const sftp = new SftpClient();
      await sftp.connect({
        host: params.host,
        username: params.username,
        port: params.port || 22,
        readyTimeout: params.readyTimeoutMs || 20000,
        ...authConfig
      });

      const sessionInfo: SessionInfo = {
        sessionId,
        host: params.host,
        username: params.username,
        port: params.port || 22,
        createdAt: now,
        expiresAt: now + ttl,
        lastUsed: now
      };

      const session: SSHSession = {
        ssh,
        sftp,
        info: sessionInfo,
        connectionParams: params // Store for reconnect
      };

      this.sessions.set(sessionId, session);

      logger.info('SSH session opened successfully', {
        sessionId,
        host: params.host,
        username: params.username,
        expiresInMs: ttl
      });

      return {
        sessionId,
        host: params.host,
        username: params.username,
        expiresInMs: ttl
      };

    } catch (error) {
      logger.error('Failed to open SSH session', { error, host: params.host });

      if (error instanceof Error) {
        if (error.message.includes('authentication')) {
          throw createAuthError(
            'SSH authentication failed',
            'Check your username, password, or SSH key configuration'
          );
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
          throw createTimeoutError(
            'SSH connection timeout',
            'Check if the host is reachable and the SSH service is running'
          );
        } else if (error.message.includes('ECONNREFUSED')) {
          throw createConnectionError(
            'SSH connection refused',
            'Check if the SSH service is running on the target port'
          );
        }
      }

      throw createConnectionError(
        `Failed to establish SSH connection: ${error instanceof Error ? error.message : String(error)}`,
        'Verify the host, port, and network connectivity'
      );
    }
  }

  /**
   * Closes an SSH session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    logger.debug('Closing SSH session', { sessionId });

    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for closing', { sessionId });
      return false;
    }

    try {
      await session.sftp.end();
      session.ssh.dispose();
    } catch (error) {
      logger.warn('Error closing session', { sessionId, error });
    }

    this.sessions.delete(sessionId);
    logger.info('SSH session closed', { sessionId });
    return true;
  }

  /**
   * Gets an active session by ID
   */
  getSession(sessionId: string): SSHSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    // Check if session is expired
    if (Date.now() > session.info.expiresAt) {
      this.closeSession(sessionId);
      return undefined;
    }

    // Update last used time for LRU
    session.info.lastUsed = Date.now();
    return session;
  }

  /**
   * Builds authentication configuration based on the auth strategy
   */
  private async buildAuthConfig(params: ConnectionParams): Promise<any> {
    const authStrategy = params.auth || 'auto';

    logger.debug('Building auth config', { strategy: authStrategy });

    switch (authStrategy) {
      case 'password':
        if (!params.password) {
          throw createAuthError('Password required for password authentication');
        }
        return { password: params.password };

      case 'key':
        return await this.buildKeyAuth(params);

      case 'agent':
        return await this.buildAgentAuth();

      case 'auto':
      default:
        return await this.buildAutoAuth(params);
    }
  }

  /**
   * Builds key-based authentication
   */
  private async buildKeyAuth(params: ConnectionParams): Promise<any> {
    // Inline private key takes precedence
    if (params.privateKey) {
      logger.debug('Using inline private key');
      return {
        privateKey: params.privateKey,
        passphrase: params.passphrase
      };
    }

    // Then try explicit path
    if (params.privateKeyPath) {
      logger.debug('Using private key from path', { path: params.privateKeyPath });
      return await this.loadPrivateKeyFromPath(params.privateKeyPath, params.passphrase);
    }

    // Auto-discover keys
    return await this.discoverPrivateKeys(params.passphrase);
  }

  /**
   * Builds SSH agent authentication
   */
  private async buildAgentAuth(): Promise<any> {
    const authSock = process.env.SSH_AUTH_SOCK;
    if (!authSock) {
      throw createAuthError(
        'SSH agent not available',
        'Set SSH_AUTH_SOCK environment variable or use a different auth method'
      );
    }

    logger.debug('Using SSH agent authentication');
    return { agent: authSock };
  }

  /**
   * Builds automatic authentication (tries password, then key, then agent)
   */
  private async buildAutoAuth(params: ConnectionParams): Promise<any> {
    // Try password first if provided
    if (params.password) {
      logger.debug('Auto auth: trying password');
      return { password: params.password };
    }

    // Try key authentication
    try {
      logger.debug('Auto auth: trying key authentication');
      return await this.buildKeyAuth(params);
    } catch (error) {
      logger.debug('Auto auth: key authentication failed, trying agent');
    }

    // Fall back to agent
    try {
      return await this.buildAgentAuth();
    } catch (error) {
      throw createAuthError(
        'No suitable authentication method found',
        'Provide a password, private key, or ensure SSH agent is running'
      );
    }
  }

  /**
   * Loads private key from file path
   */
  private async loadPrivateKeyFromPath(keyPath: string, passphrase?: string): Promise<any> {
    try {
      const privateKey = await fs.promises.readFile(keyPath, 'utf8');
      return { privateKey, passphrase };
    } catch (error) {
      throw createAuthError(
        `Failed to load private key from ${keyPath}`,
        'Check if the file exists and is readable'
      );
    }
  }

  /**
   * Auto-discovers private keys in standard locations
   */
  private async discoverPrivateKeys(passphrase?: string): Promise<any> {
    const homeDir = os.homedir();
    const keyDir = process.env.SSH_DEFAULT_KEY_DIR || path.join(homeDir, '.ssh');

    // Modern preference: ed25519 → rsa → ecdsa → dsa (legacy)
    const keyFiles = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];

    for (const keyFile of keyFiles) {
      const keyPath = path.join(keyDir, keyFile);

      try {
        await fs.promises.access(keyPath, fs.constants.R_OK);
        logger.debug('Found SSH key', { path: keyPath });
        return await this.loadPrivateKeyFromPath(keyPath, passphrase);
      } catch (error) {
        // Continue to next key file
        logger.debug('SSH key not found or not readable', { path: keyPath });
      }
    }

    throw createAuthError(
      'No SSH private keys found in standard locations',
      `Checked: ${keyFiles.map(f => path.join(keyDir, f)).join(', ')}`
    );
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    return `ssh-${Date.now()}-${++this.sessionCounter}`;
  }

  /**
   * Evicts the oldest (least recently used) session
   */
  private evictOldestSession(): void {
    let oldestSession: string | undefined;
    let oldestTime = Date.now();

    for (const [sessionId, session] of this.sessions) {
      if (session.info.lastUsed < oldestTime) {
        oldestTime = session.info.lastUsed;
        oldestSession = sessionId;
      }
    }

    if (oldestSession) {
      logger.info('Evicting oldest session', { sessionId: oldestSession });
      this.closeSession(oldestSession);
    }
  }

  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now > session.info.expiresAt) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      logger.info('Cleaning up expired session', { sessionId });
      this.closeSession(sessionId);
    }
  }

  /**
   * Gets information about all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({ ...session.info }));
  }

  /**
   * Closes all active sessions
   */
  async closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id)));
  }

  /**
   * Attempts to reconnect a session
   */
  async reconnectSession(sessionId: string): Promise<SessionResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Session not found for reconnect', { sessionId });
      return null;
    }

    if (!session.connectionParams) {
      logger.warn('Session has no stored connection params', { sessionId });
      return null;
    }

    logger.info('Attempting to reconnect session', { sessionId, host: session.info.host });

    // Close old session
    await this.closeSession(sessionId);

    // Open new session with same params
    try {
      const result = await this.openSession(session.connectionParams);
      logger.info('Session reconnected successfully', {
        oldSessionId: sessionId,
        newSessionId: result.sessionId
      });
      return result;
    } catch (error) {
      logger.error('Failed to reconnect session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Checks if a session is alive by executing a simple command
   */
  async isSessionAlive(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      const result = await session.ssh.execCommand('echo 1');
      return result.code === 0;
    } catch (error) {
      logger.debug('Session health check failed', { sessionId, error });
      return false;
    }
  }

  /**
   * Gets session with auto-reconnect if disconnected
   */
  async getSessionWithReconnect(sessionId: string): Promise<SSHSession | undefined> {
    const session = this.getSession(sessionId);
    if (!session) {
      return undefined;
    }

    // Check if still alive
    if (!(await this.isSessionAlive(sessionId))) {
      logger.info('Session disconnected, attempting reconnect', { sessionId });

      if (session.connectionParams) {
        try {
          await this.reconnectSession(sessionId);
          // Return the new session (note: sessionId will be different)
          // For now, return undefined as the old sessionId is no longer valid
          return undefined;
        } catch (error) {
          logger.error('Auto-reconnect failed', { sessionId, error });
          return undefined;
        }
      }
    }

    return session;
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();
