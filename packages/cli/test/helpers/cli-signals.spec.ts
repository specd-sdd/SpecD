import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCliSignalHandlers } from '../../src/helpers/cli-signals.js'
import {
  registerCliCleanup,
  resetCliCleanupForTests,
  runCliCleanup,
} from '../../src/helpers/cli-cleanup.js'
import { createProgram } from '../../src/program.js'

let remove: (() => void) | undefined

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
})

afterEach(() => {
  remove?.()
  remove = undefined
  resetCliCleanupForTests()
  vi.restoreAllMocks()
})

/**
 * Waits until the event loop has processed pending microtasks.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('installCliSignalHandlers', () => {
  it('runs cleanup on the first SIGINT and then exits with 130', async () => {
    const order: string[] = []
    registerCliCleanup(() => void order.push('cleanup'))
    vi.mocked(process.exit).mockImplementation(((code?: number) => {
      order.push(`exit:${code}`)
    }) as never)
    remove = installCliSignalHandlers()

    process.emit('SIGINT')
    await flush()

    expect(order).toEqual(['cleanup', 'exit:130'])
  })

  it('exits with 143 on SIGTERM after cleanup', async () => {
    const cleanup = vi.fn()
    registerCliCleanup(cleanup)
    remove = installCliSignalHandlers()

    process.emit('SIGTERM')
    await flush()

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(process.exit).toHaveBeenCalledWith(143)
  })

  it('forces an immediate exit on a second signal while cleanup is still running', async () => {
    registerCliCleanup(() => new Promise<void>(() => {}))
    remove = installCliSignalHandlers()

    process.emit('SIGINT')
    await flush()
    expect(process.exit).not.toHaveBeenCalled()

    process.emit('SIGINT')

    expect(process.exit).toHaveBeenCalledWith(130)
  })

  it('keeps the exit code of the first signal when a different signal follows (SIGINT then SIGTERM)', async () => {
    registerCliCleanup(() => new Promise<void>(() => {}))
    remove = installCliSignalHandlers()

    process.emit('SIGINT')
    await flush()
    process.emit('SIGTERM')

    expect(process.exit).toHaveBeenCalledWith(130)
    expect(process.exit).not.toHaveBeenCalledWith(143)
  })

  it('keeps the exit code of the first signal when a different signal follows (SIGTERM then SIGINT)', async () => {
    registerCliCleanup(() => new Promise<void>(() => {}))
    remove = installCliSignalHandlers()

    process.emit('SIGTERM')
    await flush()
    process.emit('SIGINT')

    expect(process.exit).toHaveBeenCalledWith(143)
    expect(process.exit).not.toHaveBeenCalledWith(130)
  })

  it('installs the SIGTERM handler on every platform, including win32', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
    try {
      const before = process.listenerCount('SIGTERM')

      remove = installCliSignalHandlers()

      expect(process.listenerCount('SIGTERM')).toBe(before + 1)
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
  })

  it('does not touch stdin, so prompt cancellation keeps its own Ctrl-C handling', () => {
    const keypress = process.stdin.listenerCount('keypress')
    const data = process.stdin.listenerCount('data')
    const setRawMode = vi.spyOn(process.stdin, 'removeAllListeners')

    remove = installCliSignalHandlers()

    expect(process.stdin.listenerCount('keypress')).toBe(keypress)
    expect(process.stdin.listenerCount('data')).toBe(data)
    expect(setRawMode).not.toHaveBeenCalled()
  })

  it('removes its handlers and leaves pre-existing listeners alone', () => {
    const existing = vi.fn()
    process.on('SIGINT', existing)
    const before = process.listenerCount('SIGINT')

    const uninstall = installCliSignalHandlers()
    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    expect(process.listeners('SIGINT')).toContain(existing)

    uninstall()
    expect(process.listenerCount('SIGINT')).toBe(before)
    expect(process.listeners('SIGINT')).toContain(existing)
    process.off('SIGINT', existing)
  })

  it('is not triggered by createProgram()', () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')

    createProgram()

    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })

  it('does not install anything at import time', async () => {
    // The registry is untouched until a signal arrives.
    await expect(runCliCleanup()).resolves.toBeUndefined()
  })
})
