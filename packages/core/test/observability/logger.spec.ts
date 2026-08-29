import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../../src/observability/logger.js'
import { type LogLevel, type LoggerPort } from '../../src/observability/logger.port.js'

describe('Logger proxy', () => {
  it('given no implementation, when info or error runs, then it does not throw', () => {
    expect(() => Logger.info('hello')).not.toThrow()
    expect(() => Logger.error('fail', { reason: 'x' }, new Error('boom'))).not.toThrow()
    expect(() => Logger.debug('d')).not.toThrow()
    expect(() => Logger.log('l')).not.toThrow()
    expect(() => Logger.warn('w')).not.toThrow()
    expect(() => Logger.fatal('f')).not.toThrow()
    expect(() => Logger.trace('t')).not.toThrow()
  })

  it('given no implementation, when methods run, then they do not write to console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    Logger.info('hello')
    Logger.debug('d')
    Logger.log('l')
    expect(log).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    log.mockRestore()
    info.mockRestore()
    error.mockRestore()
  })

  it('given an implementation, when log runs, then it aliases info', () => {
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

    Logger.log('aliased', { a: 1 })
    Logger.info('direct', { b: 2 })

    expect(impl.info).toHaveBeenCalledWith('aliased', { a: 1 })
    expect(impl.info).toHaveBeenCalledWith('direct', { b: 2 })
    expect(impl.log).not.toHaveBeenCalled()
    Logger.resetImplementation()
  })

  it('given an implementation, when methods run, then they delegate', () => {
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

/** Minimal console logger used to document global logging prefix conventions. */
class MinimalConsoleLogger implements LoggerPort {
  /** @inheritdoc */
  log(message: string, context?: object): void {
    this.info(message, context)
  }

  /** @inheritdoc */
  info(message: string, _context?: object): void {
    console.info(message)
  }

  /** @inheritdoc */
  debug(message: string, _context?: object): void {
    console.debug(message)
  }

  /** @inheritdoc */
  warn(message: string, _context?: object): void {
    console.warn(message)
  }

  /** @inheritdoc */
  error(message: string, _context?: object, _error?: Error): void {
    console.error(message)
  }

  /** @inheritdoc */
  fatal(message: string, _context?: object, _error?: Error): void {
    console.error(`[FATAL] ${message}`)
  }

  /** @inheritdoc */
  trace(message: string, _context?: object): void {
    console.log(`[TRACE] ${message}`)
  }

  /** @inheritdoc */
  isLevelEnabled(_level: LogLevel): boolean {
    return true
  }

  /** @inheritdoc */
  child(_context: object): LoggerPort {
    return this
  }
}

describe('minimal console logger contract', () => {
  it('given a minimal console logger, when fatal runs, then stderr receives a [FATAL] prefix', () => {
    const logger = new MinimalConsoleLogger()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.fatal('boom')

    expect(errorSpy).toHaveBeenCalledWith('[FATAL] boom')
    errorSpy.mockRestore()
  })

  it('given a minimal console logger, when trace runs, then stdout receives a [TRACE] prefix', () => {
    const logger = new MinimalConsoleLogger()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.trace('detail')

    expect(logSpy).toHaveBeenCalledWith('[TRACE] detail')
    logSpy.mockRestore()
  })
})
