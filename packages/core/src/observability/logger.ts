import { type LogLevel, type LoggerPort } from './logger.port.js'

/** No-op logger used before runtime wiring in the composition root. */
class NullLogger implements LoggerPort {
  /** No-op alias of `info`. */
  log(): void {}
  /** No-op info. */
  info(): void {}
  /** No-op debug. */
  debug(): void {}
  /** No-op warn. */
  warn(): void {}
  /** No-op error. */
  error(): void {}
  /** No-op fatal. */
  fatal(): void {}
  /** No-op trace. */
  trace(): void {}
  /**
   * Always reports levels as disabled.
   *
   * @returns Always false
   */
  isLevelEnabled(): boolean {
    return false
  }
  /**
   * Returns this no-op instance.
   *
   * @returns This no-op logger
   */
  child(): LoggerPort {
    return this
  }
}

/**
 * Ambient logger proxy used across core without constructor plumbing.
 *
 * The implementation is assigned by the composition root during startup.
 * Domain, application, infrastructure, and composition MAY import this module
 * for observability-only debug and diagnostic logging.
 */
export class Logger {
  private static impl: LoggerPort = new NullLogger()

  /**
   * Replaces the active logger implementation.
   *
   * @param logger - Logger port wired by the composition root
   */
  static setImplementation(logger: LoggerPort): void {
    Logger.impl = logger
  }

  /** Restores the default no-op logger implementation. */
  static resetImplementation(): void {
    Logger.impl = new NullLogger()
  }

  /**
   * Logs an info-level message via the active implementation (`log` aliases `info`).
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  static log(message: string, context?: object): void {
    Logger.impl.info(message, context)
  }

  /**
   * Logs an info-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  static info(message: string, context?: object): void {
    Logger.impl.info(message, context)
  }

  /**
   * Logs a debug-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  static debug(message: string, context?: object): void {
    Logger.impl.debug(message, context)
  }

  /**
   * Logs a warn-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  static warn(message: string, context?: object): void {
    Logger.impl.warn(message, context)
  }

  /**
   * Logs an error-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   * @param error - Optional error to attach
   */
  static error(message: string, context?: object, error?: Error): void {
    Logger.impl.error(message, context, error)
  }

  /**
   * Logs a fatal-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   * @param error - Optional error to attach
   */
  static fatal(message: string, context?: object, error?: Error): void {
    Logger.impl.fatal(message, context, error)
  }

  /**
   * Logs a trace-level message via the active implementation.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  static trace(message: string, context?: object): void {
    Logger.impl.trace(message, context)
  }

  /**
   * Returns whether the given level is enabled by the active implementation.
   *
   * @param level - Log level to query
   * @returns Whether the level is enabled
   */
  static isLevelEnabled(level: LogLevel): boolean {
    return Logger.impl.isLevelEnabled(level)
  }

  /**
   * Returns a child logger derived from the active implementation.
   *
   * @param context - Child logger context bindings
   * @returns Child logger port
   */
  static child(context: object): LoggerPort {
    return Logger.impl.child(context)
  }
}
