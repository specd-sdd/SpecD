import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Walks up from `startDir` looking for a manifest file and extracts a field from it.
 * Bounded by `boundary` — never walks above it. If no boundary is provided,
 * walks up to the filesystem root.
 * @param startDir - Absolute path to start searching from.
 * @param filename - The manifest filename to look for (e.g. `package.json`, `go.mod`).
 * @param extract - Function that parses the manifest content and returns the identity, or undefined.
 * @param boundary - Optional absolute path to stop walking at (e.g. repository root).
 * @returns The extracted identity, or undefined if no manifest is found.
 */
export function findManifestField(
  startDir: string,
  filename: string,
  extract: (content: string) => string | undefined,
  boundary?: string,
): string | undefined {
  let dir = startDir

  while (true) {
    const manifestPath = join(dir, filename)
    if (existsSync(manifestPath)) {
      try {
        const content = readFileSync(manifestPath, 'utf-8')
        const result = extract(content)
        if (result) return result
      } catch {
        // unreadable manifest, keep walking
      }
    }

    if (dir === boundary) return undefined

    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}
