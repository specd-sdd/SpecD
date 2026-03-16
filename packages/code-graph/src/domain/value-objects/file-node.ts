/**
 * Represents a source file in the code graph.
 */
export interface FileNode {
  readonly path: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
  readonly embedding: Float32Array | undefined
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
 * Creates a new FileNode with a normalized path.
 * @param params - The file node properties.
 * @param params.path - Workspace-relative file path.
 * @param params.language - Language identifier.
 * @param params.contentHash - Content hash for incremental diffing.
 * @param params.workspace - Workspace name (e.g. 'core', 'cli').
 * @param params.embedding - Optional vector embedding.
 * @returns A FileNode value object.
 */
export function createFileNode(params: {
  path: string
  language: string
  contentHash: string
  workspace: string
  embedding?: Float32Array | undefined
}): FileNode {
  return {
    path: normalizePath(params.path),
    language: params.language,
    contentHash: params.contentHash,
    workspace: params.workspace,
    embedding: params.embedding,
  }
}
