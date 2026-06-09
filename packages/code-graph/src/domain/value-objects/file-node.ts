/**
 * Represents a source file in the code graph.
 */
export interface FileNode {
  readonly path: string
  readonly configRelativePath: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
  readonly embedding: Float32Array | undefined
  readonly content?: string | undefined
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
 * @param params.configRelativePath - Path relative to the config directory.
 * @param params.language - Language identifier.
 * @param params.contentHash - Content hash for incremental diffing.
 * @param params.workspace - Workspace name (e.g. 'core', 'cli').
 * @param params.embedding - Optional vector embedding.
 * @param params.content - Optional full textual content.
 * @returns A FileNode value object.
 */
export function createFileNode(params: {
  path: string
  configRelativePath: string
  language: string
  contentHash: string
  workspace: string
  embedding?: Float32Array | undefined
  content?: string
}): FileNode {
  return {
    path: normalizePath(params.path),
    configRelativePath: normalizePath(params.configRelativePath),
    language: params.language,
    contentHash: params.contentHash,
    workspace: params.workspace,
    embedding: params.embedding ? new Float32Array(params.embedding) : undefined,
    content: params.content,
  }
}
