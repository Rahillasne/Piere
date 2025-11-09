/**
 * Centralized Logging Utility
 *
 * Provides clean, environment-aware logging with configurable levels.
 * Replaces scattered console.log statements throughout the codebase.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

// Get log level from environment (default: INFO in prod, DEBUG in dev)
function getLogLevel(): LogLevel {
  const envLevel = import.meta.env.VITE_LOG_LEVEL?.toUpperCase();

  switch (envLevel) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'NONE':
      return LogLevel.NONE;
    default:
      // Default: DEBUG in development, WARN in production
      return import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN;
  }
}

const CURRENT_LEVEL = getLogLevel();

/**
 * Logger with module-based namespacing
 */
class Logger {
  private level: LogLevel;

  constructor(level: LogLevel) {
    this.level = level;
  }

  /**
   * Debug-level logging (verbose, development only)
   */
  debug(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[${module}] ${message}`, ...args);
    }
  }

  /**
   * Info-level logging (normal operation)
   */
  info(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(`✓ [${module}] ${message}`, ...args);
    }
  }

  /**
   * Warning-level logging (recoverable issues)
   */
  warn(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`⚠️  [${module}] ${message}`, ...args);
    }
  }

  /**
   * Error-level logging (critical issues)
   */
  error(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`❌ [${module}] ${message}`, ...args);
    }
  }

  /**
   * Special: Voice/Audio events (only in debug mode)
   */
  voice(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`🎤 [${module}] ${message}`, ...args);
    }
  }

  /**
   * Special: Compilation events (only in debug mode)
   */
  compile(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`🔨 [${module}] ${message}`, ...args);
    }
  }

  /**
   * Special: Function call events (only in debug mode)
   */
  fn(module: string, message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`🔧 [${module}] ${message}`, ...args);
    }
  }

  /**
   * Group logs together (collapsed in dev tools)
   */
  group(module: string, title: string, fn: () => void) {
    if (this.level <= LogLevel.DEBUG) {
      console.groupCollapsed(`[${module}] ${title}`);
      fn();
      console.groupEnd();
    }
  }
}

// Export singleton instance
export const logger = new Logger(CURRENT_LEVEL);

// Export convenience type
export type LoggerModule =
  | 'BrainstormView'
  | 'VoiceChat'
  | 'RealtimeSession'
  | 'ParallelCompilation'
  | 'BrainstormContext'
  | 'ThreeScene'
  | 'Worker'
  | 'Database';
