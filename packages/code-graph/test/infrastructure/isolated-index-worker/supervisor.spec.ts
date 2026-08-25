import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerExitError,
  GraphIndexProgressHandlerError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerStartError,
} from '../../../src/domain/errors/isolated-graph-index-errors.js'
import { acquireGraphIndexLockLeaseByStoragePath } from '../../../src/infrastructure/index-lock.js'
import {
  runIsolatedGraphIndexWithRuntime,
  type IsolatedGraphIndexRuntime,
} from '../../../src/infrastructure/isolated-index-worker/supervisor.js'

function fakeChild(): ChildProcess & EventEmitter {
  const child = new EventEmitter() as ChildProcess & EventEmitter
  Object.assign(child, {
    connected: true,
    exitCode: null,
    killed: false,
    send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => callback(null)),
    disconnect: vi.fn(),
    kill: vi.fn(),
  })
  return child
}

describe('isolated graph-index supervisor', () => {
  let root: string | undefined
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  })

  function runtime(
    child: ChildProcess & EventEmitter,
    events = new EventEmitter(),
  ): IsolatedGraphIndexRuntime {
    root = mkdtempSync(join(tmpdir(), 'specd-isolated-worker-'))
    return {
      fork: vi.fn(() => child) as unknown as IsolatedGraphIndexRuntime['fork'],
      process: Object.assign(events, {
        execPath: process.execPath,
        env: {},
      }) as unknown as IsolatedGraphIndexRuntime['process'],
      workerUrl: new URL('file:///tmp/isolated-worker.js'),
      acquireLock: (storageRoot) =>
        acquireGraphIndexLockLeaseByStoragePath(storageRoot, { signalCleanup: 'exit-only' }),
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
        taskModule: new URL('file:///tmp/task.js'),
        taskInput: { id: 'x' },
        onProgress: (value) => progress.push(value),
      },
      current,
    )
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'progress', value: 'A' })
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'progress', value: 'B' })
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'progress', value: 'C' })
    child.emit('message', {
      protocol: 'specd.graph-index.v1',
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
      taskModule: new URL('file:///tmp/task.js'),
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
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
      current,
    )
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'result', value: null })
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexWorkerProtocolError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('preserves malformed-message protocol failure when termination exits non-zero', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
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
        taskModule: new URL('file:///tmp/task.js'),
        taskInput: null,
        onProgress: () => {
          throw new Error('progress failed')
        },
      },
      current,
    )
    child.emit('message', { protocol: 'specd.graph-index.v1', type: 'progress', value: null })
    child.emit('message', { protocol: 'invalid', type: 'result', value: null })
    child.emit('exit', null, 'SIGTERM')
    await expect(pending).rejects.toBeInstanceOf(GraphIndexProgressHandlerError)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('preserves a task-execution failure when a subsequent message violates the protocol', async () => {
    const child = fakeChild()
    const current = runtime(child)
    const pending = runIsolatedGraphIndexWithRuntime(
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
      current,
    )
    child.emit('message', {
      protocol: 'specd.graph-index.v1',
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
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
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
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
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
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
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
      { storageRoot: root!, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
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
})
