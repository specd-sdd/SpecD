import { createHash } from 'node:crypto'

/**
 * Computes a `sha256:<hex>` hash of the given UTF-8 string content.
 *
 * @param content - The UTF-8 string to hash
 * @returns A `sha256:<hex>` formatted hash string
 */
export function sha256(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Hashes file contents using SHA-256.
 *
 * Returns a map of path to `sha256:<hex>` for each input file.
 * An empty input object produces an empty result object.
 *
 * @param files - A map of file path to file content (UTF-8 string)
 * @returns A map of file path to `sha256:<hex-digest>` for each entry
 */
export function hashFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(files)) {
    result[filePath] = sha256(content)
  }
  return result
}
