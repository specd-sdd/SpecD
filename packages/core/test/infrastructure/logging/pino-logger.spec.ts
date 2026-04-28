import { describe, expect, it, vi } from 'vitest'
import { createDefaultLogger } from '../../../src/infrastructure/logging/pino-logger.js'

describe('createDefaultLogger', () => {
  it('routes entries to callback destinations', async () => {
    const onLog = vi.fn()
    const logger = createDefaultLogger([
      {
        target: 'callback',
        level: 'info',
        format: 'json',
        onLog,
      },
    ])

    logger.info('hello', { feature: 'logging' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(onLog).toHaveBeenCalled()
    const firstCall = onLog.mock.calls[0]?.[0]
    expect(firstCall?.message).toBe('hello')
  })

  it('supports child logger creation', () => {
    const logger = createDefaultLogger([])
    const child = logger.child({ scope: 'child' })
    expect(typeof child.info).toBe('function')
    expect(() => child.info('ok')).not.toThrow()
  })

  it('exposes level checks', () => {
    const logger = createDefaultLogger([])
    expect(logger.isLevelEnabled('debug')).toBe(false)
    expect(logger.isLevelEnabled('info')).toBe(true)
  })
})
