/**
 * Represents a textual non-code document in the code graph.
 */
export interface DocumentNode {
  readonly path: string
  readonly configRelativePath: string
  readonly contentHash: string
  readonly content: string
  readonly workspace: string
}

/**
 * Replaces backslashes with forward slashes.
 * @param filePath - The path to normalize.
 * @returns The normalized path string.
 */
function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

/**
 * Creates a new DocumentNode with normalized paths.
 * @param params - The document node properties.
 * @param params.path - Canonical graph path.
 * @param params.configRelativePath - Path relative to the config directory.
 * @param params.contentHash - Content hash for incremental diffing.
 * @param params.content - Full textual content.
 * @param params.workspace - Owning workspace or reserved namespace.
 * @returns A DocumentNode value object.
 */
export function createDocumentNode(params: {
  path: string
  configRelativePath: string
  contentHash: string
  content: string
  workspace: string
}): DocumentNode {
  return {
    path: normalizePath(params.path),
    configRelativePath: normalizePath(params.configRelativePath),
    contentHash: params.contentHash,
    content: params.content,
    workspace: params.workspace,
  }
}
