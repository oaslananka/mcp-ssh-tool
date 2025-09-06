import { NodeSSH } from 'node-ssh';
import { OSInfo } from './types.js';
import { logger } from './logging.js';
import { createFilesystemError } from './errors.js';

/**
 * Detects OS information on the remote system
 */
export async function detectOS(ssh: NodeSSH): Promise<OSInfo> {
  logger.debug('Starting OS detection');
  
  try {
    // Detect architecture
    const archResult = await ssh.execCommand('uname -m');
    const arch = archResult.stdout.trim() || 'unknown';
    
    // Detect shell
    const shellResult = await ssh.execCommand('echo $SHELL');
    const shell = shellResult.stdout.trim().split('/').pop() || 'unknown';
    
    // Detect distribution and version
    let distro = 'unknown';
    let version = 'unknown';
    let packageManager: OSInfo['packageManager'] = 'unknown';
    let init: OSInfo['init'] = 'unknown';
    
    // Try to detect distribution using various methods
    const detectionCommands = [
      'cat /etc/os-release',
      'cat /etc/lsb-release',
      'cat /etc/redhat-release',
      'cat /etc/debian_version',
      'uname -s'
    ];
    
    for (const cmd of detectionCommands) {
      try {
        const result = await ssh.execCommand(cmd);
        if (result.code === 0 && result.stdout.trim()) {
          const output = result.stdout.toLowerCase();
          
          if (cmd === 'cat /etc/os-release') {
            const lines = result.stdout.split('\n');
            for (const line of lines) {
              if (line.startsWith('ID=')) {
                distro = line.split('=')[1].replace(/"/g, '').trim();
              }
              if (line.startsWith('VERSION_ID=')) {
                version = line.split('=')[1].replace(/"/g, '').trim();
              }
            }
            break;
          } else if (cmd === 'cat /etc/lsb-release') {
            const lines = result.stdout.split('\n');
            for (const line of lines) {
              if (line.startsWith('DISTRIB_ID=')) {
                distro = line.split('=')[1].replace(/"/g, '').trim().toLowerCase();
              }
              if (line.startsWith('DISTRIB_RELEASE=')) {
                version = line.split('=')[1].replace(/"/g, '').trim();
              }
            }
            break;
          } else if (output.includes('red hat') || output.includes('rhel') || output.includes('centos')) {
            distro = 'rhel';
            const versionMatch = result.stdout.match(/(\d+\.\d+)/);
            if (versionMatch) {
              version = versionMatch[1];
            }
            break;
          } else if (output.includes('debian')) {
            distro = 'debian';
            version = result.stdout.trim();
            break;
          } else if (cmd === 'uname -s') {
            distro = result.stdout.trim().toLowerCase();
            break;
          }
        }
      } catch (error) {
        // Continue to next detection method
        logger.debug(`Detection command failed: ${cmd}`, { error });
      }
    }
    
    // Detect package manager based on distro and available commands
    const packageManagers = [
      { command: 'which apt', manager: 'apt' as const },
      { command: 'which dnf', manager: 'dnf' as const },
      { command: 'which yum', manager: 'yum' as const },
      { command: 'which pacman', manager: 'pacman' as const },
      { command: 'which apk', manager: 'apk' as const }
    ];
    
    for (const { command, manager } of packageManagers) {
      try {
        const result = await ssh.execCommand(command);
        if (result.code === 0) {
          packageManager = manager;
          break;
        }
      } catch (error) {
        // Continue to next package manager
      }
    }
    
    // Detect init system
    const initDetectionCommands = [
      'which systemctl',
      'which service',
      'ps -p 1 -o comm='
    ];
    
    for (const cmd of initDetectionCommands) {
      try {
        const result = await ssh.execCommand(cmd);
        if (result.code === 0) {
          if (cmd === 'which systemctl') {
            init = 'systemd';
            break;
          } else if (cmd === 'which service') {
            init = 'service';
            break;
          } else if (cmd === 'ps -p 1 -o comm=') {
            const output = result.stdout.trim().toLowerCase();
            if (output.includes('systemd')) {
              init = 'systemd';
            } else {
              init = 'service';
            }
            break;
          }
        }
      } catch (error) {
        // Continue to next init detection
      }
    }
    
    const osInfo: OSInfo = {
      distro,
      version,
      arch,
      shell,
      packageManager,
      init
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
