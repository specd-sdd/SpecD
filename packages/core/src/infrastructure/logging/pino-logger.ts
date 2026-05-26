/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns, jsdoc/require-description */
import { Writable } from 'node:stream'
import pino, { type LevelWithSilent, type Logger as PinoInstance } from 'pino'
import {
  type LogLevel,
  type LogDestination,
  type LogEntry,
  type LoggerPort,
} from '../../application/ports/logger.port.js'
import type { LogFormatter } from '../../application/ports/log-formatter.port.js'
import { logEntryFromPinoLine } from './log-entry-from-pino.js'
import { PinoPrettyLogFormatter } from './pino-pretty-log-formatter.js'

/** Narrows domain log levels to Pino's accepted level union. */
function toPinoLevel(level: string): LevelWithSilent {
  return level as LevelWithSilent
}

function toLine(chunk: unknown): string | null {
  if (typeof chunk === 'string') {
    return chunk.trim()
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8').trim()
  }
  return null
}

/** Creates a writable stream that converts JSON lines into LogEntry callbacks. */
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
        onLog(logEntryFromPinoLine(line))
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}

/** Pretty-prints pino JSON lines to stdout using {@link LogFormatter}. */
function createPrettyStream(formatter: LogFormatter): Writable {
  return new Writable({
    write(chunk, _encoding, callback): void {
      try {
        const line = toLine(chunk)
        if (line === null) {
          callback(new Error('Unsupported log chunk type for pretty destination'))
          return
        }
        if (line.length === 0) {
          callback()
          return
        }
        const entry = logEntryFromPinoLine(line)
        process.stdout.write(`${formatter.format(entry)}\n`)
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}

/** Resolves the stream implementation for each destination target. */
function createDestinationStream(destination: LogDestination, formatter: LogFormatter): unknown {
  if (destination.target === 'file') {
    return pino.destination({ dest: destination.path ?? './specd.log', sync: true })
  }
  if (destination.target === 'callback') {
    return createCallbackStream(destination.onLog ?? (() => {}))
  }
  if (destination.format === 'pretty') {
    return createPrettyStream(formatter)
  }
  return pino.destination(1)
}

/** Merges context and optional error into the payload object expected by pino. */
function normalizeContext(context?: object, error?: Error): object | undefined {
  if (context === undefined && error === undefined) {
    return undefined
  }
  if (context === undefined) {
    return { err: error }
  }
  if (error === undefined) {
    return context
  }
  return { ...context, err: error }
}

/** Pino-backed LoggerPort adapter. */
export class PinoLogger implements LoggerPort {
  /** @param logger - The underlying pino logger instance. */
  constructor(private readonly logger: PinoInstance) {}

  /** @inheritdoc */
  log(message: string, context?: object): void {
    this.logger.info(normalizeContext(context), message)
  }

  /** @inheritdoc */
  info(message: string, context?: object): void {
    this.logger.info(normalizeContext(context), message)
  }

  /** @inheritdoc */
  debug(message: string, context?: object): void {
    this.logger.debug(normalizeContext(context), message)
  }

  /** @inheritdoc */
  warn(message: string, context?: object): void {
    this.logger.warn(normalizeContext(context), message)
  }

  /** @inheritdoc */
  error(message: string, context?: object, error?: Error): void {
    this.logger.error(normalizeContext(context, error), message)
  }

  /** @inheritdoc */
  fatal(message: string, context?: object, error?: Error): void {
    this.logger.fatal(normalizeContext(context, error), message)
  }

  /** @inheritdoc */
  trace(message: string, context?: object): void {
    this.logger.trace(normalizeContext(context), message)
  }

  /** @inheritdoc */
  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(toPinoLevel(level))
  }

  /** @inheritdoc */
  child(context: object): LoggerPort {
    return new PinoLogger(this.logger.child(context))
  }
}

/** Creates a default logger routed to the provided destinations. */
export function createDefaultLogger(
  destinations: readonly LogDestination[],
  options?: { readonly formatter?: LogFormatter },
): LoggerPort {
  const formatter = options?.formatter ?? new PinoPrettyLogFormatter()
  const streams = destinations.map((destination) => ({
    level: toPinoLevel(destination.level),
    stream: createDestinationStream(destination, formatter) as pino.DestinationStream,
  }))

  const logger =
    streams.length === 0
      ? pino({ level: 'info' }, pino.destination(1))
      : pino({ level: 'trace' }, pino.multistream(streams))

  return new PinoLogger(logger)
}
