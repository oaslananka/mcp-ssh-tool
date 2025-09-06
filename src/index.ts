#!/usr/bin/env node

/**
 * SSH MCP Server - Entry Point
 * 
 * A Model Context Protocol (MCP) server that provides SSH automation tools
 * for GitHub Copilot and VS Code. Supports remote command execution, file
 * operations, and system administration tasks over SSH.
 */

import { SSHMCPServer } from './mcp.js';
import { logger } from './logging.js';
import { sessionManager } from './session.js';

async function main() {
  try {
    logger.info('Starting SSH MCP Server...');
    
    const server = new SSHMCPServer();
    await server.run();
    
    // Check if running in daemon mode (for testing)
    if (process.env.SSH_MCP_DAEMON === 'true') {
      logger.info('Running in daemon mode - will not wait for stdin');
      // Keep alive but don't block on stdin
      setInterval(() => {}, 1000);
    } else if (process.env.SSH_MCP_ONESHOT === 'true') {
      logger.info('Running in one-shot mode - will exit after processing');
      // Process stdin once and exit with timeout
      const timeout = setTimeout(() => {
        logger.info('One-shot mode timeout, exiting');
        process.exit(0);
      }, 2000);
      
      process.stdin.once('data', () => {
        clearTimeout(timeout);
        setTimeout(() => process.exit(0), 100);
      });
      process.stdin.resume();
    } else {
      // Keep the process running for MCP stdio communication
      process.stdin.resume();
    }
    
  } catch (error) {
    logger.error('Failed to start SSH MCP Server', { error });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await sessionManager.closeAllSessions();
    logger.info('All SSH sessions closed');
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Run the server
main();
