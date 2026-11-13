import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerError,
  GraphIndexWorkerExitError,
  GraphIndexProgressHandlerError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerSignalError,
  GraphIndexWorkerStartError,
} from '../../../src/domain/errors/isolated-graph-index-errors.js'
import { type GraphIndexWorkerEvent } from '../../../src/domain/value-objects/graph-index-worker-types.js'
import {
  acquireGraphIndexLockLeaseByStoragePath,
  getGraphIndexLockPathForStoragePath,
} from '../../../src/infrastructure/index-lock.js'
import { GRAPH_INDEX_PROTOCOL } from '../../../src/infrastructure/isolated-index-worker/protocol.js'
import {
  runIsolatedGraphIndexWithRuntime,
  type IsolatedGraphIndexRuntime,
  type IsolatedGraphIndexTimers,
} from '../../../src/infrastructure/isolated-index-worker/supervisor.js'

const taskModuleUrl = pathToFileURL(join(tmpdir(), 'specd-isolated-task.js'))
const workerModuleUrl = pathToFileURL(join(tmpdir(), 'specd-isolated-worker.js'))

type FakeChild = ChildProcess & EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  Object.assign(child, {
    connected: true,
    exitCode: null,
    killed: false,
    stdout,
    stderr,
    send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => callback(null)),
    disconnect: vi.fn(),
    kill: vi.fn(),
  })
  return child
}

function createFakeTimers(): {
  timers: IsolatedGraphIndexTimers
  advanceTime: (ms: number) => void
} {
  let currentTime = 1000
  const intervals = new Map<number, { fn: () => void; ms: number; nextAt: number }>()
  let nextId = 1

  return {
    timers: {
      now: () => currentTime,
      setInterval: (fn: () => void, ms: number) => {
        const id = nextId++
        intervals.set(id, { fn, ms, nextAt: currentTime + ms })
        return id
      },
      clearInterval: (handle: unknown) => {
        intervals.delete(handle as number)
      },
    },
    advanceTime: (ms: number) => {
      const targetTime = currentTime + ms
      while (currentTime < targetTime) {
        currentTime += 1000
        for (const entry of Array.from(intervals.values())) {
          if (currentTime >= entry.nextAt) {
            entry.nextAt = currentTime + entry.ms
            entry.fn()
          }
        }
      }
      currentTime = targetTime
    },
  }
}

describe('isolated graph-index supervisor', () => {
  let root: string | undefined
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  })

  function runtime(
    child: FakeChild,
    events = new EventEmitter(),
    options?: {
      execArgv?: readonly string[]
      timers?: IsolatedGraphIndexTimers
    },
  ): IsolatedGraphIndexRuntime {
    root = mkdtempSync(join(tmpdir(), 'specd-isolated-worker-'))
    return {
      fork: vi.fn(() => child) as unknown as IsolatedGraphIndexRuntime['fork'],
      process: Object.assign(events, {
        execPath: process.execPath,
        env: {},
        ...(options?.execArgv !== undefined ? { execArgv: options.execArgv } : {}),
      }) as unknown as IsolatedGraphIndexRuntime['process'],
      workerUrl: workerModuleUrl,
      acquireLock: (storageRoot, onStaleLockRecovered) =>
        acquireGraphIndexLockLeaseByStoragePath(storageRoot, {
          signalCleanup: 'exit-only',
          ...(onStaleLockRecovered !== undefined ? { onStaleLockRecovered } : {}),
        }),
      ...(options?.timers !== undefined ? { timers: options.timers } : {}),
    }
  }

  it('preserves result and synchronous A/B/C progress order before cleanup', async () => {
    const child = fakeChild()
    const events = new EventEmitter()
    const current = runtime(child, events)
    const progress: string[] = []
    const pending = runIsolatedGraphIndexWithRuntime<
      { readonly id: string },
      string,
      { readonly done: boolean }
    >(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: { id: 'x' },
        onProgress: (value) => progress.push(value),
      },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'progress', value: 'A' })
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'progress', value: 'B' })
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'progress', value: 'C' })
    child.emit('message', {
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'result',
      value: { done: true },
    })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toEqual({ done: true })
    expect(progress).toEqual(['A', 'B', 'C'])
    expect(child.disconnect).toHaveBeenCalledOnce()
    expect(events.listenerCount('SIGINT')).toBe(0)
  })

  it('rejects non-serializable public input with a typed error before forking', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const input = {
      storageRoot: root!,
      taskModule: taskModuleUrl,
      taskInput: { unsupported: () => undefined },
    }

    await expect(runIsolatedGraphIndexWithRuntime(input, current)).rejects.toBeInstanceOf(
      GraphIndexTaskContractError,
    )
    expect(current.fork).not.toHaveBeenCalled()
  })

  it('preserves duplicate-terminal protocol failure when termination exits by signal', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexWorkerProtocolError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('preserves malformed-message protocol failure when termination exits non-zero', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    child.emit('message', { protocol: 'invalid', type: 'result', value: null })
    child.emit('exit', 1, null)
    await expect(pending).rejects.toBeInstanceOf(GraphIndexWorkerProtocolError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('preserves a progress-handler failure when a subsequent message violates the protocol', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onProgress: () => {
          throw new Error('progress failed')
        },
      },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'progress', value: null })
    child.emit('message', { protocol: 'invalid', type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexProgressHandlerError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('preserves a task-execution failure when a subsequent message violates the protocol', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    child.emit('message', {
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'failure',
      category: 'task-execution',
      error: { name: 'Error', message: 'task failed', code: null, stack: null },
    })
    child.emit('message', { protocol: 'invalid', type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexTaskExecutionError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('classifies a clean exit without a terminal envelope', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    child.emit('exit', 0, null)
    await expect(pending).rejects.toBeInstanceOf(GraphIndexWorkerExitError)
  })

  it('settles a failed start send and releases its lease when the child never exits', async () => {
    const child = fakeChild()
    const sendError = new Error('IPC channel closed')
    child.send = vi.fn((_message: unknown, callback: (error: Error | null) => void) =>
      callback(sendError),
    ) as unknown as ChildProcess['send']
    const events = new EventEmitter()
    const current = runtime(child, events)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )

    let timeout: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      pending.then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), 100)
      }),
    ])
    if (timeout !== undefined) clearTimeout(timeout)

    expect(outcome.kind).toBe('rejected')
    if (outcome.kind !== 'rejected')
      throw new Error('The failed start send did not settle within 100ms.')
    expect(outcome.error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.disconnect).toHaveBeenCalledOnce()
    expect(events.listenerCount('SIGINT')).toBe(0)
    expect(events.listenerCount('SIGTERM')).toBe(0)
    expect(() => current.acquireLock(root!)).not.toThrow()
  })

  it('settles a synchronous start-send throw and releases its lease when the child never exits', async () => {
    const child = fakeChild()
    const sendError = new Error('IPC channel closed')
    child.send = vi.fn(() => {
      throw sendError
    }) as unknown as ChildProcess['send']
    const events = new EventEmitter()
    const current = runtime(child, events)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )

    let timeout: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      pending.then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), 100)
      }),
    ])
    if (timeout !== undefined) clearTimeout(timeout)

    expect(outcome.kind).toBe('rejected')
    if (outcome.kind !== 'rejected')
      throw new Error('The synchronous start-send throw did not settle within 100ms.')
    expect(outcome.error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.disconnect).toHaveBeenCalledOnce()
    expect(events.listenerCount('SIGINT')).toBe(0)
    expect(events.listenerCount('SIGTERM')).toBe(0)
    expect(() => current.acquireLock(root!)).not.toThrow()
  })

  it('settles and releases its lease when the child has no IPC channel and never exits', async () => {
    const child = fakeChild()
    Object.assign(child, { connected: false })
    const events = new EventEmitter()
    const current = runtime(child, events)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )

    let timeout: ReturnType<typeof setTimeout> | undefined
    const outcome = await Promise.race([
      pending.then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), 100)
      }),
    ])
    if (timeout !== undefined) clearTimeout(timeout)

    expect(outcome.kind).toBe('rejected')
    if (outcome.kind !== 'rejected')
      throw new Error('The child without IPC did not settle within 100ms.')
    expect(outcome.error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(events.listenerCount('SIGINT')).toBe(0)
    expect(events.listenerCount('SIGTERM')).toBe(0)
    expect(() => current.acquireLock(root!)).not.toThrow()
  })

  it('releases the lease on SIGBREAK and process exit', async () => {
    const child = fakeChild()
    const events = new EventEmitter()
    const current = runtime(child, events)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    events.emit('SIGBREAK')
    events.emit('exit')
    expect(child.kill).toHaveBeenCalledWith('SIGBREAK')
    child.emit('exit', null, 'SIGBREAK')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexWorkerSignalError)
    expect(events.listenerCount('SIGBREAK')).toBe(0)
    expect(events.listenerCount('exit')).toBe(0)
    expect(() => current.acquireLock(root!)).not.toThrow()
  })

  it('forks the child after a crashed run left a stale lock and warns the host', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const lockPath = getGraphIndexLockPathForStoragePath(root!)
    acquireGraphIndexLockLeaseByStoragePath(root!, { signalCleanup: 'exit-only' }).release()
    writeFileSync(lockPath, JSON.stringify({ version: 1, pid: 2_147_483_646, token: 'dead' }))
    const warnings: string[] = []
    const withRecovery: IsolatedGraphIndexRuntime = {
      ...current,
      acquireLock: (storageRoot, onStaleLockRecovered) =>
        acquireGraphIndexLockLeaseByStoragePath(storageRoot, {
          signalCleanup: 'exit-only',
          ...(onStaleLockRecovered !== undefined ? { onStaleLockRecovered } : {}),
        }),
    }

    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onWarning: (message) => warnings.push(message),
      },
      withRecovery,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()
    expect(withRecovery.fork).toHaveBeenCalledOnce()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('stale graph index lock')
  })

  it('keeps pid and liveness logic out of the supervisor source', () => {
    const source = readFileSync(
      new URL('../../../src/infrastructure/isolated-index-worker/supervisor.ts', import.meta.url),
      'utf-8',
    )
    expect(source).not.toContain('process.kill')
  })

  it('routes activity messages to onEvent in order and does not emit progress', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const progress: string[] = []
    const events: GraphIndexWorkerEvent[] = []
    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onProgress: (p) => progress.push(p as string),
        onEvent: (e) => events.push(e),
      },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'activity', item: 'src/a.ts' })
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'activity', item: 'src/b.ts' })
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()
    expect(progress).toHaveLength(0)
    expect(events).toEqual([
      { kind: 'activity', item: 'src/a.ts' },
      { kind: 'activity', item: 'src/b.ts' },
    ])
  })

  it('emits typed stale-lock-recovered event alongside warning text', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const lockPath = getGraphIndexLockPathForStoragePath(root!)
    acquireGraphIndexLockLeaseByStoragePath(root!, { signalCleanup: 'exit-only' }).release()
    writeFileSync(lockPath, JSON.stringify({ version: 1, pid: 2_147_483_646, token: 'dead' }))
    const warnings: string[] = []
    const events: GraphIndexWorkerEvent[] = []

    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onWarning: (message) => warnings.push(message),
        onEvent: (event) => events.push(event),
      },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()
    expect(warnings).toHaveLength(1)
    expect(events).toEqual([
      {
        kind: 'stale-lock-recovered',
        lockPath,
        pid: 2_147_483_646,
        reason: 'process-not-running',
      },
    ])
  })

  describe('receivers that throw', () => {
    const staleRuntime = (child: FakeChild): IsolatedGraphIndexRuntime => {
      const current = runtime(child)
      const lockPath = getGraphIndexLockPathForStoragePath(root!)
      acquireGraphIndexLockLeaseByStoragePath(root!, { signalCleanup: 'exit-only' }).release()
      writeFileSync(lockPath, JSON.stringify({ version: 1, pid: 2_147_483_646, token: 'dead' }))
      return {
        ...current,
        acquireLock: (storageRoot, onStaleLockRecovered) =>
          acquireGraphIndexLockLeaseByStoragePath(storageRoot, {
            signalCleanup: 'exit-only',
            ...(onStaleLockRecovered !== undefined ? { onStaleLockRecovered } : {}),
          }),
      }
    }

    it.each([
      [
        'onEvent',
        {
          onEvent: () => {
            throw new Error('boom')
          },
        },
      ],
      [
        'onWarning',
        {
          onWarning: () => {
            throw new Error('boom')
          },
        },
      ],
    ])(
      'maps a throwing %s during stale-lock recovery to a handler error',
      async (_name, receivers) => {
        // Given a stale lock that is recovered while a receiver throws
        const child = fakeChild()
        const current = staleRuntime(child)

        // When the run starts
        const pending = runIsolatedGraphIndexWithRuntime(
          { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null, ...receivers },
          current,
        )

        // Then the run fails with the handler error, no child was started, and the lock is free
        await expect(pending).rejects.toBeInstanceOf(GraphIndexProgressHandlerError)
        expect(current.fork).not.toHaveBeenCalled()
        expect(() => current.acquireLock(root!)).not.toThrow()
      },
    )

    it('terminates the child and maps a throwing onEvent on the silence tick', async () => {
      // Given a running child and a receiver that throws on worker-silent
      const child = fakeChild()
      const fakeTimers = createFakeTimers()
      const current = runtime(child, new EventEmitter(), { timers: fakeTimers.timers })
      const pending = runIsolatedGraphIndexWithRuntime(
        {
          storageRoot: root!,
          taskModule: taskModuleUrl,
          taskInput: null,
          onEvent: (event) => {
            if (event.kind === 'worker-silent') throw new Error('boom')
          },
        },
        current,
      )
      const assertion = expect(pending).rejects.toBeInstanceOf(GraphIndexProgressHandlerError)

      // When the child stays silent past the threshold
      fakeTimers.advanceTime(10_000)
      child.emit('exit', null, 'SIGTERM')

      // Then the run fails with the handler error after the child was terminated
      await assertion
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  it('configures fork with --expose-gc exactly once, preserves host execArgv, and pipes stdio', async () => {
    const child = fakeChild()
    const current = runtime(child, new EventEmitter(), {
      execArgv: ['--inspect=9229', '--expose-gc'],
    })
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()

    expect(current.fork).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({
        serialization: 'json',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--inspect=9229', '--expose-gc'],
      }),
    )

    const child2 = fakeChild()
    const current2 = runtime(child2, new EventEmitter(), {
      execArgv: ['--max-old-space-size=2048'],
    })
    const pending2 = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current2,
    )
    child2.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child2.emit('exit', 0, null)
    await expect(pending2).resolves.toBeNull()

    expect(current2.fork).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({
        execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      }),
    )
  })

  it('emits worker-silent after 10s of silence, repeats at most every 10s, and resets on message', async () => {
    const child = fakeChild()
    const fakeTimers = createFakeTimers()
    const current = runtime(child, new EventEmitter(), { timers: fakeTimers.timers })
    const events: GraphIndexWorkerEvent[] = []

    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onEvent: (event) => events.push(event),
      },
      current,
    )

    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'activity', item: 'large.ts' })
    expect(events).toEqual([{ kind: 'activity', item: 'large.ts' }])

    // 9 seconds - no warning
    fakeTimers.advanceTime(9000)
    expect(events).toHaveLength(1)

    // 10 seconds total - worker-silent emitted
    fakeTimers.advanceTime(1000)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({
      kind: 'worker-silent',
      item: 'large.ts',
      silentForMs: 10000,
    })

    // 5 seconds more - not repeated yet
    fakeTimers.advanceTime(5000)
    expect(events).toHaveLength(2)

    // 5 seconds more (10s total since last warning) - repeated
    fakeTimers.advanceTime(5000)
    expect(events).toHaveLength(3)
    expect(events[2]?.kind).toBe('worker-silent')

    // Message resets silence
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'activity', item: 'next.ts' })
    expect(events).toHaveLength(4)

    // 5s more - no warning
    fakeTimers.advanceTime(5000)
    expect(events).toHaveLength(4)

    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()
  })

  it('converts throwing onEvent handler into GraphIndexProgressHandlerError and terminates child', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onEvent: (event) => {
          if (event.kind === 'activity') throw new Error('event handler failed')
        },
      },
      current,
    )
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'activity', item: 'file.ts' })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexProgressHandlerError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('attaches diagnostics with cause, last activity, and stdio tails to worker failure', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )

    child.emit('message', {
      protocol: GRAPH_INDEX_PROTOCOL,
      type: 'activity',
      item: 'src/heavy.ts',
    })
    child.stdout.emit('data', 'Indexing heavy file\n')
    child.stderr.emit('data', 'Fatal error: JavaScript heap out of memory\n')
    child.emit('exit', 134, null)

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerError)
    const workerError = error as GraphIndexWorkerError
    expect(workerError.diagnostics).toBeDefined()
    expect(workerError.diagnostics?.cause).toBe('resource-limit')
    expect(workerError.diagnostics?.lastActivity?.item).toBe('src/heavy.ts')
    expect(workerError.diagnostics?.stdoutTail).toContain('Indexing heavy file')
    expect(workerError.diagnostics?.stderrTail).toContain(
      'Fatal error: JavaScript heap out of memory',
    )
  })

  it('detaches child listeners and disposes stdout/stderr tails upon settlement', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      current,
    )
    expect(child.listenerCount('message')).toBeGreaterThan(0)
    expect(child.stdout.listenerCount('data')).toBe(1)
    expect(child.stderr.listenerCount('data')).toBe(1)

    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await expect(pending).resolves.toBeNull()

    expect(child.listenerCount('message')).toBe(0)
    expect(child.stdout.listenerCount('data')).toBe(0)
    expect(child.stderr.listenerCount('data')).toBe(0)
  })

  it('does not attach diagnostics to contract error thrown before fork', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: { invalid: () => {} },
      },
      current,
    )
    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexTaskContractError)
    expect((error as GraphIndexWorkerError).diagnostics).toBeUndefined()
  })

  it('treats a message of another protocol version as a protocol failure and stops the child', async () => {
    // Given a child that answers with the previous protocol identifier
    const child = fakeChild()
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    // When it sends a result of version 1 and then exits
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')

    // Then the run fails as a protocol failure and the child was asked to stop
    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerProtocolError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('protocol')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('classifies a forwarded signal as cancelled in the diagnostics', async () => {
    const child = fakeChild()
    const events = new EventEmitter()
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child, events),
    )

    events.emit('SIGINT')
    child.emit('exit', null, 'SIGINT')

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerSignalError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('cancelled')
  })

  it('classifies a segmentation fault as a native crash in the diagnostics', async () => {
    const child = fakeChild()
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    child.emit('exit', null, 'SIGSEGV')

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerExitError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('native-crash')
  })

  it('attaches start-failed diagnostics when the child cannot be spawned', async () => {
    const child = fakeChild()
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    child.emit('error', new Error('spawn ENOENT'))

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('start-failed')
  })

  it('attaches start-failed diagnostics when the start message cannot be sent', async () => {
    const child = fakeChild()
    child.send = vi.fn((_message: unknown, callback: (error: Error | null) => void) =>
      callback(new Error('EPIPE')),
    ) as unknown as FakeChild['send']
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('start-failed')
  })

  it('attaches start-failed diagnostics when the child has no IPC channel', async () => {
    const child = fakeChild()
    Object.assign(child, { connected: false })
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GraphIndexWorkerStartError)
    expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('start-failed')
  })

  it('never writes the captured child output to the host streams', async () => {
    const child = fakeChild()
    const stdoutWrite = vi.spyOn(process.stdout, 'write')
    const stderrWrite = vi.spyOn(process.stderr, 'write')
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
      runtime(child),
    )

    child.stdout.emit('data', 'child standard output\n')
    child.stderr.emit('data', 'child standard error\n')
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await pending

    const written = [...stdoutWrite.mock.calls, ...stderrWrite.mock.calls].map((call) =>
      String(call[0]),
    )
    expect(written.some((text) => text.includes('child standard'))).toBe(false)
    stdoutWrite.mockRestore()
    stderrWrite.mockRestore()
  })

  it('keeps warning about a silent child but never terminates it', async () => {
    const child = fakeChild()
    const { timers, advanceTime } = createFakeTimers()
    const events: GraphIndexWorkerEvent[] = []
    const pending = runIsolatedGraphIndexWithRuntime(
      {
        storageRoot: root!,
        taskModule: taskModuleUrl,
        taskInput: null,
        onEvent: (event) => events.push(event),
      },
      runtime(child, new EventEmitter(), { timers }),
    )

    advanceTime(65_000)

    expect(events.filter((event) => event.kind === 'worker-silent').length).toBeGreaterThanOrEqual(
      3,
    )
    expect(child.kill).not.toHaveBeenCalled()
    child.emit('message', { protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: null })
    child.emit('exit', 0, null)
    await pending
  })

  describe('waiting for the child output streams', () => {
    function openStreams(child: FakeChild): void {
      Object.assign(child.stdout, { destroyed: false })
      Object.assign(child.stderr, { destroyed: false })
    }

    function timersWithOneShot(): {
      timers: IsolatedGraphIndexTimers
      fireOneShot: () => void
    } {
      const base = createFakeTimers().timers
      let pendingOneShot: (() => void) | undefined
      return {
        timers: {
          ...base,
          setTimeout: (fn: () => void) => {
            pendingOneShot = fn
            return 1
          },
          clearTimeout: () => {
            pendingOneShot = undefined
          },
        },
        fireOneShot: () => pendingOneShot?.(),
      }
    }

    it('classifies with output that arrives after exit and before close', async () => {
      // Given a child whose streams are still open when it exits
      const child = fakeChild()
      openStreams(child)
      const { timers } = timersWithOneShot()
      const pending = runIsolatedGraphIndexWithRuntime(
        { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
        runtime(child, new EventEmitter(), { timers }),
      )
      let settled = false
      void pending.catch(() => undefined).finally(() => (settled = true))

      // When the fatal report is read only after the exit event
      child.emit('exit', 134, null)
      await Promise.resolve()
      expect(settled).toBe(false)
      child.stderr.emit('data', 'FATAL ERROR: Reached heap limit Allocation failed\n')
      child.emit('close', 134, null)

      // Then the classification sees it
      const error = await pending.catch((e: unknown) => e)
      expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('resource-limit')
    })

    it('settles through the safety timer when the streams never close', async () => {
      const child = fakeChild()
      openStreams(child)
      const { timers, fireOneShot } = timersWithOneShot()
      const pending = runIsolatedGraphIndexWithRuntime(
        { storageRoot: root!, taskModule: taskModuleUrl, taskInput: null },
        runtime(child, new EventEmitter(), { timers }),
      )

      child.emit('exit', 1, null)
      fireOneShot()

      const error = await pending.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(GraphIndexWorkerExitError)
      expect((error as GraphIndexWorkerError).diagnostics?.cause).toBe('exited')
    })
  })
})
