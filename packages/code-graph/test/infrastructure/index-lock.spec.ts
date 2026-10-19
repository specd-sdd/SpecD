import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { type SpecdConfig } from '@specd/core'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})
import {
  acquireGraphIndexLock,
  acquireGraphIndexLockLeaseByStoragePath,
  assertGraphIndexUnlocked,
  assertGraphIndexUnlockedByStoragePath,
  classifyGraphIndexLock,
  type GraphIndexLockProbes,
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
    expect(content).toMatchObject({ version: 2, pid: process.pid, token: lease.ownerToken })

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

  describe('stale lock recovery', () => {
    const errno = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })
    const probes = (overrides: Partial<GraphIndexLockProbes> = {}): GraphIndexLockProbes => ({
      killProbe: () => undefined,
      readStartTime: () => undefined,
      lockAgeMs: () => 0,
      ...overrides,
    })
    const writeLock = (record: Record<string, unknown>): string => {
      const lockPath = getGraphIndexLockPathForStoragePath(tmpPath)
      const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
      lease.release()
      writeFileSync(lockPath, `${JSON.stringify(record)}\n`)
      return lockPath
    }

    it('classifies a dead pid as stale and a running pid as live', () => {
      const lockPath = writeLock({ version: 2, pid: 999_999, token: 't', startedAt: 'a' })
      const dead = probes({
        killProbe: () => {
          throw errno('ESRCH')
        },
      })
      expect(classifyGraphIndexLock(lockPath, dead)).toBe('stale')
      expect(classifyGraphIndexLock(lockPath, probes({ readStartTime: () => 'a' }))).toBe('live')
    })

    it('classifies a reused pid with a different start time as stale', () => {
      const lockPath = writeLock({ version: 2, pid: 1, token: 't', startedAt: 'old' })
      expect(classifyGraphIndexLock(lockPath, probes({ readStartTime: () => 'new' }))).toBe('stale')
    })

    it('treats EPERM as alive and judges version-1 records by the pid probe only', () => {
      const eperm = probes({
        killProbe: () => {
          throw errno('EPERM')
        },
      })
      const v2 = writeLock({ version: 2, pid: 1, token: 't', startedAt: 'a' })
      expect(classifyGraphIndexLock(v2, { ...eperm, readStartTime: () => 'a' })).toBe('live')
      const v1 = writeLock({ version: 1, pid: 1, token: 't' })
      expect(classifyGraphIndexLock(v1, probes({ readStartTime: () => 'whatever' }))).toBe('live')
    })

    it('treats a malformed lock as stale only after ten seconds', () => {
      const lockPath = getGraphIndexLockPathForStoragePath(tmpPath)
      acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' }).release()
      writeFileSync(lockPath, 'garbage')
      expect(classifyGraphIndexLock(lockPath, probes({ lockAgeMs: () => 1_000 }))).toBe('live')
      expect(classifyGraphIndexLock(lockPath, probes({ lockAgeMs: () => 11_000 }))).toBe('stale')
    })

    it('reports none for a missing lock', () => {
      expect(classifyGraphIndexLock(getGraphIndexLockPathForStoragePath(tmpPath))).toBe('none')
    })

    it('assert-unlocked tolerates a stale lock and never removes it', () => {
      const lockPath = writeLock({ version: 1, pid: 2_147_483_646, token: 't' })
      expect(() => assertGraphIndexUnlockedByStoragePath(tmpPath)).not.toThrow()
      expect(existsSync(lockPath)).toBe(true)
    })

    it('recovers a stale lock on acquisition and reports it once', () => {
      writeLock({ version: 1, pid: 2_147_483_646, token: 'dead' })
      const recovered: string[] = []
      const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, {
        signalCleanup: 'exit-only',
        onStaleLockRecovered: (info) => recovered.push(info.reason),
      })
      expect(recovered).toEqual(['process-not-running'])
      expect(JSON.parse(readFileSync(lease.lockPath, 'utf-8'))).toMatchObject({
        token: lease.ownerToken,
      })
      expect(readdirSync(join(tmpPath, 'graph')).filter((f) => f.includes('.stale-'))).toEqual([])
      lease.release()
    })

    it('keeps a live owner and raises GraphBusyError', () => {
      const first = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
      expect(() =>
        acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' }),
      ).toThrow(GRAPH_INDEX_LOCK_MESSAGE)
      expect(JSON.parse(readFileSync(first.lockPath, 'utf-8'))).toMatchObject({
        token: first.ownerToken,
      })
      first.release()
    })

    it('recovers an old malformed lock', () => {
      const lockPath = getGraphIndexLockPathForStoragePath(tmpPath)
      acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' }).release()
      writeFileSync(lockPath, 'garbage')
      const old = new Date(Date.now() - 60_000)
      utimesSync(lockPath, old, old)
      const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
      expect(existsSync(lease.lockPath)).toBe(true)
      lease.release()
    })

    it('recovers a lock left by a SIGKILLed process', async () => {
      const moduleUrl = new URL('../../src/infrastructure/index-lock.ts', import.meta.url).href
      const script = `
        import { acquireGraphIndexLockLeaseByStoragePath } from ${JSON.stringify(moduleUrl)}
        acquireGraphIndexLockLeaseByStoragePath(${JSON.stringify(tmpPath)}, { signalCleanup: 'exit-only' })
        process.stdout.write('locked\\n')
        setInterval(() => undefined, 1000)
      `
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', script],
        {
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      )
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', () => reject(new Error('child exited before locking')))
        child.stdout.once('data', () => resolve())
      })
      child.kill('SIGKILL')
      await new Promise((resolve) => child.once('exit', resolve))
      expect(existsSync(getGraphIndexLockPathForStoragePath(tmpPath))).toBe(true)

      const lease = acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' })
      expect(lease.ownerPid).toBe(process.pid)
      lease.release()
    }, 20_000)

    it('elects exactly one owner when another contender wins the stale-lock rename', () => {
      const lockPath = writeLock({ version: 1, pid: 2_147_483_646, token: 'dead' })
      const winner = { version: 2, pid: process.pid, token: 'winner' }
      const realRename = vi.mocked(renameSync).getMockImplementation()!
      vi.mocked(renameSync).mockImplementationOnce((from, to) => {
        // The other contender renames the stale lock away and creates its own lock first.
        realRename(from, `${String(to)}.other`)
        rmSync(`${String(to)}.other`, { force: true })
        writeFileSync(lockPath, `${JSON.stringify(winner)}\n`)
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      })

      expect(() =>
        acquireGraphIndexLockLeaseByStoragePath(tmpPath, { signalCleanup: 'exit-only' }),
      ).toThrow(GRAPH_INDEX_LOCK_MESSAGE)
      expect(JSON.parse(readFileSync(lockPath, 'utf-8'))).toMatchObject({ token: 'winner' })
      expect(readdirSync(join(tmpPath, 'graph')).filter((f) => f.includes('.stale-'))).toEqual([])
    })
  })
})
