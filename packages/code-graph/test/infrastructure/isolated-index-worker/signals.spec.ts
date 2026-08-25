import { EventEmitter } from 'node:events'
import { type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireGraphIndexLockLeaseByStoragePath } from '../../../src/infrastructure/index-lock.js'
import {
  runIsolatedGraphIndexWithRuntime,
  type IsolatedGraphIndexRuntime,
} from '../../../src/infrastructure/isolated-index-worker/supervisor.js'

describe('isolated graph-index supervisor signals', () => {
  let root: string | undefined
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'forwards %s once without removing host listeners',
    async (signal) => {
      root = mkdtempSync(join(tmpdir(), 'specd-worker-signal-'))
      const events = new EventEmitter()
      const existing = vi.fn()
      events.on(signal, existing)
      const child = Object.assign(new EventEmitter(), {
        connected: true,
        exitCode: null,
        killed: false,
        send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => callback(null)),
        disconnect: vi.fn(),
        kill: vi.fn(),
      }) as unknown as ChildProcess & EventEmitter
      const runtime: IsolatedGraphIndexRuntime = {
        fork: vi.fn(() => child) as unknown as IsolatedGraphIndexRuntime['fork'],
        process: Object.assign(events, {
          execPath: process.execPath,
          env: {},
        }) as unknown as IsolatedGraphIndexRuntime['process'],
        workerUrl: new URL('file:///tmp/isolated-worker.js'),
        acquireLock: (storageRoot) =>
          acquireGraphIndexLockLeaseByStoragePath(storageRoot, { signalCleanup: 'exit-only' }),
      }
      const pending = runIsolatedGraphIndexWithRuntime(
        { storageRoot: root, taskModule: new URL('file:///tmp/task.js'), taskInput: null },
        runtime,
      )
      events.emit(signal)
      events.emit(signal)
      expect(child.kill).toHaveBeenCalledTimes(1)
      expect(child.kill).toHaveBeenCalledWith(signal)
      child.emit('exit', null, signal)
      await expect(pending).rejects.toMatchObject({
        code: 'GRAPH_INDEX_WORKER_SIGNAL',
        signal,
        exitCode: null,
      })
      expect(events.listeners(signal)).toContain(existing)
      expect(events.listenerCount(signal)).toBe(1)
    },
  )
})
