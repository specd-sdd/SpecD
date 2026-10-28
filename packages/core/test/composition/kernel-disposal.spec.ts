import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../src/application/logger.js'
import { DisposerFailedError } from '../../src/application/errors/disposer-failed-error.js'
import { InvalidDisposerError } from '../../src/application/errors/invalid-disposer-error.js'
import { RegistryConflictError } from '../../src/application/errors/registry-conflict-error.js'
import {
  KERNEL_DISPOSER_TIMEOUT_MS,
  createDispose,
  releaseAfterFailedConstruction,
  runDisposers,
  validateDisposers,
  type KernelDisposer,
} from '../../src/composition/kernel-disposal.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('validateDisposers', () => {
  it('accepts well-formed unique entries', () => {
    expect(() =>
      validateDisposers([
        { name: 'a', dispose: () => {} },
        { name: 'b', dispose: async () => {} },
      ]),
    ).not.toThrow()
  })

  it('rejects an empty name', () => {
    expect(() => validateDisposers([{ name: '', dispose: () => {} }])).toThrow(InvalidDisposerError)
  })

  it('rejects a non-callable dispose', () => {
    expect(() =>
      validateDisposers([{ name: 'a', dispose: 'nope' as unknown as () => void }]),
    ).toThrow(InvalidDisposerError)
  })

  it('rejects a duplicate name with a RegistryConflictError for the disposers registry', () => {
    const attempt = (): void =>
      validateDisposers([
        { name: 'plugins', dispose: () => {} },
        { name: 'plugins', dispose: () => {} },
      ])
    expect(attempt).toThrow(RegistryConflictError)
    expect(attempt).toThrow(/'plugins'.*'disposers'/)
  })
})

describe('runDisposers', () => {
  it('runs disposers in reverse registration order, awaiting each before the next', async () => {
    const events: string[] = []
    const make = (name: string): KernelDisposer => ({
      name,
      dispose: async () => {
        events.push(`start:${name}`)
        await Promise.resolve()
        await Promise.resolve()
        events.push(`end:${name}`)
      },
    })

    await runDisposers([make('a'), make('b'), make('c')])

    expect(events).toEqual(['start:c', 'end:c', 'start:b', 'end:b', 'start:a', 'end:a'])
  })

  it('isolates a failing disposer and aggregates DisposerFailedError entries', async () => {
    const ran: string[] = []
    const original = new Error('boom')
    const disposers: KernelDisposer[] = [
      { name: 'a', dispose: () => void ran.push('a') },
      {
        name: 'b',
        dispose: async () => {
          ran.push('b')
          throw original
        },
      },
      { name: 'c', dispose: () => void ran.push('c') },
    ]

    const failure = await runDisposers(disposers).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(ran).toEqual(['c', 'b', 'a'])
    expect(failure).toBeInstanceOf(AggregateError)
    const errors = (failure as AggregateError).errors as DisposerFailedError[]
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(DisposerFailedError)
    expect(errors[0]?.message).toBe("Disposer 'b' failed")
    expect(errors[0]?.cause).toBe(original)
    expect(errors[0]?.disposerName).toBe('b')
  })

  it('converts a synchronous throw into an isolated failure', async () => {
    const ran: string[] = []
    const failure = await runDisposers([
      { name: 'a', dispose: () => void ran.push('a') },
      {
        name: 'b',
        dispose: () => {
          throw new Error('sync')
        },
      },
    ]).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(ran).toEqual(['a'])
    expect(failure).toBeInstanceOf(AggregateError)
  })

  it('abandons a hanging disposer after the timeout, warns, and continues', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    const healthy = vi.fn()
    const hanging: KernelDisposer = { name: 'hanging', dispose: () => new Promise<void>(() => {}) }
    const settled = vi.fn()

    const promise = runDisposers([{ name: 'healthy', dispose: healthy }, hanging]).then(settled)
    await vi.advanceTimersByTimeAsync(KERNEL_DISPOSER_TIMEOUT_MS)
    await promise

    expect(KERNEL_DISPOSER_TIMEOUT_MS).toBe(5000)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("'hanging'")
    expect(healthy).toHaveBeenCalledTimes(1)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('does not report a timeout in the aggregate error and swallows a late rejection', async () => {
    vi.useFakeTimers()
    vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    let rejectLate: (reason: unknown) => void = () => {}
    const hanging: KernelDisposer = {
      name: 'late',
      dispose: () =>
        new Promise<void>((_, reject) => {
          rejectLate = reject
        }),
    }

    const promise = runDisposers([hanging])
    await vi.advanceTimersByTimeAsync(KERNEL_DISPOSER_TIMEOUT_MS)
    await expect(promise).resolves.toBeUndefined()
    rejectLate(new Error('too late'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('unrefs the timeout timer and clears it after a normal disposer', async () => {
    const unref = vi.fn()
    const handle = { unref } as unknown as ReturnType<typeof setTimeout>
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => handle)
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {})

    await runDisposers([{ name: 'a', dispose: () => {} }])

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), KERNEL_DISPOSER_TIMEOUT_MS)
    expect(unref).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle)
  })

  it('resolves without doing any work for an empty list', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    await expect(runDisposers([])).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('createDispose', () => {
  it('shares one promise across repeated and concurrent calls and runs each disposer once', async () => {
    const run = vi.fn()
    const dispose = createDispose([{ name: 'a', dispose: run }])

    const first = dispose()
    const second = dispose()
    await first
    const third = dispose()

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('releaseAfterFailedConstruction', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
  })

  it('releases well-formed entries once and ignores malformed ones', async () => {
    const good = vi.fn()
    await releaseAfterFailedConstruction([
      { name: 'good', dispose: good },
      { name: '', dispose: vi.fn() },
      { dispose: vi.fn() },
      null,
    ])
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('never throws and reports failures as a warning', async () => {
    await expect(
      releaseAfterFailedConstruction([
        {
          name: 'bad',
          dispose: () => {
            throw new Error('boom')
          },
        },
      ]),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
