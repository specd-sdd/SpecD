import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, open, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { type StorageGenerationSnapshot } from '../domain/ports/graph-store.js'

/**
 * Returns the storage-generation sidecar path for a graph storage root.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Absolute path to the generation sidecar.
 */
export function getStorageGenerationPath(storagePath: string): string {
  return join(storagePath, 'graph', 'storage.epoch')
}

/**
 * Ensures that the storage-generation sidecar exists and returns its snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Current storage-generation snapshot.
 */
export function ensureStorageGeneration(storagePath: string): StorageGenerationSnapshot {
  const path = getStorageGenerationPath(storagePath)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${randomUUID()}\n`, 'utf-8')
  }
  return readStorageGeneration(storagePath)
}

/**
 * Ensures asynchronously that the storage-generation sidecar exists and returns its snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Current storage-generation snapshot.
 */
export async function ensureStorageGenerationAsync(
  storagePath: string,
): Promise<StorageGenerationSnapshot> {
  const path = getStorageGenerationPath(storagePath)
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, `${randomUUID()}\n`, { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return readStorageGenerationAsync(storagePath)
}

/**
 * Rotates the storage-generation sidecar and returns the new snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns New storage-generation snapshot.
 */
export function rotateStorageGeneration(storagePath: string): StorageGenerationSnapshot {
  const path = getStorageGenerationPath(storagePath)
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, `${randomUUID()}\n`, 'utf-8')
  retryLocked(() => {
    renameSync(temporaryPath, path)
  })
  return readStorageGeneration(storagePath)
}

/**
 * Rotates asynchronously the storage-generation sidecar and returns the new snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns New storage-generation snapshot.
 */
export async function rotateStorageGenerationAsync(
  storagePath: string,
): Promise<StorageGenerationSnapshot> {
  const path = getStorageGenerationPath(storagePath)
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${randomUUID()}\n`, 'utf-8')
  await retryLockedAsync(() => rename(temporaryPath, path))
  return readStorageGenerationAsync(storagePath)
}

/**
 * Reads the current storage-generation snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Current storage-generation snapshot.
 */
export function readStorageGeneration(storagePath: string): StorageGenerationSnapshot {
  const path = getStorageGenerationPath(storagePath)
  const fileStat = statSync(path)
  return {
    token: readFileSync(path, 'utf-8').trim(),
    mtimeMs: fileStat.mtimeMs,
  }
}

/**
 * Reads asynchronously the current storage-generation snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Current storage-generation snapshot.
 */
export async function readStorageGenerationAsync(
  storagePath: string,
): Promise<StorageGenerationSnapshot> {
  const handle = await open(getStorageGenerationPath(storagePath), 'r')
  try {
    const fileStat = await handle.stat()
    const content = await handle.readFile('utf-8')
    return {
      token: content.trim(),
      mtimeMs: fileStat.mtimeMs,
    }
  } finally {
    await handle.close()
  }
}

const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [50, 100, 150, 200] as const

/**
 * Retries a synchronous rename that fails because the destination is locked.
 *
 * @param operation - Work to attempt up to five times
 * @throws The original lock error after five failures
 */
export function retryLocked(operation: () => void): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      operation()
      return
    } catch (error: unknown) {
      if (!isLockError(error) || attempt === RETRY_DELAYS_MS.length) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAYS_MS[attempt] ?? 0)
    }
  }
}

/**
 * Retries an asynchronous rename that fails because the destination is locked.
 *
 * @param operation - Work to attempt up to five times
 * @throws The original lock error after five failures
 */
export async function retryLockedAsync(operation: () => Promise<void>): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await operation()
      return
    } catch (error: unknown) {
      if (!isLockError(error) || attempt === RETRY_DELAYS_MS.length) throw error
      await new Promise((resolve) => {
        setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 0)
      })
    }
  }
}

/**
 * Reports whether an error is a Windows or POSIX file lock.
 *
 * @param error - Caught filesystem error
 * @returns True for `EPERM`, `EBUSY`, or `EACCES`
 */
function isLockError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    LOCK_CODES.has(error.code)
  )
}
