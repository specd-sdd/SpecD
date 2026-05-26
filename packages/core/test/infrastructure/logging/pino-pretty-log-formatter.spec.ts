import { describe, expect, it } from 'vitest'
import { PinoPrettyLogFormatter } from '../../../src/infrastructure/logging/pino-pretty-log-formatter.js'

describe('PinoPrettyLogFormatter', () => {
  it('includes message in formatted line', () => {
    const formatter = new PinoPrettyLogFormatter({ colorize: false })
    const line = formatter.format({
      timestamp: new Date('2026-05-25T12:00:00.000Z'),
      level: 'warn',
      message: 'check',
      context: { source: 'test' },
    })
    expect(line).toContain('check')
  })
})
