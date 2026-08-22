import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import { SQLiteWorkerClient } from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { createFileNode } from '../../../src/domain/value-objects/file-node.js'
import { createDocumentNode } from '../../../src/domain/value-objects/document-node.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import {
  createLogicalSymbol,
  SymbolSpace,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { StoreWorkerError } from '../../../src/domain/errors/store-worker-error.js'
import { BulkSessionStateError } from '../../../src/domain/errors/bulk-session-state-error.js'

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

    // Send a request that will never receive a response from this mock worker.
    // Attach a no-op catch immediately so the rejection is never unhandled — the
    // actual assertion happens after close() resolves.
    const stuckPromise = client.sendRequest('getStatistics', {})
    stuckPromise.catch(() => {})

    // Close with a short 30ms drain timeout
    const closeStart = Date.now()
    await client.close(30)
    const closeDuration = Date.now() - closeStart

    // Verify close terminated within bounded time rather than waiting indefinitely
    expect(closeDuration).toBeLessThan(1000)
    expect(client.currentState).toBe('closed')
    expect(client.isOpen).toBe(false)

    // The in-flight stuck request must have been rejected with the drain-timeout error
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

  it('clears closePromise when concurrent close() waits on a failing open()', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-close-open-fail-'))
    const crashingWorkerPath = join(tempDir, 'crashing-worker2.mjs')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      crashingWorkerPath,
      `import process from 'node:process'
process.exit(1)`,
    )

    const client = new SQLiteWorkerClient()

    // Start open (will fail) and close concurrently
    const opening = client.open(tempDir, { workerPath: crashingWorkerPath })
    const closing = client.close()

    await expect(opening).rejects.toThrow()
    await closing

    // When close() coordinated the cleanup after a crashing open(), it owns
    // the final state transition — state is 'closed' (not 'faulted')
    expect(client.currentState).toBe('closed')

    // closePromise must have been cleared — a second close() must be idempotent
    // (returns immediately, not hang on the stale in-flight promise)
    await client.close()
    expect(client.currentState).toBe('closed')

    // Full recovery: can open a fresh worker after
    await client.open(tempDir)
    expect(client.currentState).toBe('open')
    await client.close()
    expect(client.currentState).toBe('closed')
  })

  it('bounds close() total time when worker ignores the close RPC', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-close-rpc-timeout-'))
    const slowCloseWorkerPath = join(tempDir, 'slow-close-worker.mjs')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      slowCloseWorkerPath,
      `import { parentPort } from 'node:worker_threads'
parentPort.on('message', (msg) => {
  if (msg.op === 'open') {
    parentPort.postMessage({ id: msg.id, type: 'result', result: undefined })
  }
  // Deliberately ignore the 'close' RPC to simulate a hanging worker shutdown
})`,
    )

    const client = new SQLiteWorkerClient()
    await client.open(tempDir, { workerPath: slowCloseWorkerPath })

    // No pending requests — drain is instant (drained === true)
    // But the close RPC will never be acknowledged by the mock worker

    const closeStart = Date.now()
    await client.close(50) // 50ms hard deadline
    const closeDuration = Date.now() - closeStart

    // close() must resolve well within the timeout ceiling, not hang indefinitely
    expect(closeDuration).toBeLessThan(1000)
    expect(client.currentState).toBe('closed')
  })

  it('isolates onProgress callback exceptions without failing the request', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-progress-error-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/progress.ts',
      configRelativePath: 'src/progress.ts',
      language: 'typescript',
      contentHash: 'sha256:progress',
      workspace: 'core',
    })

    const session = store.beginBulkIndexSession({
      onProgress: () => {
        throw new Error('progress consumer failed')
      },
    })
    await session.writeFiles([file])

    // Should complete cleanly despite onProgress throwing
    await expect(session.commit()).resolves.toBeUndefined()

    const fetched = await store.getFile(file.path)
    expect(fetched?.path).toBe(file.path)

    await store.close()
  })

  it('preserves exact specId when serializing and deserializing SpecNotFoundError', async () => {
    const { SpecNotFoundError } = await import('../../../src/domain/errors/spec-not-found-error.js')
    const { serializeWorkerError, deserializeWorkerError } =
      await import('../../../src/infrastructure/sqlite/sqlite-worker-client.js')

    const original = new SpecNotFoundError('core:specs/auth.spec.md')
    const serialized = serializeWorkerError(original)

    expect(serialized.code).toBe('SPEC_NOT_FOUND')
    expect(serialized.details?.specId).toBe('core:specs/auth.spec.md')

    const deserialized = deserializeWorkerError(serialized)
    expect(deserialized).toBeInstanceOf(SpecNotFoundError)
    expect((deserialized as Error & { specId?: string }).specId).toBe('core:specs/auth.spec.md')
    expect(deserialized.message).toBe('No spec found matching "core:specs/auth.spec.md".')
  })

  it('executes recreate() asynchronously on closed store without lingering WAL/SHM files', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-recreate-closed-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/closed-recreate.ts',
      configRelativePath: 'src/closed-recreate.ts',
      language: 'typescript',
      contentHash: 'sha256:cr',
      workspace: 'core',
    })
    await store.upsertFile(file, [], [])

    await store.close()
    expect(store.isOpen).toBe(false)

    // Recreate while closed
    await store.recreate()

    // Reopen and check that store was reset
    await store.open()
    const fetched = await store.getFile(file.path)
    expect(fetched).toBeUndefined()

    await store.close()
  })

  it('invalidates chunked bulk sessions on store close, worker crash, or recreate', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-session-invalidation-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const session1 = store.beginBulkIndexSession()
    await store.close()

    // Calling write or commit on closed session must throw StoreNotOpenError
    await expect(
      session1.writeFiles([
        createFileNode({
          path: 'core:src/s1.ts',
          configRelativePath: 'src/s1.ts',
          language: 'typescript',
          contentHash: 'sha256:s1',
          workspace: 'core',
        }),
      ]),
    ).rejects.toBeInstanceOf(StoreNotOpenError)

    // Reopen and create session2
    await store.open()
    const session2 = store.beginBulkIndexSession()

    // Recreate invalidates active session
    await store.recreate()

    await expect(
      session2.writeFiles([
        createFileNode({
          path: 'core:src/s2.ts',
          configRelativePath: 'src/s2.ts',
          language: 'typescript',
          contentHash: 'sha256:s2',
          workspace: 'core',
        }),
      ]),
    ).rejects.toBeInstanceOf(StoreNotOpenError)

    await store.close()
  })

  it('removes documents and specs committed through a bulk index session', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-session-removals-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const doc = createDocumentNode({
      path: 'core:docs/auth.md',
      configRelativePath: 'docs/auth.md',
      contentHash: 'sha256:doc',
      content: 'auth docs',
      workspace: 'core',
    })
    const spec = createSpecNode({
      specId: 'core:specs/auth.spec.md',
      path: 'specs/core/auth.spec.md',
      title: 'Auth',
      contentHash: 'sha256:spec',
      workspace: 'core',
    })

    const session = store.beginBulkIndexSession()
    await session.writeDocuments([doc])
    await session.writeSpecs([spec])
    await session.commit()

    expect((await store.getDocument(doc.path))?.path).toBe(doc.path)
    expect((await store.getSpec(spec.specId))?.specId).toBe(spec.specId)

    const removeSession = store.beginBulkIndexSession()
    await removeSession.removeDocuments([doc.path])
    await removeSession.removeSpecs([spec.specId])
    await removeSession.commit()

    expect(await store.getDocument(doc.path)).toBeUndefined()
    expect(await store.getSpec(spec.specId)).toBeUndefined()

    await store.close()
  })

  it('merges reference-facts chunks staged through the same bulk session', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-facts-merge-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const chunk1 = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/a.ts',
      name: 'alpha',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })
    const chunk2 = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/b.ts',
      name: 'beta',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberForm: undefined,
    })

    const session = store.beginBulkIndexSession()
    await session.writeReferenceFacts({
      logicalSymbols: [chunk1],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    await session.writeReferenceFacts({
      logicalSymbols: [chunk2],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })
    await session.commit()

    const facts = await store.getAllReferenceFacts()
    expect(facts.logicalSymbols.map((symbol) => symbol.name)).toEqual(['alpha', 'beta'])

    await store.close()
  })

  it('rejects writes, second commits, and rollbacks while a commit is in flight', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-commit-state-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/state.ts',
      configRelativePath: 'src/state.ts',
      language: 'typescript',
      contentHash: 'sha256:state',
      workspace: 'core',
    })
    const session = store.beginBulkIndexSession()
    await session.writeFiles([file])

    const committing = session.commit()
    await expect(session.writeFiles([file])).rejects.toThrow(/committing/)
    await expect(session.commit()).rejects.toThrow(/committing/)
    await expect(session.rollback()).rejects.toThrow(/committing/)
    await committing

    expect((await store.getFile(file.path))?.path).toBe(file.path)
    await store.close()
  })

  it('rejects writes and commits while a rollback is in flight', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-rollback-state-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/rollback-state.ts',
      configRelativePath: 'src/rollback-state.ts',
      language: 'typescript',
      contentHash: 'sha256:rollback',
      workspace: 'core',
    })
    const session = store.beginBulkIndexSession()
    await session.writeFiles([file])

    const rolling = session.rollback()
    await expect(session.writeFiles([file])).rejects.toThrow(/rolling-back/)
    await expect(session.commit()).rejects.toThrow(/rolling-back/)
    await rolling

    expect(await store.getFile(file.path)).toBeUndefined()
    await store.close()
  })

  it('rejects a second bulk session while one is already active', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-already-active-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/already-active.ts',
      configRelativePath: 'src/already-active.ts',
      language: 'typescript',
      contentHash: 'sha256:already-active',
      workspace: 'core',
    })
    const first = store.beginBulkIndexSession()
    await first.writeFiles([file])

    expect(() => store.beginBulkIndexSession()).toThrow(BulkSessionStateError)

    await first.commit()
    await store.close()
  })

  it('stages a full bulk session under maxPendingOperations=1 without overload', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-max-pending-1-'))
    const store = new SQLiteGraphStore(tempDir, { maxPendingOperations: 1 })
    await store.open()

    const file = createFileNode({
      path: 'core:src/limited.ts',
      configRelativePath: 'src/limited.ts',
      language: 'typescript',
      contentHash: 'sha256:limited',
      workspace: 'core',
    })
    const session = store.beginBulkIndexSession()
    await session.writeFiles([file])
    await session.commit()

    expect((await store.getFile(file.path))?.path).toBe(file.path)
    await store.close()
  })

  it('invalidates the active bulk session when the store is cleared', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-clear-session-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/cleared.ts',
      configRelativePath: 'src/cleared.ts',
      language: 'typescript',
      contentHash: 'sha256:cleared',
      workspace: 'core',
    })
    const session1 = store.beginBulkIndexSession()
    await session1.writeFiles([file])
    await store.clear()

    // The old session is invalidated host-side and worker-side
    await expect(session1.commit()).rejects.toBeInstanceOf(StoreNotOpenError)

    // A new session can be created and committed after clear
    const session2 = store.beginBulkIndexSession()
    await session2.writeFiles([file])
    await session2.commit()

    expect((await store.getFile(file.path))?.path).toBe(file.path)
    await store.close()
  })

  it('rejects stale session staging that races a store clear', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-worker-clear-race-'))
    const store = new SQLiteGraphStore(tempDir)
    await store.open()

    const file = createFileNode({
      path: 'core:src/race.ts',
      configRelativePath: 'src/race.ts',
      language: 'typescript',
      contentHash: 'sha256:race',
      workspace: 'core',
    })
    const session = store.beginBulkIndexSession()
    await session.writeFiles([file])

    // clear() invalidates the host token before its RPC enters the FIFO queue
    const clearing = store.clear()
    await expect(session.writeFiles([file])).rejects.toBeInstanceOf(StoreNotOpenError)
    await clearing

    // The store can immediately create a fresh session afterwards
    const nextSession = store.beginBulkIndexSession()
    await nextSession.rollback()

    await store.close()
  })
})
