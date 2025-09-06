import { ErrorCode, SSHMCPError } from './types.js';

/**
 * Creates an authentication error
 */
export function createAuthError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.EAUTH, message, hint);
}

/**
 * Creates a connection error
 */
export function createConnectionError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.ECONN, message, hint);
}

/**
 * Creates a timeout error
 */
export function createTimeoutError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.ETIMEOUT, message, hint);
}

/**
 * Creates a sudo error
 */
export function createSudoError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.ENOSUDO, message, hint);
}

/**
 * Creates a package manager error
 */
export function createPackageManagerError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.EPMGR, message, hint);
}

/**
 * Creates a filesystem error
 */
export function createFilesystemError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.EFS, message, hint);
}

/**
 * Creates a patch error
 */
export function createPatchError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.EPATCH, message, hint);
}

/**
 * Creates a bad request error
 */
export function createBadRequestError(message: string, hint?: string): SSHMCPError {
  return new SSHMCPError(ErrorCode.EBADREQ, message, hint);
}

/**
 * Wraps an unknown error into an SSH MCP error
 */
export function wrapError(error: unknown, code: ErrorCode, hint?: string): SSHMCPError {
  if (error instanceof SSHMCPError) {
    return error;
  }
  
  const message = error instanceof Error ? error.message : String(error);
  return new SSHMCPError(code, message, hint);
}
