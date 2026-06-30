import { ReadLog } from '../../application/use-cases/read-log.js'
import { type LogFormatter } from '../../application/ports/log-formatter.port.js'
import { type LogReadBuffer } from '../../application/ports/log-read-buffer.port.js'
import { createLogFormatter } from '../create-log-formatter.js'

/**
 * Constructs a `ReadLog` use case over an in-memory log buffer.
 *
 * @param buffer - Ring or buffer exposing recent entries
 * @param formatter - Optional pretty-line formatter (defaults to `createLogFormatter()`)
 * @returns The pre-wired use case instance
 */
export function createReadLog(buffer: LogReadBuffer, formatter?: LogFormatter): ReadLog {
  return new ReadLog(buffer, formatter ?? createLogFormatter())
}
