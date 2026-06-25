import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { type SpecdConfig } from '@specd/core'
import {
  acquireGraphIndexLock,
  assertGraphIndexUnlocked,
  getGraphIndexLockPath,
  GRAPH_INDEX_LOCK_MESSAGE,
} from '../../src/infrastructure/index-lock.js'

describe('index-lock infrastructure', () => {
  let tmpPath: string
  let config: SpecdConfig

  beforeEach(() => {
    tmpPath = mkdtempSync(join(tmpdir(), 'specd-test-lock-'))
    config = {
      projectRoot: tmpPath,
      configPath: tmpPath,
      schemaRef: '@specd/schema-std',
      workspaces: [],
      storage: {
        changesPath: '',
        changesAdapter: { adapter: 'fs', config: {} },
        draftsPath: '',
        draftsAdapter: { adapter: 'fs', config: {} },
        discardedPath: '',
        discardedAdapter: { adapter: 'fs', config: {} },
        archivePath: '',
        archiveAdapter: { adapter: 'fs', config: {} },
      },
      approvals: { spec: false, signoff: false },
    }
  })

  afterEach(() => {
    rmSync(tmpPath, { recursive: true, force: true })
  })

  it('can acquire, assert, and release the indexing lock', () => {
    // 1. Initial state: unlocked
    expect(() => assertGraphIndexUnlocked(config)).not.toThrow()
    const lockFilePath = getGraphIndexLockPath(config)
    expect(existsSync(lockFilePath)).toBe(false)

    // 2. Acquire lock
    const release = acquireGraphIndexLock(config)
    expect(existsSync(lockFilePath)).toBe(true)

    // 3. Assert throws while locked
    expect(() => assertGraphIndexUnlocked(config)).toThrow(GRAPH_INDEX_LOCK_MESSAGE)

    // 4. Try to acquire again should throw
    expect(() => acquireGraphIndexLock(config)).toThrow(GRAPH_INDEX_LOCK_MESSAGE)

    // 5. Release lock
    release()
    expect(existsSync(lockFilePath)).toBe(false)

    // 6. Assert should no longer throw
    expect(() => assertGraphIndexUnlocked(config)).not.toThrow()
  })
})
