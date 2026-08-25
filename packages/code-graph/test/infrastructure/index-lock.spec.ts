import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { type SpecdConfig } from '@specd/core'
import {
  acquireGraphIndexLock,
  acquireGraphIndexLockLeaseByStoragePath,
  assertGraphIndexUnlocked,
  createGraphIndexLockHandoffEnv,
  getGraphIndexLockPath,
  getGraphIndexLockPathForStoragePath,
  GRAPH_INDEX_LOCK_MESSAGE,
  isGraphIndexLockHandoffForStoragePath,
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

  it('writes a tokenized lease and releases idempotently', () => {
    const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath)
    const content = JSON.parse(readFileSync(lease.lockPath, 'utf-8')) as Record<string, unknown>
    expect(lease.storageRoot).toBe(tmpPath)
    expect(content).toMatchObject({ version: 1, pid: process.pid, token: lease.ownerToken })

    lease.release()
    lease.release()
    expect(existsSync(lease.lockPath)).toBe(false)
  })

  it('does not accept a handoff for an unrelated storage root', () => {
    const previousRoot = process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
    const previousToken = process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
    const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
    try {
      Object.assign(process.env, createGraphIndexLockHandoffEnv(lease))
      expect(isGraphIndexLockHandoffForStoragePath(join(tmpPath, 'other'))).toBe(false)
      expect(getGraphIndexLockPathForStoragePath(tmpPath)).toBe(lease.lockPath)
    } finally {
      if (previousRoot === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
      else process.env['SPECD_GRAPH_INDEX_LOCK_ROOT'] = previousRoot
      if (previousToken === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
      else process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = previousToken
      lease.release()
    }
  })

  it('requires the exact live token for a lock handoff and never deletes a replacement lock', () => {
    const previousRoot = process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
    const previousToken = process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
    const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
    try {
      Object.assign(process.env, createGraphIndexLockHandoffEnv(lease))
      expect(isGraphIndexLockHandoffForStoragePath(tmpPath)).toBe(false)
      process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = 'wrong'
      expect(isGraphIndexLockHandoffForStoragePath(tmpPath)).toBe(false)
      process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = lease.ownerToken
      writeFileSync(lease.lockPath, 'not-json')
      expect(isGraphIndexLockHandoffForStoragePath(tmpPath)).toBe(false)
      writeFileSync(
        lease.lockPath,
        JSON.stringify({ version: 1, pid: process.pid, token: 'replacement' }),
      )
      lease.release()
      expect(existsSync(lease.lockPath)).toBe(true)
    } finally {
      if (previousRoot === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_ROOT']
      else process.env['SPECD_GRAPH_INDEX_LOCK_ROOT'] = previousRoot
      if (previousToken === undefined) delete process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN']
      else process.env['SPECD_GRAPH_INDEX_LOCK_TOKEN'] = previousToken
    }
  })
})
