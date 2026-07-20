import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
 * Rotates the storage-generation sidecar and returns the new snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns New storage-generation snapshot.
 */
export function rotateStorageGeneration(storagePath: string): StorageGenerationSnapshot {
  const path = getStorageGenerationPath(storagePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${randomUUID()}\n`, 'utf-8')
  return readStorageGeneration(storagePath)
}

/**
 * Reads the current storage-generation snapshot.
 *
 * @param storagePath - Root path that owns the graph directory.
 * @returns Current storage-generation snapshot.
 */
export function readStorageGeneration(storagePath: string): StorageGenerationSnapshot {
  const path = getStorageGenerationPath(storagePath)
  const stat = statSync(path)
  return {
    token: readFileSync(path, 'utf-8').trim(),
    mtimeMs: stat.mtimeMs,
  }
}
