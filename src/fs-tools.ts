import { FileStatInfo, DirEntry, DirListResult } from './types.js';
import { createFilesystemError, wrapError } from './errors.js';
import { logger } from './logging.js';
import { sessionManager } from './session.js';
import { ErrorCode } from './types.js';

/**
 * Reads a file from the remote system
 */
export async function readFile(
  sessionId: string,
  path: string,
  encoding: string = 'utf8'
): Promise<string> {
  logger.debug('Reading file', { sessionId, path, encoding });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    const data = await session.sftp.get(path);
    const result = Buffer.isBuffer(data) ? data.toString(encoding as any) : String(data);
    logger.debug('File read successfully', { sessionId, path, size: result.length });
    return result;
  } catch (error) {
    logger.error('Failed to read file', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to read file ${path}. Check if the file exists and is readable.`
    );
  }
}

/**
 * Writes data to a file on the remote system (atomic operation using temp file)
 */
export async function writeFile(
  sessionId: string,
  path: string,
  data: string,
  mode?: number
): Promise<boolean> {
  logger.debug('Writing file', { sessionId, path, size: data.length, mode });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    // Use atomic write: write to temp file, then rename
    const tempPath = `${path}.tmp.${Date.now()}`;
    
    try {
      // Write to temporary file
      await session.sftp.put(Buffer.from(data, 'utf8'), tempPath);
      
      // Set permissions if specified
      if (mode !== undefined) {
        await session.sftp.chmod(tempPath, mode);
      }
      
      // Atomic rename
      await session.sftp.rename(tempPath, path);
      
      logger.debug('File written successfully', { sessionId, path });
      return true;
    } catch (writeError) {
      // Clean up temp file on failure
      try {
        await session.sftp.delete(tempPath);
        logger.debug('Cleaned up temp file after error', { tempPath });
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file', { tempPath, cleanupError });
      }
      throw writeError;
    }
  } catch (error) {
    logger.error('Failed to write file', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to write file ${path}. Check directory permissions and disk space.`
    );
  }
}

/**
 * Gets file/directory statistics
 */
export async function statFile(
  sessionId: string,
  path: string
): Promise<FileStatInfo> {
  logger.debug('Getting file stats', { sessionId, path });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    const stats = await session.sftp.stat(path);
    
    let type: FileStatInfo['type'] = 'other';
    if ((stats as any).isFile && (stats as any).isFile()) {
      type = 'file';
    } else if ((stats as any).isDirectory && (stats as any).isDirectory()) {
      type = 'directory';
    } else if ((stats as any).isSymbolicLink && (stats as any).isSymbolicLink()) {
      type = 'symlink';
    }
    
    const statInfo: FileStatInfo = {
      size: stats.size,
      mtime: new Date((stats as any).mtime ? (stats as any).mtime * 1000 : Date.now()),
      mode: stats.mode,
      type
    };
    
    logger.debug('File stats retrieved', { sessionId, path, type, size: stats.size });
    return statInfo;
  } catch (error) {
    logger.error('Failed to get file stats', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to get stats for ${path}. Check if the path exists.`
    );
  }
}

/**
 * Lists directory contents with pagination
 */
export async function listDirectory(
  sessionId: string,
  path: string,
  page?: number,
  limit: number = 100
): Promise<DirListResult> {
  logger.debug('Listing directory', { sessionId, path, page, limit });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    const fileList = await session.sftp.list(path);
    
    // Convert to our DirEntry format
    const entries: DirEntry[] = fileList.map((item: any) => {
      let type: DirEntry['type'] = 'other';
      if (item.type === 'd') {
        type = 'directory';
      } else if (item.type === '-') {
        type = 'file';
      } else if (item.type === 'l') {
        type = 'symlink';
      }
      
      return {
        name: item.name,
        type,
        size: item.size,
        mtime: new Date(item.modifyTime),
        mode: item.rights ? parseInt(item.rights.toString(), 8) : undefined
      };
    });
    
    // Apply pagination if requested
    if (page !== undefined) {
      const startIndex = page * limit;
      const endIndex = startIndex + limit;
      const paginatedEntries = entries.slice(startIndex, endIndex);
      
      const hasMore = endIndex < entries.length;
      const nextToken = hasMore ? String(page + 1) : undefined;
      
      logger.debug('Directory listed with pagination', {
        sessionId,
        path,
        total: entries.length,
        page,
        returned: paginatedEntries.length,
        hasMore
      });
      
      return {
        entries: paginatedEntries,
        nextToken
      };
    }
    
    logger.debug('Directory listed', { sessionId, path, count: entries.length });
    return { entries };
  } catch (error) {
    logger.error('Failed to list directory', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to list directory ${path}. Check if the directory exists and is readable.`
    );
  }
}

/**
 * Creates directories recursively (mkdir -p equivalent)
 */
export async function makeDirectories(
  sessionId: string,
  path: string
): Promise<boolean> {
  logger.debug('Creating directories', { sessionId, path });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    await session.sftp.mkdir(path, true); // recursive = true
    logger.debug('Directories created successfully', { sessionId, path });
    return true;
  } catch (error) {
    logger.error('Failed to create directories', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to create directories ${path}. Check parent directory permissions.`
    );
  }
}

/**
 * Removes files or directories recursively (rm -rf equivalent)
 */
export async function removeRecursive(
  sessionId: string,
  path: string
): Promise<boolean> {
  logger.debug('Removing path recursively', { sessionId, path });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    // Check if path exists and get its type
    const stats = await session.sftp.stat(path);
    
    if ((stats as any).isDirectory && (stats as any).isDirectory()) {
      // Remove directory recursively
      await session.sftp.rmdir(path, true); // recursive = true
    } else {
      // Remove file
      await session.sftp.delete(path);
    }
    
    logger.debug('Path removed successfully', { sessionId, path });
    return true;
  } catch (error) {
    logger.error('Failed to remove path', { sessionId, path, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to remove ${path}. Check if the path exists and you have write permissions.`
    );
  }
}

/**
 * Renames/moves a file or directory
 */
export async function renameFile(
  sessionId: string,
  from: string,
  to: string
): Promise<boolean> {
  logger.debug('Renaming file', { sessionId, from, to });
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  
  try {
    await session.sftp.rename(from, to);
    logger.debug('File renamed successfully', { sessionId, from, to });
    return true;
  } catch (error) {
    logger.error('Failed to rename file', { sessionId, from, to, error });
    throw wrapError(
      error,
      ErrorCode.EFS,
      `Failed to rename ${from} to ${to}. Check if the source exists and destination is writable.`
    );
  }
}

/**
 * Checks if a path exists on the remote system
 */
export async function pathExists(sessionId: string, path: string): Promise<boolean> {
  try {
    await statFile(sessionId, path);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Gets the size of a file
 */
export async function getFileSize(sessionId: string, path: string): Promise<number> {
  const stats = await statFile(sessionId, path);
  return stats.size;
}

/**
 * Checks if a path is a directory
 */
export async function isDirectory(sessionId: string, path: string): Promise<boolean> {
  try {
    const stats = await statFile(sessionId, path);
    return stats.type === 'directory';
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a path is a file
 */
export async function isFile(sessionId: string, path: string): Promise<boolean> {
  try {
    const stats = await statFile(sessionId, path);
    return stats.type === 'file';
  } catch (error) {
    return false;
  }
}
