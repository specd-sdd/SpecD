import { closeSync, existsSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type SpecdConfig } from '@specd/core'
import { GraphBusyError } from '../domain/errors/graph-busy-error.js'

/** User-facing message shown when the code graph is locked for indexing. */
export const GRAPH_INDEX_LOCK_MESSAGE =
  'The code graph is currently being indexed. Try again in a few seconds.'

/**
 * Returns the shared lock path for a graph storage root.
 * @param storagePath - Root path that owns graph persistence.
 * @returns Absolute lock file path.
 */
export function getGraphIndexLockPathForStoragePath(storagePath: string): string {
  return join(storagePath, 'graph', 'index.lock')
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
 * @throws {Error} If the shared graph indexing lock is currently held.
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
 * Acquires the shared graph indexing lock and returns a release callback.
 * The lock file is also removed on SIGINT/SIGTERM and process exit.
 * @param config - Resolved project config.
 * @returns Release callback.
 * @throws {Error} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLock(config: SpecdConfig): () => void {
  return acquireGraphIndexLockByStoragePath(config.configPath)
}

/**
 * Acquires the shared graph indexing lock for a storage root and returns a release callback.
 * @param storagePath - Root path that owns graph persistence.
 * @returns Release callback.
 * @throws {GraphBusyError} If another process already owns the indexing lock.
 */
export function acquireGraphIndexLockByStoragePath(storagePath: string): () => void {
  const lockPath = getGraphIndexLockPathForStoragePath(storagePath)
  mkdirSync(dirname(lockPath), { recursive: true })

  try {
    const fd = openSync(lockPath, 'wx')
    writeFileSync(fd, `${String(process.pid)}\n`, 'utf-8')
    closeSync(fd)
  } catch {
    throw new GraphBusyError(GRAPH_INDEX_LOCK_MESSAGE)
  }

  let released = false
  const release = (): void => {
    if (released) return
    released = true
    rmSync(lockPath, { force: true })
    process.removeListener('exit', release)
    process.removeListener('SIGINT', releaseAndExitOnSigint)
    process.removeListener('SIGTERM', releaseAndExitOnSigterm)
  }

  const releaseAndExitOnSigint = (): never => {
    release()
    process.exit(130)
  }

  const releaseAndExitOnSigterm = (): never => {
    release()
    process.exit(143)
  }

  process.on('exit', release)
  process.on('SIGINT', releaseAndExitOnSigint)
  process.on('SIGTERM', releaseAndExitOnSigterm)

  return release
}
