import type { LogFormatter } from '../application/ports/log-formatter.port.js'
import {
  PinoPrettyLogFormatter,
  type PinoPrettyLogFormatterOptions,
} from '../infrastructure/logging/pino-pretty-log-formatter.js'

/**
 * Creates the default {@link LogFormatter} for kernel, CLI, and readback.
 *
 * @param options - Passed to {@link PinoPrettyLogFormatter}
 * @returns Formatter instance (pino-pretty in v1)
 */
export function createLogFormatter(options?: PinoPrettyLogFormatterOptions): LogFormatter {
  return new PinoPrettyLogFormatter(options)
}
