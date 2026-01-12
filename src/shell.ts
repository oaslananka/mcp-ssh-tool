import { OSInfo } from './types.js';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function powerShellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildPosixCommand(
  command: string,
  cwd?: string,
  env?: Record<string, string>,
  shellName: 'sh' | 'bash' = 'sh'
): string {
  let fullCommand = command;

  if (env && Object.keys(env).length > 0) {
    const envVars = Object.entries(env)
      .map(([key, value]) => `${key}=${shellQuote(value)}`)
      .join(' ');
    fullCommand = `${envVars} ${fullCommand}`;
  }

  if (cwd) {
    fullCommand = `cd ${shellQuote(cwd)} && ${fullCommand}`;
  }

  return `${shellName} -lc ${shellQuote(fullCommand)}`;
}

export function buildPowerShellCommand(
  command: string,
  cwd?: string,
  env?: Record<string, string>
): string {
  const envPrefix = env && Object.keys(env).length > 0
    ? Object.entries(env)
        .map(([key, value]) => `$env:${key} = ${powerShellQuote(value)}`)
        .join('; ') + '; '
    : '';

  const cwdPrefix = cwd ? `Set-Location -Path ${powerShellQuote(cwd)}; ` : '';
  const script = `${envPrefix}${cwdPrefix}${command}`;

  return `powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ${powerShellQuote(script)}`;
}

export function buildRemoteCommand(
  command: string,
  osInfo: OSInfo,
  cwd?: string,
  env?: Record<string, string>
): string {
  if (osInfo.platform === 'windows') {
    return buildPowerShellCommand(command, cwd, env);
  }

  const shellName = osInfo.defaultShell === 'bash' ? 'bash' : 'sh';
  return buildPosixCommand(command, cwd, env, shellName);
}

export function buildSudoCommand(
  command: string,
  osInfo: OSInfo,
  password?: string,
  cwd?: string
): string {
  if (osInfo.platform === 'windows') {
    throw new Error('Sudo is not supported on Windows hosts');
  }

  let sudoCommand = command;

  if (cwd) {
    sudoCommand = `cd ${shellQuote(cwd)} && ${command}`;
  }

  const prefixed = password
    ? `echo ${shellQuote(password)} | sudo -S -n ${sudoCommand}`
    : `sudo -n ${sudoCommand}`;

  const shellName = osInfo.defaultShell === 'bash' ? 'bash' : 'sh';
  return buildPosixCommand(prefixed, undefined, undefined, shellName);
}

export function resolveRemoteTempDir(osInfo: OSInfo): string {
  if (osInfo.tempDir) {
    return osInfo.tempDir.replace(/\\\\/g, '/').replace(/\\/g, '/');
  }

  if (osInfo.platform === 'windows') {
    return 'C:/Windows/Temp';
  }

  return '/tmp';
}
