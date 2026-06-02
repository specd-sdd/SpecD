import { isAbsolute, relative } from 'node:path'
import { type GraphStore } from '../../domain/ports/graph-store.js'
import { type DocumentNode } from '../../domain/value-objects/document-node.js'
import { type FileNode } from '../../domain/value-objects/file-node.js'
import { isSymbolKind, type SymbolKind } from '../../domain/value-objects/symbol-kind.js'

/**
 * Resolution options for file and symbol selector normalization.
 */
export interface ResolveSelectorOptions {
  readonly store: GraphStore
  readonly projectRoot?: string
}

/**
 * A normalized file-bearing graph selector result.
 */
export interface ResolvedFileSelector {
  readonly canonicalPath: string
  readonly configRelativePath: string
  readonly workspace: string
  readonly kind: 'file' | 'document'
}

/**
 * A normalized symbol selector result.
 */
export interface ResolvedSymbolSelector {
  readonly symbolId: string
  readonly filePath: string
  readonly matchKind: 'name' | 'qualified' | 'full-id'
}

/**
 * Resolves a raw file selector into canonical graph identities.
 * @param input - The raw selector string.
 * @param options - Graph resolution options.
 * @returns Matching canonical file-bearing graph entries.
 * @throws {Error} When the selector is empty.
 */
export async function resolveFileSelector(
  input: string,
  options: ResolveSelectorOptions,
): Promise<ResolvedFileSelector[]> {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error('empty file selector')
  }

  const direct = await resolveDirectPath(trimmed, options.store)
  if (direct.length > 0) {
    return direct
  }

  const configRelativePath = toConfigRelativePath(trimmed, options.projectRoot)
  if (configRelativePath === null) {
    return []
  }

  const [files, documents] = await Promise.all([
    options.store.findFilesByConfigRelativePath(configRelativePath),
    options.store.findDocumentsByConfigRelativePath(configRelativePath),
  ])

  return [
    ...files.map((file) => mapFile(file)),
    ...documents.map((document) => mapDocument(document)),
  ]
}

/**
 * Resolves a raw symbol selector into canonical symbol identities.
 * @param input - The raw selector string.
 * @param options - Graph resolution options.
 * @returns Matching canonical symbol entries.
 * @throws {Error} When the selector is empty.
 */
export async function resolveSymbolSelector(
  input: string,
  options: ResolveSelectorOptions,
): Promise<ResolvedSymbolSelector[]> {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error('empty symbol selector')
  }

  const direct = await options.store.getSymbol(trimmed)
  if (direct) {
    return [{ symbolId: direct.id, filePath: direct.filePath, matchKind: 'full-id' }]
  }

  const fullId = parseFullIdSelector(trimmed)
  if (fullId !== null) {
    const fileMatches = await resolveFileSelector(fullId.fileSelector, options)
    const symbolMatches = await Promise.all(
      fileMatches.map((file) =>
        options.store.findSymbols({
          filePath: file.canonicalPath,
          kind: fullId.kind,
          name: fullId.name,
        }),
      ),
    )
    return symbolMatches
      .flat()
      .filter((symbol) => symbol.line === fullId.line && symbol.column === fullId.column)
      .map((symbol) => ({
        symbolId: symbol.id,
        filePath: symbol.filePath,
        matchKind: 'full-id' as const,
      }))
  }

  const qualified = parseQualifiedSelector(trimmed)
  if (qualified !== null) {
    const fileMatches = await resolveFileSelector(qualified.fileSelector, options)
    const symbolMatches = await Promise.all(
      fileMatches.map((file) =>
        options.store.findSymbols({
          filePath: file.canonicalPath,
          ...(qualified.kind !== undefined ? { kind: qualified.kind } : {}),
          name: qualified.name,
        }),
      ),
    )
    return symbolMatches.flat().map((symbol) => ({
      symbolId: symbol.id,
      filePath: symbol.filePath,
      matchKind: 'qualified' as const,
    }))
  }

  return (await options.store.findSymbols({ name: trimmed })).map((symbol) => ({
    symbolId: symbol.id,
    filePath: symbol.filePath,
    matchKind: 'name' as const,
  }))
}

/**
 * Resolves a canonical graph path directly from the store.
 * @param input - The raw selector string.
 * @param store - The graph store.
 * @returns Matching direct canonical entries.
 */
async function resolveDirectPath(
  input: string,
  store: GraphStore,
): Promise<ResolvedFileSelector[]> {
  const [file, document] = await Promise.all([store.getFile(input), store.getDocument(input)])
  return [...(file ? [mapFile(file)] : []), ...(document ? [mapDocument(document)] : [])]
}

/**
 * Converts a raw path selector into a config-relative path when possible.
 * @param input - The raw selector string.
 * @param projectRoot - The project root used for absolute selectors.
 * @returns A normalized config-relative path or null when it cannot be derived.
 */
function toConfigRelativePath(input: string, projectRoot?: string): string | null {
  if (isAbsolute(input)) {
    if (projectRoot === undefined) {
      return null
    }
    return normalizeRelativePath(relative(projectRoot, input))
  }
  return normalizeRelativePath(input)
}

/**
 * Parses `<file>:<kind>:<name>:<line>:<column>` selectors.
 * @param input - The raw selector string.
 * @returns Parsed full-id selector parts or null.
 */
function parseFullIdSelector(
  input: string,
): { fileSelector: string; kind: SymbolKind; name: string; line: number; column: number } | null {
  const match = /^(.*):([a-z]+):([^:]+):(\d+):(\d+)$/.exec(input)
  if (match === null) {
    return null
  }
  const [, fileSelector, kind, name, lineText, columnText] = match
  if (
    fileSelector === undefined ||
    kind === undefined ||
    name === undefined ||
    lineText === undefined ||
    columnText === undefined
  ) {
    return null
  }
  if (!isSymbolKind(kind)) {
    return null
  }
  return {
    fileSelector,
    kind,
    name,
    line: Number(lineText),
    column: Number(columnText),
  }
}

/**
 * Parses `<file>:<name>` and `<file>:<kind>:<name>` selectors.
 * @param input - The raw selector string.
 * @returns Parsed qualified selector parts or null.
 */
function parseQualifiedSelector(
  input: string,
): { fileSelector: string; kind?: SymbolKind; name: string } | null {
  const kindMatch = /^(.*):([a-z]+):([^:]+)$/.exec(input)
  if (kindMatch !== null) {
    const [, fileSelector, kind, name] = kindMatch
    if (fileSelector === undefined || kind === undefined || name === undefined) {
      return null
    }
    if (isSymbolKind(kind)) {
      return { fileSelector, kind, name }
    }
  }

  const nameMatch = /^(.*):([^:]+)$/.exec(input)
  if (nameMatch === null) {
    return null
  }

  const [, fileSelector, name] = nameMatch
  if (fileSelector === undefined || name === undefined) {
    return null
  }
  if (fileSelector.length === 0 || name.length === 0) {
    return null
  }
  return { fileSelector, name }
}

/**
 * Maps a file node into a resolved selector result.
 * @param file - The file node to map.
 * @returns The resolved selector record.
 */
function mapFile(file: FileNode): ResolvedFileSelector {
  return {
    canonicalPath: file.path,
    configRelativePath: file.configRelativePath,
    workspace: file.workspace,
    kind: 'file',
  }
}

/**
 * Maps a document node into a resolved selector result.
 * @param document - The document node to map.
 * @returns The resolved selector record.
 */
function mapDocument(document: DocumentNode): ResolvedFileSelector {
  return {
    canonicalPath: document.path,
    configRelativePath: document.configRelativePath,
    workspace: document.workspace,
    kind: 'document',
  }
}

/**
 * Normalizes a relative path for config-relative lookup.
 * @param value - The path to normalize.
 * @returns The normalized path string.
 */
function normalizeRelativePath(value: string): string {
  let normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  return normalized
}
