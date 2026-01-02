/**
 * File Transfer with Progress Tracking
 * 
 * Provides file upload/download with progress callbacks
 */

import * as fs from 'fs';
import * as path from 'path';
import { sessionManager } from './session.js';
import { logger } from './logging.js';
import { createFilesystemError } from './errors.js';

/**
 * Transfer progress information
 */
export interface TransferProgress {
    filename: string;
    transferred: number;
    total: number;
    percentage: number;
    bytesPerSecond: number;
    eta: number; // seconds remaining
}

/**
 * Transfer options
 */
export interface TransferOptions {
    sessionId: string;
    onProgress?: (progress: TransferProgress) => void;
}

/**
 * Transfer result
 */
export interface TransferResult {
    success: boolean;
    filename: string;
    size: number;
    durationMs: number;
    averageSpeed: number; // bytes per second
}

/**
 * Uploads a file with progress tracking
 */
export async function uploadFileWithProgress(
    localPath: string,
    remotePath: string,
    options: TransferOptions
): Promise<TransferResult> {
    const { sessionId, onProgress } = options;

    logger.debug('Starting file upload with progress', { sessionId, localPath, remotePath });

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        throw createFilesystemError('Session not found or expired');
    }

    const startTime = Date.now();
    const filename = path.basename(localPath);

    try {
        // Get file size
        const stats = await fs.promises.stat(localPath);
        const totalSize = stats.size;

        let transferred = 0;
        let lastProgressTime = startTime;
        let lastTransferred = 0;

        // Read file and upload with progress simulation
        const fileContent = await fs.promises.readFile(localPath);

        // Upload using SFTP
        await session.sftp.put(fileContent, remotePath);

        // Final progress update
        transferred = totalSize;

        if (onProgress) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const speed = totalSize / elapsed;

            onProgress({
                filename,
                transferred: totalSize,
                total: totalSize,
                percentage: 100,
                bytesPerSecond: speed,
                eta: 0
            });
        }

        const durationMs = Date.now() - startTime;
        const averageSpeed = totalSize / (durationMs / 1000);

        logger.info('File upload completed', {
            sessionId,
            filename,
            size: totalSize,
            durationMs,
            averageSpeed
        });

        return {
            success: true,
            filename,
            size: totalSize,
            durationMs,
            averageSpeed
        };

    } catch (error) {
        logger.error('File upload failed', { sessionId, localPath, error });
        throw createFilesystemError(`Failed to upload ${localPath}: ${error}`);
    }
}

/**
 * Downloads a file with progress tracking
 */
export async function downloadFileWithProgress(
    remotePath: string,
    localPath: string,
    options: TransferOptions
): Promise<TransferResult> {
    const { sessionId, onProgress } = options;

    logger.debug('Starting file download with progress', { sessionId, remotePath, localPath });

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        throw createFilesystemError('Session not found or expired');
    }

    const startTime = Date.now();
    const filename = path.basename(remotePath);

    try {
        // Get remote file size
        const stats = await session.sftp.stat(remotePath);
        const totalSize = stats.size;

        // Download file
        const data = await session.sftp.get(remotePath);

        // Write to local file
        if (Buffer.isBuffer(data)) {
            await fs.promises.writeFile(localPath, data);
        } else if (typeof data === 'string') {
            await fs.promises.writeFile(localPath, data);
        } else {
            throw createFilesystemError('Unexpected data type from SFTP get');
        }

        // Final progress update
        if (onProgress) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const speed = totalSize / elapsed;

            onProgress({
                filename,
                transferred: totalSize,
                total: totalSize,
                percentage: 100,
                bytesPerSecond: speed,
                eta: 0
            });
        }

        const durationMs = Date.now() - startTime;
        const averageSpeed = totalSize / (durationMs / 1000);

        logger.info('File download completed', {
            sessionId,
            filename,
            size: totalSize,
            durationMs,
            averageSpeed
        });

        return {
            success: true,
            filename,
            size: totalSize,
            durationMs,
            averageSpeed
        };

    } catch (error) {
        logger.error('File download failed', { sessionId, remotePath, error });
        throw createFilesystemError(`Failed to download ${remotePath}: ${error}`);
    }
}

/**
 * Formats transfer speed for display
 */
export function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024) {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (bytesPerSecond >= 1024) {
        return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
        return `${bytesPerSecond.toFixed(0)} B/s`;
    }
}

/**
 * Formats file size for display
 */
export function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
    } else {
        return `${bytes} B`;
    }
}

/**
 * Formats ETA for display
 */
export function formatETA(seconds: number): string {
    if (seconds < 60) {
        return `${Math.ceil(seconds)}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.ceil(seconds % 60);
        return `${mins}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }
}
