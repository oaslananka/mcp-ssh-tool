/**
 * Logging utilities with sensitive data redaction
 */

const SENSITIVE_FIELDS = ['password', 'privateKey', 'passphrase', 'sudoPassword'];
const REDACTED = '****';

/**
 * Redacts sensitive information from an object
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }
  
  if (typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
        redacted[key] = value ? REDACTED : value;
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }
  
  return obj;
}

/**
 * Redacts sensitive information from error messages and stack traces
 */
export function redactErrorMessage(message: string): string {
  // Common patterns that might contain sensitive data
  const patterns = [
    /password[=:\s]+[^\s]+/gi,
    /key[=:\s]+[^\s]+/gi,
    /passphrase[=:\s]+[^\s]+/gi,
    /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/gi
  ];
  
  let redacted = message;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  
  return redacted;
}

/**
 * Logger levels
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Simple logger with redaction
 */
export class Logger {
  private level: LogLevel;
  
  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }
  
  private log(level: LogLevel, message: string, data?: any) {
    if (level > this.level) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    
    let output = `[${timestamp}] ${levelName}: ${message}`;
    
    if (data !== undefined) {
      const redactedData = redactSensitiveData(data);
      output += ` ${JSON.stringify(redactedData)}`;
    }
    
    // Write to stderr to avoid interfering with MCP stdio
    process.stderr.write(output + '\n');
  }
  
  error(message: string, data?: any) {
    const redactedMessage = redactErrorMessage(message);
    this.log(LogLevel.ERROR, redactedMessage, data);
  }
  
  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }
  
  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }
  
  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }
}

// Global logger instance
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'error': LogLevel.ERROR,
  'warn': LogLevel.WARN,
  'info': LogLevel.INFO,
  'debug': LogLevel.DEBUG
};

const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const logLevel = LOG_LEVEL_MAP[envLogLevel] ?? LogLevel.INFO;

export const logger = new Logger(logLevel);

/**
 * Performance measurement utilities
 */
export class Timer {
  private startTime: number;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  elapsed(): number {
    return Date.now() - this.startTime;
  }
  
  reset(): void {
    this.startTime = Date.now();
  }
}

/**
 * Creates a timer for measuring operation duration
 */
export function createTimer(): Timer {
  return new Timer();
}
