import { PackageManager, PackageResult, ServiceResult, LinesInFileResult, PatchResult } from './types.js';
import { createPackageManagerError, createSudoError, createFilesystemError, createPatchError } from './errors.js';
import { logger } from './logging.js';
import { execCommand, execSudo, commandExists } from './process.js';
import { readFile, writeFile, pathExists } from './fs-tools.js';
import { sessionManager } from './session.js';
import { resolveRemoteTempDir } from './shell.js';

/**
 * Ensures a package is installed on the system
 */
export async function ensurePackage(
  sessionId: string,
  packageName: string,
  sudoPassword?: string
): Promise<PackageResult> {
  logger.debug('Ensuring package is installed', { sessionId, packageName });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    // Detect OS and package manager
    const osInfo = await sessionManager.getOSInfo(sessionId);
    const pm = osInfo.packageManager;
    
    if (pm === 'unknown') {
      throw createPackageManagerError(
        'No supported package manager found',
        'Supported package managers: apt, dnf, yum, pacman, apk, zypper, brew'
      );
    }
    if (osInfo.platform === 'windows') {
      throw createPackageManagerError(
        'Package management on Windows hosts is not supported by this tool yet',
        'Use winget/choco manually or install via other Windows package workflows'
      );
    }
    
    logger.debug('Detected package manager', { sessionId, pm });
    
    // Check if package is already installed
    const isInstalled = await checkPackageInstalled(sessionId, packageName, pm);
    if (isInstalled) {
      logger.info('Package already installed', { sessionId, packageName });
      return {
        ok: true,
        pm,
        code: 0,
        stdout: `Package ${packageName} is already installed`,
        stderr: ''
      };
    }
    
    // Install the package
    const installCommand = getInstallCommand(pm, packageName);
    logger.debug('Installing package', { sessionId, packageName, command: installCommand });
    
    const runInstaller = pm === 'brew'
      ? () => execCommand(sessionId, installCommand)
      : () => execSudo(sessionId, installCommand, sudoPassword);

    const result = await runInstaller();
    
    const packageResult: PackageResult = {
      ok: result.code === 0,
      pm,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr
    };
    
    if (result.code === 0) {
      logger.info('Package installed successfully', { sessionId, packageName });
    } else {
      logger.error('Package installation failed', { sessionId, packageName, code: result.code });
    }
    
    return packageResult;
    
  } catch (error) {
    logger.error('Failed to ensure package', { sessionId, packageName, error });
    throw error;
  }
}

/**
 * Ensures a service is in the desired state
 */
export async function ensureService(
  sessionId: string,
  serviceName: string,
  state: 'started' | 'stopped' | 'restarted' | 'enabled' | 'disabled',
  sudoPassword?: string
): Promise<ServiceResult> {
  logger.debug('Ensuring service state', { sessionId, serviceName, state });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    // Detect init system
    const osInfo = await sessionManager.getOSInfo(sessionId);
    const initSystem = osInfo.init;
    
    if (initSystem === 'launchd') {
      throw createSudoError(
        'launchd services are not managed by this tool',
        'Use launchctl directly on macOS hosts'
      );
    }

    if (initSystem === 'windows-service') {
      throw createSudoError(
        'Windows services are not managed by this tool',
        'Use sc.exe or PowerShell to manage Windows services'
      );
    }

    if (initSystem === 'unknown') {
      throw createSudoError(
        'No supported init system found',
        'Supported init systems: systemd, service'
      );
    }
    
    logger.debug('Detected init system', { sessionId, initSystem });
    
    let command: string;
    
    if (initSystem === 'systemd') {
      switch (state) {
        case 'started':
          command = `systemctl start ${serviceName}`;
          break;
        case 'stopped':
          command = `systemctl stop ${serviceName}`;
          break;
        case 'restarted':
          command = `systemctl restart ${serviceName}`;
          break;
        case 'enabled':
          command = `systemctl enable ${serviceName}`;
          break;
        case 'disabled':
          command = `systemctl disable ${serviceName}`;
          break;
      }
    } else {
      // Traditional service command
      switch (state) {
        case 'started':
          command = `service ${serviceName} start`;
          break;
        case 'stopped':
          command = `service ${serviceName} stop`;
          break;
        case 'restarted':
          command = `service ${serviceName} restart`;
          break;
        case 'enabled':
          command = `chkconfig ${serviceName} on || update-rc.d ${serviceName} enable`;
          break;
        case 'disabled':
          command = `chkconfig ${serviceName} off || update-rc.d ${serviceName} disable`;
          break;
      }
    }
    
    logger.debug('Executing service command', { sessionId, serviceName, command });
    
    const result = await execSudo(sessionId, command, sudoPassword);
    
    const serviceResult: ServiceResult = {
      ok: result.code === 0
    };
    
    if (result.code === 0) {
      logger.info('Service state changed successfully', { sessionId, serviceName, state });
    } else {
      logger.error('Service state change failed', {
        sessionId,
        serviceName,
        state,
        code: result.code,
        stderr: result.stderr
      });
    }
    
    return serviceResult;
    
  } catch (error) {
    logger.error('Failed to ensure service state', { sessionId, serviceName, state, error });
    throw error;
  }
}

/**
 * Ensures specific lines exist in a file
 */
export async function ensureLinesInFile(
  sessionId: string,
  filePath: string,
  lines: string[],
  createIfMissing: boolean = true,
  sudoPassword?: string
): Promise<LinesInFileResult> {
  logger.debug('Ensuring lines in file', { sessionId, filePath, lineCount: lines.length });
  
  try {
    const osInfo = await sessionManager.getOSInfo(sessionId);
    let fileContent = '';
    let fileExists = false;
    
    // Check if file exists and read its content
    if (await pathExists(sessionId, filePath)) {
      fileExists = true;
      fileContent = await readFile(sessionId, filePath);
    } else if (!createIfMissing) {
      throw createFilesystemError(
        `File ${filePath} does not exist and createIfMissing is false`
      );
    }
    
    // Check which lines are missing
    const existingLines = fileContent.split('\n');
    const missingLines: string[] = [];
    
    for (const line of lines) {
      if (!existingLines.includes(line)) {
        missingLines.push(line);
      }
    }
    
    if (missingLines.length === 0) {
      logger.info('All lines already exist in file', { sessionId, filePath });
      return {
        ok: true,
        added: 0
      };
    }
    
    // Add missing lines
    const newContent = fileExists 
      ? fileContent + '\n' + missingLines.join('\n')
      : missingLines.join('\n');
    
    // Write file (may need sudo)
    try {
      await writeFile(sessionId, filePath, newContent);
    } catch (error) {
      if (sudoPassword) {
        // Try with sudo by writing to temp file and moving
        const tempDir = resolveRemoteTempDir(osInfo);
        const baseTempDir = tempDir.replace(/\/+$/, '');
        const tempFile = `${baseTempDir}/ssh-mcp-${Date.now()}.tmp`;
        await writeFile(sessionId, tempFile, newContent);
        
        const moveResult = await execSudo(
          sessionId,
          `mv ${tempFile} ${filePath}`,
          sudoPassword
        );
        
        if (moveResult.code !== 0) {
          throw createFilesystemError(
            `Failed to move temporary file to ${filePath}`,
            'Check file permissions and sudo access'
          );
        }
      } else {
        throw error;
      }
    }
    
    logger.info('Lines added to file successfully', {
      sessionId,
      filePath,
      added: missingLines.length
    });
    
    return {
      ok: true,
      added: missingLines.length
    };
    
  } catch (error) {
    logger.error('Failed to ensure lines in file', { sessionId, filePath, error });
    throw error;
  }
}

/**
 * Applies a patch to a file
 */
export async function applyPatch(
  sessionId: string,
  filePath: string,
  diff: string,
  sudoPassword?: string
): Promise<PatchResult> {
  logger.debug('Applying patch to file', { sessionId, filePath });
  
  try {
    const osInfo = await sessionManager.getOSInfo(sessionId);
    // Check if patch command is available
    const hasPatch = await commandExists(sessionId, 'patch');
    if (!hasPatch) {
      throw createPatchError(
        'patch command not found on remote system',
        'Install patch utility or apply changes manually'
      );
    }
    
    // Write patch to temporary file
    const tempDir = resolveRemoteTempDir(osInfo);
    const baseTempDir = tempDir.replace(/\/+$/, '');
    const tempPatchFile = `${baseTempDir}/ssh-mcp-patch-${Date.now()}.patch`;
    await writeFile(sessionId, tempPatchFile, diff);
    
    try {
      // Test patch first (dry run)
      const testResult = await execCommand(
        sessionId,
        `patch --dry-run -p0 ${filePath} < ${tempPatchFile}`
      );
      
      if (testResult.code !== 0) {
        throw createPatchError(
          'Patch would fail to apply',
          `Patch test failed: ${testResult.stderr}`
        );
      }
      
      // Apply patch
      const applyCommand = `patch -p0 ${filePath} < ${tempPatchFile}`;
      let result;
      
      if (sudoPassword) {
        result = await execSudo(sessionId, applyCommand, sudoPassword);
      } else {
        result = await execCommand(sessionId, applyCommand);
      }
      
      const patchResult: PatchResult = {
        ok: result.code === 0,
        changed: result.code === 0
      };
      
      if (result.code === 0) {
        logger.info('Patch applied successfully', { sessionId, filePath });
      } else {
        logger.error('Patch application failed', {
          sessionId,
          filePath,
          code: result.code,
          stderr: result.stderr
        });
      }
      
      return patchResult;
      
    } finally {
      // Clean up temporary patch file
      try {
        const cleanupCommand = osInfo.platform === 'windows'
          ? `Remove-Item -Path ${tempPatchFile} -Force -ErrorAction SilentlyContinue`
          : `rm -f ${tempPatchFile}`;
        await execCommand(sessionId, cleanupCommand);
      } catch (error) {
        logger.warn('Failed to clean up temporary patch file', { tempPatchFile, error });
      }
    }
    
  } catch (error) {
    logger.error('Failed to apply patch', { sessionId, filePath, error });
    throw error;
  }
}

/**
 * Checks if a package is installed using the appropriate package manager
 */
async function checkPackageInstalled(
  sessionId: string,
  packageName: string,
  pm: PackageManager
): Promise<boolean> {
  let checkCommand: string;
  
  switch (pm) {
    case 'apt':
      checkCommand = `dpkg -l ${packageName} | grep -q '^ii'`;
      break;
    case 'dnf':
    case 'yum':
      checkCommand = `${pm} list installed ${packageName}`;
      break;
    case 'pacman':
      checkCommand = `pacman -Q ${packageName}`;
      break;
    case 'apk':
      checkCommand = `apk info -e ${packageName}`;
      break;
    case 'zypper':
      checkCommand = `zypper se -i ${packageName}`;
      break;
    case 'brew':
      checkCommand = `brew list --versions ${packageName}`;
      break;
    default:
      return false;
  }
  
  try {
    const result = await execCommand(sessionId, checkCommand);
    return result.code === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Gets the install command for the appropriate package manager
 */
function getInstallCommand(pm: PackageManager, packageName: string): string {
  switch (pm) {
    case 'apt':
      return `apt-get update && apt-get install -y ${packageName}`;
    case 'dnf':
      return `dnf install -y ${packageName}`;
    case 'yum':
      return `yum install -y ${packageName}`;
    case 'pacman':
      return `pacman -S --noconfirm ${packageName}`;
    case 'apk':
      return `apk add ${packageName}`;
    case 'zypper':
      return `zypper install -y ${packageName}`;
    case 'brew':
      return `brew install ${packageName}`;
    default:
      throw createPackageManagerError(`Unsupported package manager: ${pm}`);
  }
}
