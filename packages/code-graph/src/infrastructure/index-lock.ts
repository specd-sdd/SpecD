import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { type SpecdConfig } from '@specd/core'
import { GraphBusyError } from '../domain/errors/graph-busy-error.js'

/** User-facing message shown when the code graph is locked for indexing. */
export const GRAPH_INDEX_LOCK_MESSAGE =
  'The code graph is currently being indexed. Try again in a few seconds.'

const GRAPH_INDEX_LOCK_HANDOFF_ROOT_ENV = 'SPECD_GRAPH_INDEX_LOCK_ROOT'
const GRAPH_INDEX_LOCK_HANDOFF_TOKEN_ENV = 'SPECD_GRAPH_INDEX_LOCK_TOKEN'

/** Age after which an unreadable or malformed lock file is considered abandoned. */
const MALFORMED_LOCK_STALE_AFTER_MS = 10_000

/** Serialized graph-index lock ownership record (version 1 has no `startedAt`). */
interface GraphIndexLockFile {
  readonly version: 1 | 2
  readonly pid: number
  readonly token: string
  readonly startedAt?: string
}

/** Liveness classification of an existing graph-index lock file. */
export type GraphIndexLockState = 'none' | 'live' | 'stale'

/** Environment probes used to classify a lock; injectable for tests. */
export interface GraphIndexLockProbes {
  /** Sends signal 0 to the pid; throws the platform error (`ESRCH`, `EPERM`) on failure. */
  readonly killProbe: (pid: number) => void
  /** Returns the opaque process start time for a pid, or undefined when unavailable. */
  readonly readStartTime: (pid: number) => string | undefined
  /** Returns the lock file age in milliseconds. */
  readonly lockAgeMs: (lockPath: string) => number
}

/** Details reported when a stale lock is recovered during acquisition. */
export interface StaleGraphIndexLockInfo {
  readonly lockPath: string
  readonly pid?: number
  readonly startedAt?: string
  readonly reason: 'process-not-running' | 'pid-reused' | 'malformed'
}

/** Internal ownership record for one graph-index lock file. */
export interface GraphIndexLockLease {
  readonly storageRoot: string
  readonly lockPath: string
  readonly ownerPid: number
  readonly ownerToken: string
  release(): void
}

/** Controls process cleanup installed for a lock lease. */
export interface GraphIndexLockLeaseOptions {
  readonly signalCleanup?: 'direct-provider' | 'exit-only'
  /** Called once when a stale lock was recovered; must not throw. */
  readonly onStaleLockRecovered?: (info: StaleGraphIndexLockInfo) => void
}

/**
 * Returns the shared lock path for a graph storage root.
 * @param storagePath - Root path that owns graph persistence.
 * @returns Absolute lock file path.
 */
export function getGraphIndexLockPathForStoragePath(storagePath: string): string {
  return join(resolve(storagePath), 'graph', 'index.lock')
}

/**
 * Returns the shared lock path for graph indexing.
 * @param config - Resolved project config.
 * @returns Absolute lock file path.
 */
export function getGraphIndexLockPath(config: SpecdConfig): string {
  return getGraphIndexLockPathForStoragePath(config.configPath)
}

/**
 * Throws when another process is currently indexing the graph.
 * @param config - Resolved project config.
 * @throws {GraphBusyError} If the shared graph indexing lock is currently held.
 */
export function assertGraphIndexUnlocked(config: SpecdConfig): void {
  assertGraphIndexUnlockedByStoragePath(config.configPath)
}

/**
 * Throws when another process is currently indexing the graph storage root.
 * @param storagePath - Root path that owns graph persistence.
 * @throws {GraphBusyError} If the shared graph indexing lock is currently held.
 */
export function assertGraphIndexUnlockedByStoragePath(storagePath: string): void {
  if (classifyGraphIndexLock(getGraphIndexLockPathForStoragePath(storagePath)) === 'live') {
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  }
}

/**
 * Reads the opaque start time of a process, used to detect pid reuse.
 * @param pid - Process id to inspect.
 * @returns Trimmed start-time string, or undefined when it cannot be obtained.
 */
export function readProcessStartTime(pid: number): string | undefined {
  if (process.platform === 'win32') return undefined
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
      const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const startTicks = afterComm[19]
      if (startTicks !== undefined && startTicks !== '') return startTicks
    }
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out === '' ? undefined : out
  } catch {
    return undefined
  }
}

const DEFAULT_PROBES: GraphIndexLockProbes = {
  killProbe: (pid) => {
    process.kill(pid, 0)
  },
  readStartTime: readProcessStartTime,
  lockAgeMs: (lockPath) => Date.now() - statSync(lockPath).mtimeMs,
}

/**
 * Classifies an existing graph-index lock as live or stale without modifying it.
 * @param lockPath - Absolute lock file path.
 * @param probes - Optional probe overrides for tests.
 * @returns `none` when absent, `live` when the owner is running, `stale` otherwise.
 */
export function classifyGraphIndexLock(
  lockPath: string,
  probes: GraphIndexLockProbes = DEFAULT_PROBES,
): GraphIndexLockState {
  return inspectGraphIndexLock(lockPath, probes).state
}

/** Classification together with the reason and the record that was judged. */
interface LockInspection {
  readonly state: GraphIndexLockState
  readonly reason?: StaleGraphIndexLockInfo['reason']
  readonly record?: GraphIndexLockFile
}

/**
 * Inspects a lock file and explains the classification.
 * @param lockPath - Absolute lock file path.
 * @param probes - Environment probes.
 * @returns The classification, stale reason and parsed record when available.
 */
function inspectGraphIndexLock(lockPath: string, probes: GraphIndexLockProbes): LockInspection {
  let ageMs: number
  try {
    ageMs = probes.lockAgeMs(lockPath)
  } catch {
    return { state: 'none' }
  }
  const record = readGraphIndexLockFile(lockPath)
  if (record === null) {
    return ageMs > MALFORMED_LOCK_STALE_AFTER_MS
      ? { state: 'stale', reason: 'malformed' }
      : { state: 'live' }
  }
  try {
    probes.killProbe(record.pid)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return judgeStartTime(record, probes)
    }
    return { state: 'stale', reason: 'process-not-running', record }
  }
  return judgeStartTime(record, probes)
}

/**
 * Compares recorded and observed start times for a running owner pid.
 * @param record - Parsed lock record.
 * @param probes - Environment probes.
 * @returns Live unless both start times exist and differ.
 */
function judgeStartTime(record: GraphIndexLockFile, probes: GraphIndexLockProbes): LockInspection {
  if (record.version === 2 && record.startedAt !== undefined) {
    const observed = probes.readStartTime(record.pid)
    if (observed !== undefined && observed !== record.startedAt) {
      return { state: 'stale', reason: 'pid-reused', record }
    }
  }
  return { state: 'live', record }
}

/**
 * Acquires an internal tokenized lease for a graph storage root.
 * @param storageRoot - Root path that owns graph persistence.
 * @param options - Process cleanup mode for this lease.
 * @returns The exact lock owner lease.
 * @throws {GraphBusyError} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLockLeaseByStoragePath(
  storageRoot: string,
  options: GraphIndexLockLeaseOptions = {},
): GraphIndexLockLease {
  const normalizedStorageRoot = resolve(storageRoot)
  const lockPath = getGraphIndexLockPathForStoragePath(normalizedStorageRoot)
  const ownerPid = process.pid
  const ownerToken = randomUUID()
  const startedAt = readProcessStartTime(ownerPid)
  const lockFile: GraphIndexLockFile = {
    version: 2,
    pid: ownerPid,
    token: ownerToken,
    ...(startedAt !== undefined ? { startedAt } : {}),
  }
  mkdirSync(dirname(lockPath), { recursive: true })

  if (!tryCreateLock(lockPath, lockFile)) {
    recoverStaleLock(lockPath, options)
    if (!tryCreateLock(lockPath, lockFile)) {
      throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
    }
  }

  let released = false
  const release = (): void => {
    if (released) return
    released = true
    if (readGraphIndexLockFile(lockPath)?.token === ownerToken) {
      rmSync(lockPath, { force: true })
    }
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }
  const onExit = (): void => release()
  const onSigint = (): never => {
    release()
    process.exit(130)
  }
  const onSigterm = (): never => {
    release()
    process.exit(143)
  }

  process.on('exit', onExit)
  if (options.signalCleanup !== 'exit-only') {
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)
  }

  return Object.freeze({
    storageRoot: normalizedStorageRoot,
    lockPath,
    ownerPid,
    ownerToken,
    release,
  })
}

/**
 * Attempts exclusive creation of the lock file.
 * @param lockPath - Absolute lock file path.
 * @param lockFile - Ownership record to write.
 * @returns True when this process created the file.
 */
function tryCreateLock(lockPath: string, lockFile: GraphIndexLockFile): boolean {
  try {
    const fd = openSync(lockPath, 'wx')
    writeFileSync(fd, `${JSON.stringify(lockFile)}\n`, 'utf-8')
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

/**
 * Removes a stale lock by atomically renaming it; exactly one contender wins the rename.
 * @param lockPath - Absolute lock file path.
 * @param options - Lease options carrying the recovery callback.
 * @throws {GraphBusyError} If the lock is live or another contender won the recovery.
 */
function recoverStaleLock(lockPath: string, options: GraphIndexLockLeaseOptions): void {
  const inspection = inspectGraphIndexLock(lockPath, DEFAULT_PROBES)
  if (inspection.state === 'live') throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  if (inspection.state === 'none') return
  const sibling = `${lockPath}.stale-${randomUUID()}`
  try {
    renameSync(lockPath, sibling)
  } catch {
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  }
  const moved = readGraphIndexLockFile(sibling)
  if (moved?.token !== inspection.record?.token) {
    // A live owner replaced the stale file between classification and rename: put it back.
    try {
      linkSync(sibling, lockPath)
    } catch {
      // another owner already exists; the displaced record is discarded
    }
    rmSync(sibling, { force: true })
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  }
  rmSync(sibling, { force: true })
  options.onStaleLockRecovered?.({
    lockPath,
    ...(inspection.record !== undefined ? { pid: inspection.record.pid } : {}),
    ...(inspection.record?.startedAt !== undefined
      ? { startedAt: inspection.record.startedAt }
      : {}),
    reason: inspection.reason ?? 'process-not-running',
  })
}

/**
 * Creates the internal environment handoff for a child of the lease owner.
 * @param lease - Live parent-owned graph index lease.
 * @returns Immutable environment fields scoped to the lease root and token.
 */
export function createGraphIndexLockHandoffEnv(
  lease: GraphIndexLockLease,
): Readonly<Record<string, string>> {
  return Object.freeze({
    [GRAPH_INDEX_LOCK_HANDOFF_ROOT_ENV]: lease.storageRoot,
    [GRAPH_INDEX_LOCK_HANDOFF_TOKEN_ENV]: lease.ownerToken,
  })
}

/**
 * Returns whether this process received a valid parent lease handoff for a storage root.
 * @param storageRoot - Provider storage root requesting the handoff.
 * @returns True only for a matching lock record owned by the handoff parent.
 */
export function isGraphIndexLockHandoffForStoragePath(storageRoot: string): boolean {
  const handoffRoot = process.env[GRAPH_INDEX_LOCK_HANDOFF_ROOT_ENV]
  const handoffToken = process.env[GRAPH_INDEX_LOCK_HANDOFF_TOKEN_ENV]
  if (
    handoffRoot === undefined ||
    handoffToken === undefined ||
    resolve(storageRoot) !== resolve(handoffRoot)
  ) {
    return false
  }
  const lock = readGraphIndexLockFile(getGraphIndexLockPathForStoragePath(storageRoot))
  return lock !== null && lock.pid === process.ppid && lock.token === handoffToken
}

/**
 * Acquires the shared graph indexing lock and returns a release callback.
 * @param config - Resolved project config.
 * @returns Idempotent release callback.
 * @throws {GraphBusyError} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLock(config: SpecdConfig): () => void {
  return acquireGraphIndexLockByStoragePath(config.configPath)
}

/**
 * Acquires the shared graph indexing lock for a storage root and returns a release callback.
 * @param storagePath - Root path that owns graph persistence.
 * @param onStaleLockRecovered - Optional callback invoked when a stale lock was recovered.
 * @returns Idempotent release callback.
 * @throws {GraphBusyError} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLockByStoragePath(
  storagePath: string,
  onStaleLockRecovered?: (info: StaleGraphIndexLockInfo) => void,
): () => void {
  const lease = acquireGraphIndexLockLeaseByStoragePath(
    storagePath,
    onStaleLockRecovered !== undefined ? { onStaleLockRecovered } : {},
  )
  return (): void => lease.release()
}

/**
 * Reads and validates a graph-index lock ownership record.
 * @param lockPath - Absolute lock-file path to inspect.
 * @returns The validated ownership record, or null when unavailable or malformed.
 */
function readGraphIndexLockFile(lockPath: string): GraphIndexLockFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf-8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      ((parsed as Partial<GraphIndexLockFile>).version !== 1 &&
        (parsed as Partial<GraphIndexLockFile>).version !== 2) ||
      typeof (parsed as Partial<GraphIndexLockFile>).pid !== 'number' ||
      typeof (parsed as Partial<GraphIndexLockFile>).token !== 'string'
    ) {
      return null
    }
    return parsed as GraphIndexLockFile
  } catch {
    return null
  }
}
