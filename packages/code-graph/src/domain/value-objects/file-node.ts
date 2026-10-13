/**
 * Three-tier semantic categorization of indexed files.
 */
export type FileCategory = 'source' | 'test' | 'ignored'
export const FILE_CATEGORIES: readonly FileCategory[] = ['source', 'test', 'ignored']

/**
 * Represents a source file in the code graph.
 */
export interface FileNode {
  readonly path: string
  readonly projectRelativePath: string
  readonly language: string
  readonly contentHash: string
  readonly workspace: string
  readonly category: FileCategory
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
 * @param params.projectRelativePath - Path relative to the project root.
 * @param params.language - Language identifier.
 * @param params.contentHash - Content hash for incremental diffing.
 * @param params.workspace - Workspace name (e.g. 'core', 'cli').
 * @param params.category - Optional file category, defaults to 'source'.
 * @param params.embedding - Optional vector embedding.
 * @param params.content - Optional full textual content.
 * @returns A FileNode value object.
 */
export function createFileNode(params: {
  path: string
  projectRelativePath?: string
  language: string
  contentHash: string
  workspace: string
  category?: FileCategory | undefined
  embedding?: Float32Array | undefined
  content?: string
}): FileNode {
  return {
    path: normalizePath(params.path),
    projectRelativePath: normalizePath(params.projectRelativePath ?? params.path),
    language: params.language,
    contentHash: params.contentHash,
    workspace: params.workspace,
    category: params.category ?? 'source',
    embedding: params.embedding ? new Float32Array(params.embedding) : undefined,
    content: params.content,
  }
}
