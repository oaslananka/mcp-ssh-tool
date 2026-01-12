import { NodeSSH } from 'node-ssh';
import { InitSystem, OSInfo, PackageManager, Platform, ShellType } from './types.js';
import { logger } from './logging.js';
import { createFilesystemError } from './errors.js';

async function safeExec(ssh: NodeSSH, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await ssh.execCommand(command);
    return {
      code: result.code ?? 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? ''
    };
  } catch (error) {
    logger.debug('OS detection command failed', { command, error });
    return { code: 1, stdout: '', stderr: String(error) };
  }
}

function normalizeWindowsPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.replace(/\\\\/g, '/').replace(/\\/g, '/');
}

/**
 * Detects OS information on the remote system
 */
export async function detectOS(ssh: NodeSSH): Promise<OSInfo> {
  logger.debug('Starting OS detection');
  
  try {
    // Detect architecture
    const archResult = await safeExec(ssh, 'uname -m');
    let arch = archResult.stdout.trim();
    if (!arch) {
      const winArch = await safeExec(ssh, 'powershell -NoLogo -NoProfile -Command "$env:PROCESSOR_ARCHITECTURE"');
      arch = winArch.stdout.trim();
    }
    if (!arch) {
      arch = 'unknown';
    }

    // Detect platform/kernel
    let platform: Platform = 'unknown';
    let distro = 'unknown';
    let version = 'unknown';
    let defaultShell: ShellType = 'unknown';
    let tempDir: string | undefined;

    const unameResult = await safeExec(ssh, 'uname -s');
    const uname = unameResult.stdout.trim().toLowerCase();

    if (uname.includes('linux')) {
      platform = 'linux';
    } else if (uname.includes('darwin')) {
      platform = 'darwin';
    } else if (uname.includes('windows')) {
      platform = 'windows';
    }

    // Windows fallback detection (when uname is not available)
    if (platform === 'unknown') {
      const winCheck = await safeExec(ssh, 'cmd /c ver');
      if (winCheck.code === 0 && winCheck.stdout) {
        platform = 'windows';
        version = winCheck.stdout.trim();
      }
    }

    // macOS detection fallback
    if (platform === 'unknown') {
      const macCheck = await safeExec(ssh, 'sw_vers -productName');
      if (macCheck.code === 0 && macCheck.stdout.toLowerCase().includes('mac')) {
        platform = 'darwin';
      }
    }

    // Detect shell
    if (platform === 'windows') {
      defaultShell = 'powershell';
      const psShell = await safeExec(ssh, 'echo $env:SHELL');
      const shell = psShell.stdout.trim();
      tempDir = normalizeWindowsPath((await safeExec(ssh, 'powershell -NoLogo -NoProfile -Command "$env:TEMP"')).stdout.trim()) || 'C:/Windows/Temp';

      let packageManager: PackageManager = 'unknown';
      const wingetCheck = await safeExec(ssh, 'powershell -NoLogo -NoProfile -Command "Get-Command winget -ErrorAction SilentlyContinue"');
      if (wingetCheck.code === 0 && wingetCheck.stdout.toLowerCase().includes('winget')) {
        packageManager = 'winget';
      } else {
        const chocoCheck = await safeExec(ssh, 'choco -v');
        if (chocoCheck.code === 0) {
          packageManager = 'choco';
        }
      }

      const osInfo: OSInfo = {
        platform,
        distro: 'windows',
        version,
        arch,
        shell: shell || 'powershell',
        packageManager,
        init: 'windows-service',
        defaultShell,
        tempDir
      };

      logger.debug('OS detection completed', osInfo);
      return osInfo;
    }

    const shellResult = await safeExec(ssh, 'echo $SHELL');
    const shell = shellResult.stdout.trim().split('/').pop() || 'unknown';

    // Linux distro detection
    if (platform === 'linux') {
      const detectionCommands = [
        'cat /etc/os-release',
        'cat /etc/lsb-release',
        'cat /etc/redhat-release',
        'cat /etc/debian_version'
      ];

      for (const cmd of detectionCommands) {
        const result = await safeExec(ssh, cmd);
        if (result.code !== 0 || !result.stdout.trim()) {
          continue;
        }

        const output = result.stdout.toLowerCase();

        if (cmd === 'cat /etc/os-release') {
          const lines = result.stdout.split('\n');
          for (const line of lines) {
            if (line.startsWith('ID=')) {
              distro = line.split('=')[1].replace(/\"/g, '').trim();
            }
            if (line.startsWith('VERSION_ID=')) {
              version = line.split('=')[1].replace(/\"/g, '').trim();
            }
          }
          break;
        } else if (cmd === 'cat /etc/lsb-release') {
          const lines = result.stdout.split('\n');
          for (const line of lines) {
            if (line.startsWith('DISTRIB_ID=')) {
              distro = line.split('=')[1].replace(/\"/g, '').trim().toLowerCase();
            }
            if (line.startsWith('DISTRIB_RELEASE=')) {
              version = line.split('=')[1].replace(/\"/g, '').trim();
            }
          }
          break;
        } else if (output.includes('red hat') || output.includes('rhel') || output.includes('centos')) {
          distro = 'rhel';
          const versionMatch = result.stdout.match(/(\\d+\\.\\d+)/);
          if (versionMatch) {
            version = versionMatch[1];
          }
          break;
        } else if (output.includes('debian')) {
          distro = 'debian';
          version = result.stdout.trim();
          break;
        }
      }
    }

    // macOS distro detection
    if (platform === 'darwin') {
      const productName = await safeExec(ssh, 'sw_vers -productName');
      const productVersion = await safeExec(ssh, 'sw_vers -productVersion');
      distro = productName.stdout.trim() || 'macos';
      version = productVersion.stdout.trim() || 'unknown';
      defaultShell = shell.includes('zsh') ? 'sh' : 'bash';
    }

    // Package manager detection
    let packageManager: PackageManager = 'unknown';
    if (platform === 'linux') {
      const packageManagers = [
        { command: 'command -v apt-get || which apt-get', manager: 'apt' as PackageManager },
        { command: 'command -v dnf || which dnf', manager: 'dnf' as PackageManager },
        { command: 'command -v yum || which yum', manager: 'yum' as PackageManager },
        { command: 'command -v pacman || which pacman', manager: 'pacman' as PackageManager },
        { command: 'command -v apk || which apk', manager: 'apk' as PackageManager },
        { command: 'command -v zypper || which zypper', manager: 'zypper' as PackageManager }
      ];

      for (const { command, manager } of packageManagers) {
        const result = await safeExec(ssh, command);
        if (result.code === 0) {
          packageManager = manager;
          break;
        }
      }
    } else if (platform === 'darwin') {
      const brewResult = await safeExec(ssh, 'command -v brew || which brew');
      if (brewResult.code === 0) {
        packageManager = 'brew';
      }
      defaultShell = shell.includes('zsh') ? 'sh' : 'bash';
    }

    // Init system detection
    let init: InitSystem = 'unknown';
    if (platform === 'linux') {
      const systemctlResult = await safeExec(ssh, 'command -v systemctl || which systemctl');
      const serviceResult = await safeExec(ssh, 'command -v service || which service');
      if (systemctlResult.code === 0) {
        init = 'systemd';
      } else if (serviceResult.code === 0) {
        init = 'service';
      }
    } else if (platform === 'darwin') {
      init = 'launchd';
    }

    tempDir = platform === 'darwin' || platform === 'linux' ? '/tmp' : tempDir;
    defaultShell = defaultShell === 'unknown' ? (shell.includes('bash') ? 'bash' : 'sh') : defaultShell;

    const osInfo: OSInfo = {
      platform,
      distro,
      version,
      arch,
      shell,
      packageManager,
      init,
      defaultShell,
      tempDir
    };

    logger.debug('OS detection completed', osInfo);
    return osInfo;

  } catch (error) {
    logger.error('Failed to detect OS information', { error });
    throw createFilesystemError(
      'Failed to detect OS information',
      'Ensure the SSH connection is working and the remote system responds to basic commands'
    );
  }
}
