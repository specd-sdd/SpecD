import { prettyFactory } from 'pino-pretty'
import type { LogEntry, LogLevel } from '../../application/ports/logger.port.js'
import type { LogFormatter } from '../../application/ports/log-formatter.port.js'

const PINO_LEVEL_NUMBERS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 0,
}

/** Options for {@link PinoPrettyLogFormatter}. */
export interface PinoPrettyLogFormatterOptions {
  /** When true, ANSI colors are applied (default true). */
  readonly colorize?: boolean
}

/** {@link LogFormatter} backed by `pino-pretty` `prettyFactory`. */
export class PinoPrettyLogFormatter implements LogFormatter {
  private readonly prettify: (inputData: object) => string

  /**
   * Builds a formatter using `pino-pretty` with optional colorization.
   *
   * @param options - Pretty-print options
   */
  constructor(options: PinoPrettyLogFormatterOptions = {}) {
    this.prettify = prettyFactory({
      colorize: options.colorize ?? true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
    })
  }

  /** @inheritdoc */
  format(entry: LogEntry): string {
    const record: Record<string, unknown> = {
      level: PINO_LEVEL_NUMBERS[entry.level] ?? 30,
      time: entry.timestamp.getTime(),
      msg: entry.message,
      ...entry.context,
    }
    if (entry.error !== undefined) {
      record.err = entry.error
    }
    const line = this.prettify(record)
    return line.endsWith('\n') ? line.slice(0, -1) : line
  }
}
