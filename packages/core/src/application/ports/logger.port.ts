/** Supported logging severity levels. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

/** Supported output formats. */
export type LogFormat = 'json' | 'pretty'

/** Structured log event emitted by logger implementations. */
export interface LogEntry {
  readonly timestamp: Date
  readonly level: LogLevel
  readonly message: string
  readonly context: Record<string, unknown>
  readonly error?: Error
}

/** Destination routing configuration for multi-target logging. */
export interface LogDestination {
  readonly target: 'console' | 'file' | 'callback'
  readonly level: LogLevel
  readonly format: LogFormat
  readonly path?: string
  readonly onLog?: (entry: LogEntry) => void
}

/** Core logging contract used by application and infrastructure layers. */
export interface LoggerPort {
  log(message: string, context?: object): void
  info(message: string, context?: object): void
  debug(message: string, context?: object): void
  warn(message: string, context?: object): void
  error(message: string, context?: object, error?: Error): void
  fatal(message: string, context?: object, error?: Error): void
  trace(message: string, context?: object): void
  isLevelEnabled(level: LogLevel): boolean
  child(context: object): LoggerPort
}
