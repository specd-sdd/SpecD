import { closeSync, existsSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type SpecdConfig } from '@specd/core'

/** User-facing message shown when the code graph is locked for indexing. */
export const GRAPH_INDEX_LOCK_MESSAGE =
  'The code graph is currently being indexed. Try again in a few seconds.'

/**
 * Returns the shared CLI lock path for graph indexing.
 * @param config - Resolved project config.
 * @returns Absolute lock file path.
 */
export function getGraphIndexLockPath(config: SpecdConfig): string {
  return join(config.configPath, 'graph', 'index.lock')
}

/**
 * Throws when another CLI process is currently indexing the graph.
 * @param config - Resolved project config.
 * @throws {Error} If the shared graph indexing lock is currently held.
 */
export function assertGraphIndexUnlocked(config: SpecdConfig): void {
  if (existsSync(getGraphIndexLockPath(config))) {
    throw new Error(GRAPH_INDEX_LOCK_MESSAGE)
  }
}

/**
 * Acquires the shared graph indexing lock and returns a release callback.
 * The lock file is also removed on SIGINT/SIGTERM and process exit.
 * @param config - Resolved project config.
 * @returns Release callback.
 * @throws {Error} If another CLI process already owns the indexing lock.
 */
export function acquireGraphIndexLock(config: SpecdConfig): () => void {
  const lockPath = getGraphIndexLockPath(config)
  mkdirSync(dirname(lockPath), { recursive: true })

  try {
    const fd = openSync(lockPath, 'wx')
    writeFileSync(fd, `${String(process.pid)}\n`, 'utf-8')
    closeSync(fd)
  } catch {
    throw new Error(GRAPH_INDEX_LOCK_MESSAGE)
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
