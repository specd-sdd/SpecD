import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { SQLiteWorkerClient } from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { StoreWorkerError } from '../../../src/domain/errors/store-worker-error.js'

let tempDir: string | undefined

describe('SQLiteWorkerClient & Store Lifecycle', () => {
  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('shares in-flight initialization promise across concurrent open calls', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-open-race-'))
    const client = new SQLiteWorkerClient()

    expect(client.isOpen).toBe(false)
    expect(client.currentState).toBe('closed')

    const p1 = client.open(tempDir)
    const p2 = client.open(tempDir)
    const p3 = client.open(tempDir)

    expect(client.currentState).toBe('opening')

    await Promise.all([p1, p2, p3])

    expect(client.isOpen).toBe(true)
    expect(client.currentState).toBe('open')

    // Calling open while already open resolves immediately
    await client.open(tempDir)
    expect(client.isOpen).toBe(true)

    await client.close()
    expect(client.isOpen).toBe(false)
    expect(client.currentState).toBe('closed')
  })

  it('shares in-flight shutdown promise across concurrent close calls and is idempotent', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-close-race-'))
    const client = new SQLiteWorkerClient()
    await client.open(tempDir)

    expect(client.isOpen).toBe(true)

    const c1 = client.close()
    const c2 = client.close()
    const c3 = client.close()

    await Promise.all([c1, c2, c3])

    expect(client.isOpen).toBe(false)
    expect(client.currentState).toBe('closed')

    // Calling close when already closed completes without error
    await client.close()
    expect(client.currentState).toBe('closed')
  })

  it('rejects invalid maxPendingOperations strictly on open', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-invalid-ops-'))
    const client = new SQLiteWorkerClient()

    await expect(client.open(tempDir, { maxPendingOperations: 0 })).rejects.toThrow(
      /Invalid maxPendingOperations: expected integer >= 1/,
    )
    await expect(client.open(tempDir, { maxPendingOperations: -5 })).rejects.toThrow(
      /Invalid maxPendingOperations: expected integer >= 1/,
    )
    await expect(client.open(tempDir, { maxPendingOperations: 1.5 })).rejects.toThrow(
      /Invalid maxPendingOperations: expected integer >= 1/,
    )
    await expect(client.open(tempDir, { maxPendingOperations: Number.NaN })).rejects.toThrow(
      /Invalid maxPendingOperations: expected integer >= 1/,
    )
  })

  it('rejects new requests with StoreNotOpenError once closing begins while draining accepted ones', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-close-drain-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/drain.ts',
      configRelativePath: 'src/drain.ts',
      language: 'typescript',
      contentHash: 'sha256:drain',
      workspace: 'core',
    })
    await store.upsertFile(file, [], [])

    // Start a valid request
    const acceptedQuery = store.getFile(file.path)

    // Trigger close immediately
    const closePromise = store.close()

    // New request dispatched after close started must reject with StoreNotOpenError
    const rejectedQuery = store.getFile(file.path)
    await expect(rejectedQuery).rejects.toBeInstanceOf(StoreNotOpenError)

    // Accepted request drains and completes successfully
    const result = await acceptedQuery
    expect(result?.path).toBe(file.path)

    await closePromise
    expect(store.isOpen).toBe(false)
  })

  it('serializes recreate() strictly with concurrent queries in FIFO order', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-recreate-fifo-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file1 = createFileNode({
      path: 'core:src/1.ts',
      configRelativePath: 'src/1.ts',
      language: 'typescript',
      contentHash: 'sha256:1',
      workspace: 'core',
    })
    await store.upsertFile(file1, [], [])

    // Dispatch a read, a recreate, and a subsequent write concurrently
    const readBefore = store.getFile(file1.path)
    const recreateOp = store.recreate()
    const readAfter = recreateOp.then(() => store.getFile(file1.path))

    const [resBefore, , resAfter] = await Promise.all([readBefore, recreateOp, readAfter])

    expect(resBefore?.path).toBe(file1.path)
    expect(resAfter).toBeUndefined() // Cleared after recreate

    await store.close()
  })

  it('isolates worker crashes and allows manual recovery via close() then open()', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-crash-recovery-'))
    const client = new SQLiteWorkerClient()
    await client.open(tempDir)

    // Simulate worker process fault by terminating underlying worker
    const worker = (client as unknown as { worker: { terminate: () => Promise<number> } }).worker
    await worker.terminate()

    // Subsequent operation fails with StoreWorkerError
    await expect(client.sendRequest('getStatistics', {})).rejects.toBeInstanceOf(StoreWorkerError)
    expect(client.faulted).toBe(true)
    expect(client.currentState).toBe('faulted')

    // Calling open while faulted throws error requiring close first
    await expect(client.open(tempDir)).rejects.toBeInstanceOf(StoreWorkerError)

    // Manual recovery: close clears faulted state
    await client.close()
    expect(client.faulted).toBe(false)
    expect(client.currentState).toBe('closed')

    // Reopen spawns fresh worker
    await client.open(tempDir)
    expect(client.isOpen).toBe(true)
    expect(client.currentState).toBe('open')

    const stats = await client.sendRequest('getStatistics', {})
    expect(stats.fileCount).toBe(0)

    await client.close()
  })

  it('handles close() called while open() is still in-flight without exposing open state', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-open-close-race-'))
    const client = new SQLiteWorkerClient()

    const opening = client.open(tempDir)
    const closing = client.close()

    await Promise.all([opening, closing])

    expect(client.currentState).toBe('closed')
    expect(client.isOpen).toBe(false)

    await expect(client.sendRequest('getStatistics', {})).rejects.toBeInstanceOf(StoreNotOpenError)
  })

  it('forces worker termination and rejects stuck requests when drain timeout expires', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-drain-timeout-'))
    const slowWorkerPath = join(tempDir, 'slow-worker.mjs')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      slowWorkerPath,
      `import { parentPort } from 'node:worker_threads'
parentPort.on('message', (msg) => {
  if (msg.op === 'open') {
    parentPort.postMessage({ id: msg.id, type: 'result', result: undefined })
  }
  // Deliberately ignore all other requests to simulate a stuck/hanging operation
})`,
    )

    const client = new SQLiteWorkerClient()
    await client.open(tempDir, { workerPath: slowWorkerPath })

    // Send a request that will never receive a response from this mock worker
    const stuckPromise = client.sendRequest('getStatistics', {})

    // Close with a short 30ms drain timeout
    const closeStart = Date.now()
    await client.close(30)
    const closeDuration = Date.now() - closeStart

    // Verify close terminated within bounded time rather than waiting indefinitely
    expect(closeDuration).toBeLessThan(1000)
    expect(client.currentState).toBe('closed')
    expect(client.isOpen).toBe(false)

    // The in-flight stuck request must have been rejected
    await expect(stuckPromise).rejects.toThrow(
      /Worker shutdown timed out while draining pending requests/,
    )
  })

  it('leaves deterministic faulted state if worker crashes unexpectedly during opening', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-crash-startup-'))
    const crashingWorkerPath = join(tempDir, 'crashing-worker.mjs')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      crashingWorkerPath,
      `import process from 'node:process'
process.exit(1)`,
    )

    const client = new SQLiteWorkerClient()
    await expect(client.open(tempDir, { workerPath: crashingWorkerPath })).rejects.toThrow()

    expect(client.faulted).toBe(true)
    expect(client.currentState).toBe('faulted')

    // Recovery clears faulted state to closed
    await client.close()
    expect(client.faulted).toBe(false)
    expect(client.currentState).toBe('closed')
  })
})
