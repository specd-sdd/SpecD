import { randomUUID } from 'node:crypto'
import { open, mkdir, readFile, unlink, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { CacheLockError } from '../../domain/errors/cache-lock-error.js'

/**
 * Writes a JSON file atomically: creates the parent directory, writes to a
 * temporary sibling file (PID + UUID suffix) and renames it into place.
 * The temporary file is removed when the rename fails, so readers never
 * observe a partially-written target.
 *
 * Mirrors core's internal `writeFileAtomic` semantics; kept sdk-local because
 * core cannot depend on sdk and the public core barrel stays free of
 * infrastructure utilities.
 *
 * @param filePath - Absolute path to the target JSON file
 * @param content - Serialized JSON content to write
 */
export async function writeJsonAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid.toString()}-${randomUUID()}`
  await writeFile(tempPath, content, 'utf-8')
  try {
    await rename(tempPath, filePath)
  } catch (err: unknown) {
    await unlink(tempPath).catch(() => {})
    throw err
  }
}

/** Serialized metadata written into a cache lock file. */
interface CacheLockMeta {
  readonly pid: number
  readonly acquiredAt: string
}

/** In-process lock reference count map to support re-entrant lock acquisition. */
const heldLocksCount = new Map<string, number>()

/**
 * Executes `fn` while holding an exclusive file lock at `lockPath`.
 *
 * Uses `open(lockPath, 'wx')` (O_EXCL | O_CREAT), which is atomic at the
 * kernel level — only one process can create the file when it does not exist.
 * This mirrors the synchronous `openSync('wx')` pattern used by `index-lock.ts`
 * in the code-graph package.
 *
 * Stale locks left behind by crashed processes are detected by reading the PID
 * from the lock file and probing it with `process.kill(pid, 0)`.
 *
 * In-process re-entrancy is supported via thread-local reference counting.
 *
 * @param lockPath   - Absolute path to the `.lock` file (sibling of the data file)
 * @param fn         - Async operation to run while the lock is held
 * @param timeoutMs  - Maximum time to wait for the lock (default: 10 000 ms)
 * @returns The value returned by `fn`
 * @throws {CacheLockError} If the lock cannot be acquired within `timeoutMs`
 */
export async function withCacheFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {
  const canonicalLockPath = resolve(lockPath)
  const currentCount = heldLocksCount.get(canonicalLockPath) ?? 0
  if (currentCount > 0) {
    heldLocksCount.set(canonicalLockPath, currentCount + 1)
    try {
      return await fn()
    } finally {
      const nextCount = (heldLocksCount.get(canonicalLockPath) ?? 1) - 1
      if (nextCount <= 0) {
        heldLocksCount.delete(canonicalLockPath)
      } else {
        heldLocksCount.set(canonicalLockPath, nextCount)
      }
    }
  }

  await mkdir(dirname(canonicalLockPath), { recursive: true })

  const deadline = Date.now() + timeoutMs

  while (true) {
    try {
      // O_EXCL | O_CREAT: atomic exclusive create — only one process succeeds
      const fh = await open(canonicalLockPath, 'wx')
      const meta: CacheLockMeta = { pid: process.pid, acquiredAt: new Date().toISOString() }
      await fh.writeFile(JSON.stringify(meta), 'utf-8')
      await fh.close()
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err

      // Lock file exists — check if the owning process is still alive or is our own PID
      try {
        const raw = await readFile(canonicalLockPath, 'utf-8')
        const meta = JSON.parse(raw) as Partial<CacheLockMeta>
        if (typeof meta.pid === 'number') {
          if (meta.pid === process.pid) {
            // Re-entrant lock by our own process
            heldLocksCount.set(canonicalLockPath, (heldLocksCount.get(canonicalLockPath) ?? 0) + 1)
            try {
              return await fn()
            } finally {
              const nextCount = (heldLocksCount.get(canonicalLockPath) ?? 1) - 1
              if (nextCount <= 0) {
                heldLocksCount.delete(canonicalLockPath)
              } else {
                heldLocksCount.set(canonicalLockPath, nextCount)
              }
            }
          }
          if (!isPidAlive(meta.pid)) {
            // Stale lock from a crashed process — reap it and retry immediately
            await unlink(canonicalLockPath).catch(() => {})
            continue
          }
        }
      } catch {
        // Lock file vanished between EEXIST and our read — retry
        continue
      }

      if (Date.now() >= deadline) {
        throw new CacheLockError(canonicalLockPath, timeoutMs)
      }

      await sleep(25)
      continue
    }

    // Lock acquired — mark held in memory and run protected operation
    heldLocksCount.set(canonicalLockPath, 1)
    try {
      return await fn()
    } finally {
      heldLocksCount.delete(canonicalLockPath)
      await unlink(canonicalLockPath).catch(() => {})
    }
  }
}

/**
 * Returns true if the given PID is alive (EPERM counts as alive).
 *
 * @param pid - Process ID to probe
 * @returns `true` if the process exists, `false` if it has terminated
 */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Resolves after the given number of milliseconds.
 *
 * @param ms - Duration in milliseconds to sleep
 * @returns A promise that resolves after `ms` milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
