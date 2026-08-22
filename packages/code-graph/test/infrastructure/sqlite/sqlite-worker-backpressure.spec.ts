import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SQLiteWorkerClient } from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { StoreOverloadError } from '../../../src/domain/errors/store-overload-error.js'
import { StoreWorkerError } from '../../../src/domain/errors/store-worker-error.js'

describe('SQLiteWorkerClient backpressure and crash recovery', () => {
  let tempDir: string | undefined

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it(
    'rejects with StoreOverloadError when pending requests exceed maxPendingOperations',
    { timeout: 30000 },
    async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-backpressure-'))
      const client = new SQLiteWorkerClient()
      // Configure queue limit to 2 for deterministic testing
      await client.open(tempDir, { maxPendingOperations: 2 })

      // Fire operations without awaiting them so they accumulate in-flight
      const p1 = client.sendRequest('getStatistics', {})
      const p2 = client.sendRequest('getStatistics', {})

      // Third request should be rejected synchronously with StoreOverloadError
      await expect(client.sendRequest('getStatistics', {})).rejects.toThrow(StoreOverloadError)

      // Wait for in-flight requests to finish
      await Promise.all([p1, p2])
      await client.close()
    },
  )

  it(
    'rejects all in-flight pending requests with StoreWorkerError when worker exits unexpectedly',
    { timeout: 30000 },
    async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'code-graph-sqlite-crash-'))
      const client = new SQLiteWorkerClient()
      await client.open(tempDir)

      // Fire requests
      const pendingPromise = client.sendRequest('getStatistics', {})

      // Force terminate worker
      // @ts-expect-error accessing private worker for test
      if (client.worker) {
        // @ts-expect-error accessing private worker for test
        await client.worker.terminate()
      }

      await expect(pendingPromise).rejects.toThrow(StoreWorkerError)
      expect(client.isOpen).toBe(false)
      await client.close()
    },
  )
})
