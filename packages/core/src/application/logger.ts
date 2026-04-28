/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import { type LogLevel, type LoggerPort } from './ports/logger.port.js'

/** No-op logger used before runtime wiring in the composition root. */
class NullLogger implements LoggerPort {
  log(): void {}
  info(): void {}
  debug(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
  trace(): void {}
  isLevelEnabled(): boolean {
    return false
  }
  child(): LoggerPort {
    return this
  }
}

/**
 * Ambient logger proxy used across core without constructor plumbing.
 *
 * The implementation is assigned by the composition root during startup.
 */
export class Logger {
  private static impl: LoggerPort = new NullLogger()

  /** Replaces the active logger implementation. */
  static setImplementation(logger: LoggerPort): void {
    Logger.impl = logger
  }

  /** Restores the default no-op logger implementation. */
  static resetImplementation(): void {
    Logger.impl = new NullLogger()
  }

  /** Logs an info-level message via the active implementation. */
  static log(message: string, context?: object): void {
    Logger.impl.log(message, context)
  }

  /** Logs an info-level message via the active implementation. */
  static info(message: string, context?: object): void {
    Logger.impl.info(message, context)
  }

  /** Logs a debug-level message via the active implementation. */
  static debug(message: string, context?: object): void {
    Logger.impl.debug(message, context)
  }

  /** Logs a warn-level message via the active implementation. */
  static warn(message: string, context?: object): void {
    Logger.impl.warn(message, context)
  }

  /** Logs an error-level message via the active implementation. */
  static error(message: string, context?: object, error?: Error): void {
    Logger.impl.error(message, context, error)
  }

  /** Logs a fatal-level message via the active implementation. */
  static fatal(message: string, context?: object, error?: Error): void {
    Logger.impl.fatal(message, context, error)
  }

  /** Logs a trace-level message via the active implementation. */
  static trace(message: string, context?: object): void {
    Logger.impl.trace(message, context)
  }

  /** Returns whether the given level is enabled by the active implementation. */
  static isLevelEnabled(level: LogLevel): boolean {
    return Logger.impl.isLevelEnabled(level)
  }

  /** Returns a child logger derived from the active implementation. */
  static child(context: object): LoggerPort {
    return Logger.impl.child(context)
  }
}
