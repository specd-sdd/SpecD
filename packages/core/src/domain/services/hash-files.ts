/**
 * Hashes file contents using the supplied hash function.
 *
 * Returns a map of path to hash string for each input file.
 * An empty input object produces an empty result object.
 *
 * @param files - A map of file path to file content (UTF-8 string)
 * @param hashContent - Function that computes a content hash string (e.g. `sha256:…`)
 * @returns A map of file path to hash string for each entry
 */
export function hashFiles(
  files: Record<string, string>,
  hashContent: (content: string) => string,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(files)) {
    result[filePath] = hashContent(content)
  }
  return result
}
