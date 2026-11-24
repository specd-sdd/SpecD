import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MARKER_FILE_NAME = '.owners.json'

/**
 * Result of releasing one agent from a shared-folder owners marker.
 */
export interface SharedOwnerRelease {
  /**
   * Owner ids still recorded after the release.
   */
  readonly remaining: readonly string[]

  /**
   * Whether a valid marker existed before the release.
   */
  readonly hadMarker: boolean
}

/**
 * Parsed `.owners.json` marker.
 */
interface OwnersMarker {
  readonly owners: readonly string[]
}

/**
 * Registers an agent as an owner of a shared folder.
 *
 * Creates the folder and marker when needed. An invalid marker is replaced
 * with a marker that contains only `agentId`. Registering an id that is
 * already present leaves the file byte-identical.
 *
 * @param sharedDir - Absolute or relative shared-folder path.
 * @param agentId - Agent id to register.
 */
export async function addSharedOwner(sharedDir: string, agentId: string): Promise<void> {
  await mkdir(sharedDir, { recursive: true })
  const markerPath = markerPathFor(sharedDir)
  const loaded = await readMarkerFile(markerPath)
  if (loaded?.kind === 'symlink') {
    await unlink(markerPath)
  }
  const owners =
    loaded?.kind === 'valid' ? sortUnique([...loaded.marker.owners, agentId]) : [agentId]
  if (
    loaded?.kind === 'valid' &&
    loaded.marker.owners.includes(agentId) &&
    sameList(loaded.marker.owners, owners)
  ) {
    return
  }
  await writeFile(markerPath, serializeMarker(owners), 'utf8')
}

/**
 * Releases an agent from a shared-folder owners marker.
 *
 * A missing or invalid marker is left untouched.
 *
 * @param sharedDir - Absolute or relative shared-folder path.
 * @param agentId - Agent id to release.
 * @returns Remaining owners and whether a valid marker existed.
 */
export async function removeSharedOwner(
  sharedDir: string,
  agentId: string,
): Promise<SharedOwnerRelease> {
  const markerPath = markerPathFor(sharedDir)
  const loaded = await readMarkerFile(markerPath)
  if (loaded?.kind !== 'valid') {
    return { remaining: [], hadMarker: false }
  }

  if (!loaded.marker.owners.includes(agentId)) {
    return { remaining: sortUnique(loaded.marker.owners), hadMarker: true }
  }

  const remaining = sortUnique(loaded.marker.owners.filter((owner) => owner !== agentId))
  if (remaining.length === 0) {
    await unlink(markerPath)
  } else {
    await writeFile(markerPath, serializeMarker(remaining), 'utf8')
  }
  return { remaining, hadMarker: true }
}

/**
 * Removes a shared folder only when it is already empty.
 *
 * Swallows `ENOTEMPTY`, `ENOENT` and `ENOTDIR`. Every other error propagates.
 * Does not delete files inside the folder.
 *
 * @param sharedDir - Absolute or relative shared-folder path.
 */
export async function removeSharedFolderIfEmpty(sharedDir: string): Promise<void> {
  try {
    await rmdir(sharedDir)
  } catch (error) {
    if (isSwallowedDirectoryError(error)) {
      return
    }
    throw error
  }
}

/**
 * Resolves the owners-marker path for a shared folder.
 *
 * @param sharedDir - Shared-folder path
 * @returns Path of `.owners.json`
 */
function markerPathFor(sharedDir: string): string {
  return path.join(sharedDir, MARKER_FILE_NAME)
}

/**
 * Serializes an owners marker with a trailing newline.
 *
 * @param owners - Owner ids already sorted and unique
 * @returns JSON text
 */
function serializeMarker(owners: readonly string[]): string {
  return `${JSON.stringify({ owners }, null, 2)}\n`
}

/**
 * Compares two owner lists element by element.
 *
 * @param a - First list
 * @param b - Second list
 * @returns `true` when both lists hold the same ids in the same order
 */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Sorts owner ids and drops duplicates.
 *
 * @param owners - Owner ids
 * @returns Sorted unique ids
 */
function sortUnique(owners: readonly string[]): string[] {
  return [...new Set(owners)].sort()
}

/**
 * Outcome of reading an owners marker that exists on disk.
 */
type MarkerRead =
  | { readonly kind: 'valid'; readonly marker: OwnersMarker }
  | { readonly kind: 'absent' }
  | { readonly kind: 'symlink' }

/**
 * Reads an owners marker.
 *
 * @param markerPath - Path of `.owners.json`
 * @returns A valid, absent or symlink (invalid) marker, or `undefined` when the file is missing
 */
async function readMarkerFile(markerPath: string): Promise<MarkerRead | undefined> {
  try {
    if ((await lstat(markerPath)).isSymbolicLink()) {
      return { kind: 'symlink' }
    }
  } catch {
    return undefined
  }

  let raw: string
  try {
    raw = await readFile(markerPath, 'utf8')
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { kind: 'absent' }
  }

  if (!isOwnersMarker(parsed)) {
    return { kind: 'absent' }
  }
  return { kind: 'valid', marker: parsed }
}

/**
 * Checks the parsed JSON shape of an owners marker.
 *
 * @param value - Parsed JSON
 * @returns Whether the value is an owners marker
 */
function isOwnersMarker(value: unknown): value is OwnersMarker {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  if (!Object.hasOwn(value, 'owners')) {
    return false
  }
  const owners = (value as { owners: unknown }).owners
  return Array.isArray(owners) && owners.every((owner) => typeof owner === 'string')
}

/**
 * Reports directory errors that mean the folder is already gone or not empty.
 *
 * @param error - Caught filesystem error
 * @returns `true` for `ENOTEMPTY`, `ENOENT` and `ENOTDIR`
 */
function isSwallowedDirectoryError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOTEMPTY' || error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
