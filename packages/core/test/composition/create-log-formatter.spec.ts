import { describe, expect, it } from 'vitest'
import { createLogFormatter } from '../../src/composition/create-log-formatter.js'

describe('createLogFormatter', () => {
  it('returns a formatter that includes the log message', () => {
    const formatter = createLogFormatter({ colorize: false })
    const line = formatter.format({
      timestamp: new Date(),
      level: 'info',
      message: 'hello',
      context: {},
    })
    expect(line).toContain('hello')
  })
})
