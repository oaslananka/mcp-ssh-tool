import { ExecResult } from './types.js';
import { createSudoError, wrapError, createTimeoutError } from './errors.js';
import { logger, createTimer } from './logging.js';
import { sessionManager, SSHSession } from './session.js';
import { ErrorCode } from './types.js';

/**
 * Executes a command on the remote system with optional timeout
 */
export async function execCommand(
  sessionId: string,
  command: string,
  cwd?: string,
  env?: Record<string, string>,
  timeoutMs?: number
): Promise<ExecResult> {
  logger.debug('Executing command', { sessionId, command, cwd, timeoutMs });

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }

  const timer = createTimer();

  try {
    // Build the command with environment and working directory
    let fullCommand = command;

    // Set environment variables if provided
    if (env && Object.keys(env).length > 0) {
      const envVars = Object.entries(env)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      fullCommand = `${envVars} ${command}`;
    }

    // Change directory if provided
    if (cwd) {
      fullCommand = `cd ${JSON.stringify(cwd)} && ${fullCommand}`;
    }

    // Try bash first, fallback to sh if bash is not available
    const shellCommand = `if command -v bash >/dev/null 2>&1; then bash -lc ${JSON.stringify(fullCommand)}; else sh -lc ${JSON.stringify(fullCommand)}; fi`;

    // Execute with optional timeout
    let result;
    if (timeoutMs) {
      result = await Promise.race([
        session.ssh.execCommand(shellCommand),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(createTimeoutError(
            `Command timed out after ${timeoutMs}ms`,
            'Increase timeout or optimize the command'
          )), timeoutMs)
        )
      ]);
    } else {
      result = await session.ssh.execCommand(shellCommand);
    }

    const execResult: ExecResult = {
      code: result.code || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      durationMs: timer.elapsed()
    };

    logger.debug('Command execution completed', {
      sessionId,
      code: execResult.code,
      durationMs: execResult.durationMs
    });

    return execResult;

  } catch (error) {
    logger.error('Command execution failed', { sessionId, command, error });
    if ((error as any)?.code === ErrorCode.ETIMEOUT) {
      throw error;
    }
    throw wrapError(error, ErrorCode.ECONN, 'Failed to execute command on remote system');
  }
}

/**
 * Executes a command with sudo privileges
 */
export async function execSudo(
  sessionId: string,
  command: string,
  password?: string,
  cwd?: string,
  timeoutMs?: number
): Promise<ExecResult> {
  logger.debug('Executing sudo command', { sessionId, command, cwd, timeoutMs });

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }

  const timer = createTimer();

  try {
    // Build the sudo command
    let sudoCommand = command;

    // Change directory if provided
    if (cwd) {
      sudoCommand = `cd ${JSON.stringify(cwd)} && ${command}`;
    }

    let fullCommand: string;

    if (password) {
      // Use sudo -S -n to read password from stdin and never prompt
      fullCommand = `echo ${JSON.stringify(password)} | sudo -S -n ${sudoCommand}`;
    } else {
      // Try without password using -n (never prompt for password)
      fullCommand = `sudo -n ${sudoCommand}`;
    }

    // Execute with optional timeout
    let result;
    if (timeoutMs) {
      result = await Promise.race([
        session.ssh.execCommand(fullCommand),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(createTimeoutError(
            `Sudo command timed out after ${timeoutMs}ms`,
            'Increase timeout or optimize the command'
          )), timeoutMs)
        )
      ]);
    } else {
      result = await session.ssh.execCommand(fullCommand);
    }

    // Check if sudo failed due to password issues
    if (result.code !== 0 && result.stderr) {
      const stderrLower = result.stderr.toLowerCase();
      if (stderrLower.includes('password') ||
        stderrLower.includes('authentication') ||
        stderrLower.includes('sorry')) {
        throw createSudoError(
          'Sudo authentication failed',
          'Provide a valid sudo password or ensure NOPASSWD is configured'
        );
      }
    }

    const execResult: ExecResult = {
      code: result.code || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      durationMs: timer.elapsed()
    };

    logger.debug('Sudo command execution completed', {
      sessionId,
      code: execResult.code,
      durationMs: execResult.durationMs
    });

    return execResult;

  } catch (error) {
    if ((error as any)?.code === ErrorCode.ETIMEOUT) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('sudo')) {
      throw error;
    }

    logger.error('Sudo command execution failed', { sessionId, command, error });
    throw wrapError(error, ErrorCode.ENOSUDO, 'Failed to execute sudo command on remote system');
  }
}

/**
 * Checks if a command exists on the remote system
 */
export async function commandExists(sessionId: string, command: string): Promise<boolean> {
  try {
    const result = await execCommand(sessionId, `which ${command}`);
    return result.code === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Gets the available shell on the remote system
 */
export async function getAvailableShell(sessionId: string): Promise<string> {
  const shells = ['bash', 'zsh', 'sh'];

  for (const shell of shells) {
    if (await commandExists(sessionId, shell)) {
      logger.debug('Found available shell', { sessionId, shell });
      return shell;
    }
  }

  logger.warn('No standard shell found, defaulting to sh', { sessionId });
  return 'sh';
}

/**
 * Executes a command with proper shell detection
 */
export async function execWithShell(
  sessionId: string,
  command: string,
  cwd?: string,
  env?: Record<string, string>
): Promise<ExecResult> {
  const shell = await getAvailableShell(sessionId);

  // Build the command with proper shell
  let fullCommand = command;

  // Set environment variables if provided
  if (env && Object.keys(env).length > 0) {
    const envVars = Object.entries(env)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    fullCommand = `${envVars} ${command}`;
  }

  // Change directory if provided
  if (cwd) {
    fullCommand = `cd ${JSON.stringify(cwd)} && ${fullCommand}`;
  }

  // Use the detected shell with login shell behavior
  const shellCommand = `${shell} -lc ${JSON.stringify(fullCommand)}`;

  return execCommand(sessionId, shellCommand);
}
