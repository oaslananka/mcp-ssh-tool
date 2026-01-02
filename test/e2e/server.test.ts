/**
 * E2E tests for SSH MCP Server
 * 
 * These tests require a test SSH server to be available.
 * Set RUN_SSH_E2E=1 environment variable to enable these tests.
 * 
 * Quick start with Docker:
 * docker-compose up -d ssh-server
 * npm run e2e
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

// Test configuration from environment
const TEST_SSH_HOST = process.env.TEST_SSH_HOST || 'localhost';
const TEST_SSH_PORT = parseInt(process.env.TEST_SSH_PORT || '2222');
const TEST_SSH_USER = process.env.TEST_SSH_USER || 'testuser';
const TEST_SSH_PASS = process.env.TEST_SSH_PASS || 'testpass';

// Skip flag
const SKIP_E2E = !process.env.RUN_SSH_E2E;

// Helper to conditionally skip tests
const e2eTest = SKIP_E2E ? test.skip : test;

describe('SSH MCP Server E2E Tests', () => {
  let sessionManager: any;
  let sessionId: string;

  beforeAll(async () => {
    if (SKIP_E2E) {
      console.log('⏭️  Skipping E2E tests - set RUN_SSH_E2E=1 to enable');
      return;
    }

    // Import session manager
    const sessionModule = await import('../../dist/session.js');
    sessionManager = sessionModule.sessionManager;
  });

  afterAll(async () => {
    if (sessionId && sessionManager) {
      try {
        await sessionManager.closeSession(sessionId);
        console.log('✅ Test session cleaned up');
      } catch (e) {
        console.log('⚠️  Failed to clean up session');
      }
    }
  });

  describe('Session Management', () => {
    e2eTest('should connect via password authentication', async () => {
      const result = await sessionManager.openSession({
        host: TEST_SSH_HOST,
        port: TEST_SSH_PORT,
        username: TEST_SSH_USER,
        password: TEST_SSH_PASS,
        auth: 'password'
      });

      expect(result.sessionId).toBeDefined();
      expect(result.host).toBe(TEST_SSH_HOST);
      expect(result.username).toBe(TEST_SSH_USER);

      sessionId = result.sessionId;
      console.log(`✅ Connected: ${sessionId}`);
    });

    e2eTest('should list active sessions', async () => {
      const sessions = sessionManager.getActiveSessions();

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s: any) => s.sessionId === sessionId)).toBe(true);

      console.log(`✅ Found ${sessions.length} active session(s)`);
    });

    e2eTest('should check session health with isSessionAlive', async () => {
      const isAlive = await sessionManager.isSessionAlive(sessionId);

      expect(isAlive).toBe(true);
      console.log('✅ Session is alive');
    });
  });

  describe('Command Execution', () => {
    e2eTest('should execute basic commands', async () => {
      const { execCommand } = await import('../../dist/process.js');

      const result = await execCommand(sessionId, 'echo "Hello World"');

      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.durationMs).toBeGreaterThan(0);

      console.log(`✅ Command executed in ${result.durationMs}ms`);
    });

    e2eTest('should execute commands with environment variables', async () => {
      const { execCommand } = await import('../../dist/process.js');

      const result = await execCommand(sessionId, 'echo $MY_VAR', undefined, { MY_VAR: 'test123' });

      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('test123');

      console.log('✅ Environment variables work');
    });

    e2eTest('should execute commands with working directory', async () => {
      const { execCommand } = await import('../../dist/process.js');

      const result = await execCommand(sessionId, 'pwd', '/tmp');

      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('/tmp');

      console.log('✅ Working directory works');
    });

    e2eTest('should handle command timeout', async () => {
      const { execCommand } = await import('../../dist/process.js');

      await expect(
        execCommand(sessionId, 'sleep 10', undefined, undefined, 1000)
      ).rejects.toThrow(/timeout/i);

      console.log('✅ Timeout works');
    });
  });

  describe('File Operations', () => {
    const testFilePath = '/tmp/mcp-ssh-test-file.txt';
    const testContent = 'Hello from MCP SSH Tool!';

    e2eTest('should write a file', async () => {
      const { writeFile } = await import('../../dist/fs-tools.js');

      const result = await writeFile(sessionId, testFilePath, testContent);

      expect(result).toBe(true);
      console.log(`✅ File written: ${testFilePath}`);
    });

    e2eTest('should read a file', async () => {
      const { readFile } = await import('../../dist/fs-tools.js');

      const content = await readFile(sessionId, testFilePath);

      expect(content).toBe(testContent);
      console.log('✅ File content matches');
    });

    e2eTest('should stat a file', async () => {
      const { statFile } = await import('../../dist/fs-tools.js');

      const stats = await statFile(sessionId, testFilePath);

      expect(stats.isFile).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
      console.log(`✅ File size: ${stats.size} bytes`);
    });

    e2eTest('should list directory', async () => {
      const { listDirectory } = await import('../../dist/fs-tools.js');

      const entries = await listDirectory(sessionId, '/tmp');

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.some((e: any) => e.name === 'mcp-ssh-test-file.txt')).toBe(true);
      console.log(`✅ Found ${entries.length} entries in /tmp`);
    });

    e2eTest('should create directory', async () => {
      const { makeDirectories } = await import('../../dist/fs-tools.js');

      const result = await makeDirectories(sessionId, '/tmp/mcp-test-dir/nested');

      expect(result).toBe(true);
      console.log('✅ Directory created');
    });

    e2eTest('should remove file and directory', async () => {
      const { removeRecursive } = await import('../../dist/fs-tools.js');

      await removeRecursive(sessionId, testFilePath);
      await removeRecursive(sessionId, '/tmp/mcp-test-dir');

      console.log('✅ Cleanup complete');
    });
  });

  describe('OS Detection', () => {
    e2eTest('should detect OS information', async () => {
      const session = sessionManager.getSession(sessionId);
      const { detectOS } = await import('../../dist/detect.js');

      const osInfo = await detectOS(session.ssh);

      expect(osInfo.arch).toBeDefined();
      expect(osInfo.shell).toBeDefined();
      console.log(`✅ OS: ${osInfo.distro || 'Linux'} (${osInfo.arch})`);
    });
  });

  describe('Streaming Output', () => {
    e2eTest('should stream command output', async () => {
      const { execWithStreaming } = await import('../../dist/streaming.js');

      const chunks: any[] = [];
      const result = await execWithStreaming({
        sessionId,
        command: 'for i in 1 2 3; do echo "Line $i"; sleep 0.1; done',
        onChunk: (chunk) => chunks.push(chunk)
      });

      expect(result.code).toBe(0);
      expect(chunks.length).toBeGreaterThan(0);
      console.log(`✅ Received ${chunks.length} chunks`);
    });
  });

  describe('Session Cleanup', () => {
    e2eTest('should close session', async () => {
      const result = await sessionManager.closeSession(sessionId);

      expect(result).toBe(true);

      // Verify session is gone
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeUndefined();

      sessionId = ''; // Clear so afterAll doesn't try to close again
      console.log('✅ Session closed');
    });
  });
});

export { };
