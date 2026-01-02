/**
 * Streaming Output Support
 * 
 * Provides real-time output streaming for long-running commands
 */

import { sessionManager } from './session.js';
import { logger } from './logging.js';

/**
 * Stream output chunk
 */
export interface StreamChunk {
    type: 'stdout' | 'stderr' | 'exit';
    data?: string;
    code?: number;
    timestamp: number;
}

/**
 * Stream execution options
 */
export interface StreamOptions {
    sessionId: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    onChunk?: (chunk: StreamChunk) => void;
}

/**
 * Stream execution result
 */
export interface StreamResult {
    code: number;
    chunks: StreamChunk[];
    stdout: string;
    stderr: string;
    durationMs: number;
}

/**
 * Executes a command with streaming output
 * Collects output in chunks for real-time feedback
 */
export async function execWithStreaming(options: StreamOptions): Promise<StreamResult> {
    const { sessionId, command, cwd, env, onChunk } = options;

    logger.debug('Starting streaming execution', { sessionId, command });

    const session = sessionManager.getSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found or expired`);
    }

    const startTime = Date.now();
    const chunks: StreamChunk[] = [];
    let fullStdout = '';
    let fullStderr = '';

    return new Promise((resolve, reject) => {
        // Build the command
        let fullCommand = command;

        if (env && Object.keys(env).length > 0) {
            const envVars = Object.entries(env)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .join(' ');
            fullCommand = `${envVars} ${command}`;
        }

        if (cwd) {
            fullCommand = `cd ${JSON.stringify(cwd)} && ${fullCommand}`;
        }

        // Use shell for streaming
        const shellCommand = `bash -c ${JSON.stringify(fullCommand)} 2>&1`;

        session.ssh.execCommand(shellCommand, {
            onStdout: (chunk: Buffer) => {
                const data = chunk.toString();
                fullStdout += data;

                const streamChunk: StreamChunk = {
                    type: 'stdout',
                    data,
                    timestamp: Date.now()
                };
                chunks.push(streamChunk);

                if (onChunk) {
                    onChunk(streamChunk);
                }
            },
            onStderr: (chunk: Buffer) => {
                const data = chunk.toString();
                fullStderr += data;

                const streamChunk: StreamChunk = {
                    type: 'stderr',
                    data,
                    timestamp: Date.now()
                };
                chunks.push(streamChunk);

                if (onChunk) {
                    onChunk(streamChunk);
                }
            }
        }).then((result) => {
            const exitChunk: StreamChunk = {
                type: 'exit',
                code: result.code || 0,
                timestamp: Date.now()
            };
            chunks.push(exitChunk);

            if (onChunk) {
                onChunk(exitChunk);
            }

            const streamResult: StreamResult = {
                code: result.code || 0,
                chunks,
                stdout: fullStdout,
                stderr: fullStderr,
                durationMs: Date.now() - startTime
            };

            logger.debug('Streaming execution completed', {
                sessionId,
                code: streamResult.code,
                chunkCount: chunks.length,
                durationMs: streamResult.durationMs
            });

            resolve(streamResult);
        }).catch(reject);
    });
}

/**
 * Formats streaming output for display
 */
export function formatStreamOutput(chunks: StreamChunk[]): string {
    return chunks
        .filter(c => c.type !== 'exit' && c.data)
        .map(c => c.data)
        .join('');
}
