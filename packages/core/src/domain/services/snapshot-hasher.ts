import { createHash } from 'crypto'

/**
 * Hashes file contents using SHA-256.
 * Returns a map of path → 'sha256:<hex>' for each input file.
 */
export function hashFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    result[path] = `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }
  return result
}
