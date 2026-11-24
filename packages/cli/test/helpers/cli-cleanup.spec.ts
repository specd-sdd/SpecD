import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerCliCleanup,
  resetCliCleanupForTests,
  runCliCleanup,
} from '../../src/helpers/cli-cleanup.js'

afterEach(() => {
  vi.restoreAllMocks()
  resetCliCleanupForTests()
})

describe('CLI cleanup registry', () => {
  it('runs cleanups in reverse registration order, awaiting each', async () => {
    const events: string[] = []
    const make = (name: string) => async (): Promise<void> => {
      events.push(`start:${name}`)
      await Promise.resolve()
      events.push(`end:${name}`)
    }
    registerCliCleanup(make('a'))
    registerCliCleanup(make('b'))
    registerCliCleanup(make('c'))

    await runCliCleanup()

    expect(events).toEqual(['start:c', 'end:c', 'start:b', 'end:b', 'start:a', 'end:a'])
  })

  it('is idempotent and shares one promise across concurrent calls', async () => {
    const cleanup = vi.fn()
    registerCliCleanup(cleanup)

    const first = runCliCleanup()
    const second = runCliCleanup()
    await first
    const third = runCliCleanup()

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('does not stop other cleanups when one fails and reports a warning without throwing', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const ran: string[] = []
    registerCliCleanup(() => void ran.push('a'))
    registerCliCleanup(() => {
      throw new Error('boom')
    })
    registerCliCleanup(() => void ran.push('c'))
    const exitCode = process.exitCode

    await expect(runCliCleanup()).resolves.toBeUndefined()

    expect(ran).toEqual(['c', 'a'])
    expect(write).toHaveBeenCalledWith('warning: cleanup failed: boom\n')
    expect(process.exitCode).toBe(exitCode)
  })

  it('reports one warning line per failure of an AggregateError', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    registerCliCleanup(() => {
      throw new AggregateError([new Error('one'), new Error('two')], '2 failed')
    })

    await runCliCleanup()

    expect(write).toHaveBeenCalledWith('warning: cleanup failed: one\n')
    expect(write).toHaveBeenCalledWith('warning: cleanup failed: two\n')
  })

  it('reports the message of an AggregateError without inner errors', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    registerCliCleanup(() => {
      throw new AggregateError([], 'nothing inside')
    })

    await runCliCleanup()

    expect(write).toHaveBeenCalledWith('warning: cleanup failed: nothing inside\n')
  })

  it('flattens nested AggregateErrors recursively into one warning per leaf failure', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    registerCliCleanup(() => {
      throw new AggregateError(
        [
          new Error('one'),
          new AggregateError(
            [new Error('two'), new AggregateError([new Error('three')], 'inner')],
            'mid',
          ),
        ],
        'outer',
      )
    })

    await runCliCleanup()

    const lines = write.mock.calls.map((call) => String(call[0]))
    expect(lines).toEqual([
      'warning: cleanup failed: one\n',
      'warning: cleanup failed: two\n',
      'warning: cleanup failed: three\n',
    ])
  })

  it('invokes a cleanup registered after the run started', async () => {
    registerCliCleanup(() => {})
    await runCliCleanup()
    const late = vi.fn()

    registerCliCleanup(late)
    await Promise.resolve()

    expect(late).toHaveBeenCalledTimes(1)
  })

  it('reports a failure of a late cleanup as a warning and keeps the exit code', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    registerCliCleanup(() => {})
    await runCliCleanup()
    const exitCode = process.exitCode

    registerCliCleanup(() => {
      throw new Error('late boom')
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(write).toHaveBeenCalledWith('warning: cleanup failed: late boom\n')
    expect(process.exitCode).toBe(exitCode)
  })
})
