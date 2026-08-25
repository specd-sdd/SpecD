import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
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

/** Serialized version-one graph-index lock ownership record. */
interface GraphIndexLockFile {
  readonly version: 1
  readonly pid: number
  readonly token: string
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
  if (existsSync(getGraphIndexLockPathForStoragePath(storagePath))) {
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  }
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
  const lockFile: GraphIndexLockFile = { version: 1, pid: ownerPid, token: ownerToken }
  mkdirSync(dirname(lockPath), { recursive: true })

  try {
    const fd = openSync(lockPath, 'wx')
    writeFileSync(fd, `${JSON.stringify(lockFile)}\n`, 'utf-8')
    closeSync(fd)
  } catch {
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
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
 * @returns True only for a matching version-one lock owned by the handoff parent.
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
  return lock?.version === 1 && lock.pid === process.ppid && lock.token === handoffToken
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
 * @returns Idempotent release callback.
 * @throws {GraphBusyError} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLockByStoragePath(storagePath: string): () => void {
  const lease = acquireGraphIndexLockLeaseByStoragePath(storagePath)
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
      (parsed as Partial<GraphIndexLockFile>).version !== 1 ||
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
