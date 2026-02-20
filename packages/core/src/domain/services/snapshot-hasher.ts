import { createHash } from 'crypto'

/**
 * Hashes file contents using SHA-256.
 *
 * Returns a map of path → `sha256:<hex>` for each input file.
 * An empty input object produces an empty result object.
 *
 * @param files - A map of file path → file content (UTF-8 string)
 * @returns A map of file path → `sha256:<hex-digest>` for each entry
 */
export function hashFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    result[path] = `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }
  return result
}
