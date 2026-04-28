import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../../src/application/logger.js'
import { type LoggerPort } from '../../src/application/ports/logger.port.js'

describe('Logger proxy', () => {
  it('does not throw when using default null implementation', () => {
    expect(() => Logger.info('hello')).not.toThrow()
    expect(() => Logger.error('fail', { reason: 'x' }, new Error('boom'))).not.toThrow()
  })

  it('delegates calls to the configured implementation', () => {
    const impl: LoggerPort = {
      log: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      isLevelEnabled: vi.fn(() => true),
      child: vi.fn(() => impl),
    }
    Logger.setImplementation(impl)

    Logger.info('msg', { a: 1 })
    Logger.error('oops', { b: 2 }, new Error('e'))
    Logger.child({ requestId: '1' })

    expect(impl.info).toHaveBeenCalledWith('msg', { a: 1 })
    expect(impl.error).toHaveBeenCalled()
    expect(Logger.isLevelEnabled('debug')).toBe(true)
    expect(impl.isLevelEnabled).toHaveBeenCalledWith('debug')
    expect(impl.child).toHaveBeenCalledWith({ requestId: '1' })
    Logger.resetImplementation()
  })
})
