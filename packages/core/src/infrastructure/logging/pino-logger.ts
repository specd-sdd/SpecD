import { Writable } from 'node:stream'
import pino, { type LevelWithSilent, type Logger as PinoInstance } from 'pino'
import pretty from 'pino-pretty'
import {
  type LogLevel,
  type LogDestination,
  type LogEntry,
  type LoggerPort,
} from '../../application/ports/logger.port.js'

/** Narrows domain log levels to Pino's accepted level union.
 *
 * @param level - Domain log level name
 * @returns Pino level token
 */
function toPinoLevel(level: string): LevelWithSilent {
  return level as LevelWithSilent
}

/**
 * Converts a log chunk into a trimmed line, or `null` when the type is unsupported.
 *
 * @param chunk - Raw stream chunk from pino output
 * @returns Trimmed line text, or null when unsupported
 */
function toLine(chunk: unknown): string | null {
  if (typeof chunk === 'string') return chunk.trim()
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8').trim()
  return null
}

/**
 * Parses a pino timestamp into a `Date`.
 *
 * @param value - Raw timestamp field from a pino JSON line
 * @returns Parsed timestamp, or epoch when unparseable
 */
function parseTimestamp(value: unknown): Date {
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(Date.parse(value))
  return new Date(0)
}

/**
 * Coerces a pino message field to a string.
 *
 * @param value - Raw message field from a pino JSON line
 * @returns Message text, or empty string when absent
 */
function parseMessage(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Creates a writable stream that converts JSON lines into LogEntry callbacks.
 *
 * @param onLog - Callback invoked for each parsed log entry
 * @returns Writable stream for pino multistream routing
 */
function createCallbackStream(onLog: (entry: LogEntry) => void): Writable {
  return new Writable({
    write(chunk, _encoding, callback): void {
      try {
        const line = toLine(chunk)
        if (line === null) {
          callback(new Error('Unsupported log chunk type for callback destination'))
          return
        }
        if (line.length === 0) {
          callback()
          return
        }
        const parsed = JSON.parse(line) as Record<string, unknown>
        const entry: LogEntry = {
          timestamp: parseTimestamp(parsed.time),
          level: typeof parsed.level === 'string' ? (parsed.level as LogEntry['level']) : 'info',
          message: parseMessage(parsed.msg),
          context: parsed,
          ...(parsed.err !== undefined ? { error: new Error(JSON.stringify(parsed.err)) } : {}),
        }
        onLog(entry)
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}

/**
 * Resolves the stream implementation for each destination target.
 *
 * @param destination - Configured log destination
 * @returns Pino-compatible destination stream
 */
function createDestinationStream(destination: LogDestination): unknown {
  if (destination.target === 'file') {
    return pino.destination({ dest: destination.path ?? './specd.log', sync: true })
  }
  if (destination.target === 'callback') {
    return createCallbackStream(destination.onLog ?? (() => {}))
  }
  if (destination.format === 'pretty') {
    return pretty({ colorize: true })
  }
  return pino.destination(1)
}

/**
 * Merges context and optional error into the payload object expected by pino.
 *
 * @param context - Optional structured context
 * @param error - Optional error to attach
 * @returns Normalized pino payload object, or undefined when empty
 */
function normalizeContext(context?: object, error?: Error): object | undefined {
  if (context === undefined && error === undefined) return undefined
  if (context === undefined) return { err: error }
  if (error === undefined) return context
  return { ...context, err: error }
}

/** Pino-backed LoggerPort adapter. */
export class PinoLogger implements LoggerPort {
  /**
   * Creates a logger adapter around a pino instance.
   *
   * @param logger - The underlying pino logger instance
   */
  constructor(private readonly logger: PinoInstance) {}

  /**
   * Logs an info-level message (`log` aliases `info`).
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  log(message: string, context?: object): void {
    this.logger.info(normalizeContext(context), message)
  }

  /**
   * Logs an info-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  info(message: string, context?: object): void {
    this.logger.info(normalizeContext(context), message)
  }

  /**
   * Logs a debug-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  debug(message: string, context?: object): void {
    this.logger.debug(normalizeContext(context), message)
  }

  /**
   * Logs a warn-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  warn(message: string, context?: object): void {
    this.logger.warn(normalizeContext(context), message)
  }

  /**
   * Logs an error-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   * @param error - Optional error to attach
   */
  error(message: string, context?: object, error?: Error): void {
    this.logger.error(normalizeContext(context, error), message)
  }

  /**
   * Logs a fatal-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   * @param error - Optional error to attach
   */
  fatal(message: string, context?: object, error?: Error): void {
    this.logger.fatal(normalizeContext(context, error), message)
  }

  /**
   * Logs a trace-level message.
   *
   * @param message - Log message
   * @param context - Optional structured context
   */
  trace(message: string, context?: object): void {
    this.logger.trace(normalizeContext(context), message)
  }

  /**
   * Reports whether the given level is enabled on the underlying pino logger.
   *
   * @param level - Log level to query
   * @returns Whether the level is enabled on the underlying pino logger
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(toPinoLevel(level))
  }

  /**
   * Returns a child logger with additional context bindings.
   *
   * @param context - Child logger context bindings
   * @returns A derived logger port sharing the pino backend
   */
  child(context: object): LoggerPort {
    return new PinoLogger(this.logger.child(context))
  }
}

/**
 * Creates a default logger routed to the provided destinations.
 *
 * @param destinations - Ordered list of log destinations
 * @returns Configured logger port
 */
export function createDefaultLogger(destinations: readonly LogDestination[]): LoggerPort {
  const streams = destinations.map((destination) => ({
    level: toPinoLevel(destination.level),
    stream: createDestinationStream(destination) as pino.DestinationStream,
  }))

  const logger =
    streams.length === 0
      ? pino({ level: 'info' }, pino.destination(1))
      : pino({ level: 'trace' }, pino.multistream(streams))

  return new PinoLogger(logger)
}
