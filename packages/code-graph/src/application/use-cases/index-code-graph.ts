import { readFileSync, statSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type Spec } from '@specd/core'
import { type GraphStore } from '../../domain/ports/graph-store.js'
import { type FileNode, createFileNode } from '../../domain/value-objects/file-node.js'
import { type DocumentNode, createDocumentNode } from '../../domain/value-objects/document-node.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { type SpecNode, createSpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { type IndexOptions } from '../../domain/value-objects/index-options.js'
import {
  type IndexResult,
  type IndexError,
  type WorkspaceIndexBreakdown,
} from '../../domain/value-objects/index-result.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { BindingScopeKind, type BindingScope } from '../../domain/value-objects/binding-fact.js'
import {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
  type SymbolLookup,
  getUpstream,
  getDownstream,
} from '../../domain/services/index.js'
import { discoverFiles } from './discover-files.js'
import { computeContentHash } from './compute-content-hash.js'
import {
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  parseFingerprintMap,
  serializeFingerprintMap,
  detectFingerprintMismatch,
} from './_shared/compute-graph-fingerprint.js'
import { resolveEffectiveGraphConfig } from './_shared/resolve-effective-graph-config.js'

const DEFAULT_CHUNK_BYTES = 20 * 1024 * 1024

/**
 * Mutable version of WorkspaceIndexBreakdown for tracking progress.
 */
interface MutableWorkspaceIndexBreakdown {
  name: string
  filesDiscovered: number
  filesIndexed: number
  documentsIndexed: number
  filesSkipped: number
  filesRemoved: number
  specsDiscovered: number
  specsIndexed: number
}

/**
 * In-memory symbol index for resolving imports without store queries.
 * Built incrementally during parsing, queried during import resolution.
 */
class SymbolIndex {
  private byFile = new Map<string, SymbolNode[]>()
  private byName = new Map<string, SymbolNode[]>()

  /**
   * Registers symbols from a file.
   * @param filePath - The file path to associate symbols with.
   * @param symbols - The symbols extracted from the file.
   */
  addFile(filePath: string, symbols: SymbolNode[]): void {
    this.byFile.set(filePath, symbols)
    for (const s of symbols) {
      const existing = this.byName.get(s.name)
      if (existing) {
        existing.push(s)
      } else {
        this.byName.set(s.name, [s])
      }
    }
  }

  /**
   * Finds symbols by exact file path.
   * @param filePath - The file path to look up.
   * @returns The symbols associated with the file.
   */
  findByFile(filePath: string): SymbolNode[] {
    return this.byFile.get(filePath) ?? []
  }

  /**
   * Finds symbols by name, optionally filtered by file path prefix.
   * @param name - The symbol name to search for.
   * @param filePrefix - Optional file path prefix to filter results.
   * @returns The matching symbols.
   */
  findByName(name: string, filePrefix?: string): SymbolNode[] {
    const all = this.byName.get(name) ?? []
    if (!filePrefix) return all
    return all.filter((s) => s.filePath.startsWith(filePrefix))
  }

  /**
   * Finds all symbols whose file path starts with the given prefix.
   * @param filePrefix - The file path prefix to filter results.
   * @returns Every matching symbol across indexed files.
   */
  findByFilePrefix(filePrefix: string): SymbolNode[] {
    const matches: SymbolNode[] = []
    for (const [filePath, symbols] of this.byFile.entries()) {
      if (filePath.startsWith(filePrefix)) {
        matches.push(...symbols)
      }
    }
    return matches
  }

  /**
   * Returns every file-to-symbol slice currently stored in the index.
   * @returns Array of file path and symbol list pairs.
   */
  entries(): Array<[string, SymbolNode[]]> {
    return [...this.byFile.entries()]
  }
}

/**
 * Creates the domain-level symbol lookup adapter over the in-memory symbol index.
 * @param index - In-memory index populated during Pass 1.
 * @returns Symbol lookup used by scoped binding resolution.
 */
function createSymbolLookup(index: SymbolIndex): SymbolLookup {
  return {
    findByName: (name, filePrefix) => index.findByName(name, filePrefix),
    findByFile: (filePath) => index.findByFile(filePath),
  }
}

/**
 * Returns whether an import declaration is file-only and must not populate importMap.
 * @param declaration - Import declaration to inspect.
 * @returns True for side-effect, dynamic, require, and blank import forms.
 */
function isFileOnlyImport(declaration: ImportDeclaration): boolean {
  return (
    declaration.kind === ImportDeclarationKind.SideEffect ||
    declaration.kind === ImportDeclarationKind.Dynamic ||
    declaration.kind === ImportDeclarationKind.Require ||
    declaration.kind === ImportDeclarationKind.Blank
  )
}

/**
 * Creates the default file scope used when adapters do not expose richer scopes.
 * @param filePath - Workspace-prefixed file path.
 * @returns A root file scope for scoped lookup.
 */
function createDefaultFileScope(filePath: string): BindingScope {
  return {
    id: filePath,
    kind: BindingScopeKind.File,
    filePath,
    parentId: undefined,
    ownerSymbolId: undefined,
    start: {
      filePath,
      line: 1,
      column: 0,
      endLine: undefined,
      endColumn: undefined,
    },
    end: undefined,
  }
}

/**
 * Removes duplicate relations while preserving distinct relation semantics.
 * @param relations - Relations to de-duplicate.
 * @returns Relations unique by source/type/target.
 */
function deduplicateRelations(relations: readonly Relation[]): Relation[] {
  const seen = new Set<string>()
  const unique: Relation[] = []
  for (const relation of relations) {
    const key = `${relation.source}:${relation.type}:${relation.target}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(relation)
  }
  return unique
}

/**
 * Groups method symbols by their inferred declaring type for override derivation.
 */
interface MethodOwnershipIndex {
  readonly methodsByOwnerId: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>
}

/**
 * Staged chunk containing file and symbol nodes for one pass-1 slice.
 */
interface FilesAndSymbolsStageChunk {
  readonly files: FileNode[]
  readonly documents: DocumentNode[]
  readonly symbols: SymbolNode[]
}

/**
 * Staged chunk containing relations for one pass-2 slice.
 */
interface RelationsStageChunk {
  readonly relations: Relation[]
}

/**
 * Returns the store-owned staging directory for one indexing run.
 * @param storagePath - Graph-store-owned config root.
 * @param runId - Run identifier.
 * @returns Absolute staging directory path.
 */
function makeStageDir(storagePath: string, runId: string): string {
  return join(storagePath, 'tmp', runId)
}

/**
 * Writes a JSON staging chunk to disk.
 * @param stageDir - Run-local staging directory.
 * @param filename - Chunk filename.
 * @param data - Serializable chunk payload.
 */
function writeStageChunk(stageDir: string, filename: string, data: unknown): void {
  if (!existsSync(stageDir)) {
    mkdirSync(stageDir, { recursive: true })
  }
  writeFileSync(join(stageDir, filename), JSON.stringify(data), 'utf-8')
}

/**
 * Reads a staged `files + symbols` chunk.
 * @param stageDir - Run-local staging directory.
 * @param filename - Chunk filename.
 * @returns Parsed stage payload.
 */
function readFilesAndSymbolsStageChunk(
  stageDir: string,
  filename: string,
): FilesAndSymbolsStageChunk {
  return JSON.parse(readFileSync(join(stageDir, filename), 'utf-8')) as FilesAndSymbolsStageChunk
}

/**
 * Attempts to decode a buffer as supported textual content.
 * @param content - Raw file content.
 * @returns Decoded text when the content should be treated as a document.
 */
function decodeTextualContent(content: Buffer): string | null {
  if (content.length === 0) {
    return ''
  }

  if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  }

  if (content[0] === 0xff && content[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: true }).decode(content)
  }

  if (content[0] === 0xfe && content[1] === 0xff) {
    return decodeUtf16Be(content)
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(content)
    if (!(content.includes(0) && decoded.includes('\u0000'))) {
      return decoded
    }
  } catch {
    // Fall through to the remaining encoding probes.
  }

  if (looksLikeUtf16Le(content)) {
    try {
      return new TextDecoder('utf-16le', { fatal: true }).decode(content)
    } catch {
      // Fall through to the remaining checks.
    }
  }

  if (looksLikeUtf16Be(content)) {
    try {
      return decodeUtf16Be(content)
    } catch {
      // Fall through to the remaining checks.
    }
  }

  if (!content.includes(0)) {
    try {
      return new TextDecoder('windows-1252', { fatal: true }).decode(content)
    } catch {
      return null
    }
  }

  return null
}

/**
 * Decodes a UTF-16BE buffer by swapping byte order before decoding.
 * @param content - Raw file content.
 * @returns Decoded text.
 */
function decodeUtf16Be(content: Buffer): string {
  const normalized =
    content.length % 2 === 0 ? Buffer.from(content) : Buffer.concat([content, Buffer.from([0])])
  normalized.swap16()
  return new TextDecoder('utf-16le', { fatal: true }).decode(normalized)
}

/**
 * Returns whether content matches the common UTF-16LE null-byte pattern.
 * @param content - Raw file content.
 * @returns True when odd bytes are predominantly NUL.
 */
function looksLikeUtf16Le(content: Buffer): boolean {
  return hasMostlyNullBytesAtParity(content, 1)
}

/**
 * Returns whether content matches the common UTF-16BE null-byte pattern.
 * @param content - Raw file content.
 * @returns True when even bytes are predominantly NUL.
 */
function looksLikeUtf16Be(content: Buffer): boolean {
  return hasMostlyNullBytesAtParity(content, 0)
}

/**
 * Checks whether one byte parity contains a dominant number of NUL bytes.
 * @param content - Raw file content.
 * @param parity - Byte parity to inspect.
 * @returns True when the sampled parity is mostly NUL.
 */
function hasMostlyNullBytesAtParity(content: Buffer, parity: 0 | 1): boolean {
  let samples = 0
  let nulls = 0
  for (let index = parity; index < content.length; index += 2) {
    samples++
    if (content[index] === 0) {
      nulls++
    }
  }

  return samples > 0 && nulls / samples >= 0.6
}

/**
 * Reads a staged relations chunk.
 * @param stageDir - Run-local staging directory.
 * @param filename - Chunk filename.
 * @returns Parsed stage payload.
 */
function readRelationsStageChunk(stageDir: string, filename: string): RelationsStageChunk {
  return JSON.parse(readFileSync(join(stageDir, filename), 'utf-8')) as RelationsStageChunk
}

/**
 * Groups file paths into chunks where each chunk's total source size
 * does not exceed the byte budget.
 * @param files - Array of [workspace-prefixed path, absolute path] tuples.
 * @param budget - Maximum bytes per chunk.
 * @returns An array of tuple arrays (chunks).
 */
function groupIntoChunks(
  files: Array<[string, string]>,
  budget: number,
): Array<Array<[string, string]>> {
  const chunks: Array<Array<[string, string]>> = []
  let current: Array<[string, string]> = []
  let currentBytes = 0

  for (const entry of files) {
    let size = 0
    try {
      size = statSync(entry[1]).size
    } catch {
      size = 0
    }

    if (current.length > 0 && currentBytes + size > budget) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }

    current.push(entry)
    currentBytes += size
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Returns whether an absolute file path belongs to a workspace code root.
 * @param filePath - Absolute file path to test.
 * @param codeRoot - Absolute workspace code root.
 * @returns True when the file is inside the workspace tree.
 */
function isWithinCodeRoot(filePath: string, codeRoot: string): boolean {
  const codeRelativePath = relative(codeRoot, filePath).replaceAll('\\', '/')
  return (
    codeRelativePath === '' || (codeRelativePath !== '..' && !codeRelativePath.startsWith('../'))
  )
}

/**
 * Use case that indexes source files and specs into the code graph.
 *
 * Orchestrates a multi-workspace pipeline including:
 * 1. File and document discovery (respecting .gitignore and graph config).
 * 2. Incremental diffing via content hashing and fingerprinting.
 * 3. Two-pass extraction using an in-memory symbol index (Pass 1: symbols, Pass 2: relations).
 * 4. Spec metadata and implementation coverage indexing from semantic repositories.
 * 5. Batch persistence into the GraphStore.
 *
 * Chunked for memory control, and bulk loaded for speed.
 */
export class IndexCodeGraph {
  /**
   * Creates a new IndexCodeGraph use case.
   * @param store - The graph store to persist indexed data into.
   * @param registry - The adapter registry for resolving language adapters.
   */
  constructor(
    private readonly store: GraphStore,
    private readonly registry: AdapterRegistryPort,
  ) {}

  /**
   * Executes the indexing pipeline for the given project workspaces and graph config.
   *
   * This is the primary write path into the code graph. It handles both code files
   * (via language adapters) and textual documents (as generic DocumentNodes).
   *
   * @param options - Options controlling the indexing run, including rich workspaces.
   * @returns A summary result with counts and any errors encountered.
   */
  async execute(options: IndexOptions): Promise<IndexResult> {
    const start = Date.now()
    const errors: IndexError[] = []
    const onProgress = options.onProgress ?? noop
    const chunkBudget = options.chunkBytes ?? DEFAULT_CHUNK_BYTES
    const runId = `index-stage-${Date.now()}`
    const stageDir = makeStageDir(this.store.storagePath, runId)
    try {
      const progress = (pct: number, phase: string, detail?: string): void => {
        onProgress(Math.min(pct, 100), detail ? `${phase} — ${detail}` : phase)
      }

      // ── Discovery (0-5%) ──
      progress(0, 'Discovering files')
      const allDiscoveredPaths: string[] = []
      const fileHashes = new Map<string, string>()
      const absolutePaths = new Map<string, string>()
      const configRelativePaths = new Map<string, string>()
      const wsBreakdowns = new Map<string, MutableWorkspaceIndexBreakdown>()
      const indexedWorkspaceNames = new Set(options.workspaces.map((ws) => ws.name))
      const effectiveGraphConfig = resolveEffectiveGraphConfig(
        options.projectRoot,
        options.workspaces,
        options.graphConfig,
      )

      // 1. Workspace Discovery
      for (const ws of options.workspaces) {
        const wsGraph = effectiveGraphConfig.workspaces.get(ws.name)
        const discovered = discoverFiles(ws.codeRoot, undefined, {
          respectGitignore: wsGraph?.respectGitignore ?? true,
          ...(wsGraph?.excludePaths !== undefined ? { excludePaths: wsGraph.excludePaths } : {}),
          ...(wsGraph?.allowedPaths ? { allowedPaths: wsGraph.allowedPaths } : {}),
        })

        wsBreakdowns.set(ws.name, {
          name: ws.name,
          filesDiscovered: discovered.length,
          filesIndexed: 0,
          documentsIndexed: 0,
          filesSkipped: 0,
          filesRemoved: 0,
          specsDiscovered: 0,
          specsIndexed: 0,
        })

        for (const relPath of discovered) {
          const prefixed = `${ws.name}:${relPath}`
          const absPath = join(ws.codeRoot, relPath)
          const configRel = relative(options.projectRoot, absPath).replaceAll('\\', '/')

          allDiscoveredPaths.push(prefixed)
          absolutePaths.set(prefixed, absPath)
          configRelativePaths.set(
            prefixed,
            configRel.startsWith('./') ? configRel.slice(2) : configRel,
          )
        }
      }

      // 2. Project-Global Discovery
      if (effectiveGraphConfig.includePaths.length > 0) {
        const rootDiscovered = discoverFiles(options.projectRoot, undefined, {
          allowedPaths: effectiveGraphConfig.includePaths,
          excludePaths: effectiveGraphConfig.rootExcludePaths,
        })
        const filteredRootDiscovered = rootDiscovered.filter((relPath) => {
          const absPath = join(options.projectRoot, relPath)
          return !options.workspaces.some((workspace) =>
            isWithinCodeRoot(absPath, workspace.codeRoot),
          )
        })

        wsBreakdowns.set('root', {
          name: 'root',
          filesDiscovered: filteredRootDiscovered.length,
          filesIndexed: 0,
          documentsIndexed: 0,
          filesSkipped: 0,
          filesRemoved: 0,
          specsDiscovered: 0,
          specsIndexed: 0,
        })
        indexedWorkspaceNames.add('root')

        for (const relPath of filteredRootDiscovered) {
          const prefixed = `root:${relPath}`
          const absPath = join(options.projectRoot, relPath)
          allDiscoveredPaths.push(prefixed)
          absolutePaths.set(prefixed, absPath)
          configRelativePaths.set(prefixed, relPath.replaceAll('\\', '/'))
        }
      }

      const existingFiles = await this.store.getAllFiles()
      const existingDocuments = await this.store.getAllDocuments()
      const existingArtifactHashes = new Map<string, string>()
      for (const file of existingFiles) existingArtifactHashes.set(file.path, file.contentHash)
      for (const document of existingDocuments) {
        existingArtifactHashes.set(document.path, document.contentHash)
      }

      // ── Fingerprint comparison ──
      const version = options.codeGraphVersion ?? '0.0.0'
      const currentFingerprintMap = new Map<string, string>()
      for (const ws of options.workspaces) {
        currentFingerprintMap.set(
          ws.name,
          computeWorkspaceFingerprint(
            version,
            options.projectRoot,
            ws,
            options.workspaces,
            options.graphConfig,
          ),
        )
      }
      currentFingerprintMap.set(
        'root',
        computeRootFingerprint(
          version,
          options.projectRoot,
          options.workspaces,
          options.graphConfig,
        ),
      )
      const stats = await this.store.getStatistics()
      const storedFingerprintMap = parseFingerprintMap(stats.graphFingerprint)
      const fingerprintMismatch = detectFingerprintMismatch(
        storedFingerprintMap,
        version,
        options.projectRoot,
        options.workspaces,
        options.graphConfig,
      )

      // Merge stored fingerprints for workspaces NOT being indexed into the current map
      for (const [wsName, fp] of storedFingerprintMap) {
        if (!currentFingerprintMap.has(wsName)) {
          currentFingerprintMap.set(wsName, fp)
        }
      }

      let fullRebuildReason: string | null = null
      const newFiles: string[] = []
      const changedFiles: string[] = []
      const deletedFiles: string[] = []
      const skippedFiles: string[] = []

      if (fingerprintMismatch) {
        fullRebuildReason =
          'Graph derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index'
        progress(5, 'Fingerprint mismatch', 'Forcing re-index of mismatched workspaces')
        // Remove all files from mismatched workspaces so they get re-processed
        // but do NOT recreate the store — other workspaces are unaffected
        for (const ef of [...existingFiles, ...existingDocuments]) {
          const storedFp = storedFingerprintMap.get(ef.workspace)
          const currentFp = currentFingerprintMap.get(ef.workspace)
          if (storedFp !== undefined && currentFp !== undefined && storedFp !== currentFp) {
            await this.store.removeFile(ef.path)
            await this.store.removeDocument(ef.path)
          }
        }
        // Treat all discovered files as new — no content hash skip for mismatched workspaces
        newFiles.push(...allDiscoveredPaths)
      } else {
        // Hash all files
        progress(2, 'Hashing files', `${String(allDiscoveredPaths.length)} files`)
        for (let i = 0; i < allDiscoveredPaths.length; i++) {
          const prefixedPath = allDiscoveredPaths[i]!
          const absPath = absolutePaths.get(prefixedPath)!
          try {
            fileHashes.set(prefixedPath, computeContentHash(readFileSync(absPath, 'utf-8')))
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
          }
          if (i % 200 === 0) {
            progress(
              2 + Math.round((i / allDiscoveredPaths.length) * 3),
              'Hashing files',
              `${String(i)}/${String(allDiscoveredPaths.length)}`,
            )
          }
        }
        // ── Diff (5-6%) ──
        progress(5, 'Computing diff')
        const discoveredSet = new Set(allDiscoveredPaths)

        for (const prefixedPath of allDiscoveredPaths) {
          const hash = fileHashes.get(prefixedPath)
          const existingHash = existingArtifactHashes.get(prefixedPath)
          if (existingHash === undefined) {
            newFiles.push(prefixedPath)
          } else if (hash && existingHash !== hash) {
            changedFiles.push(prefixedPath)
          } else if (hash && existingHash === hash) {
            skippedFiles.push(prefixedPath)
          }
        }

        // Only consider files from the workspaces being indexed as candidates for deletion
        for (const existing of [...existingFiles, ...existingDocuments]) {
          if (!discoveredSet.has(existing.path) && indexedWorkspaceNames.has(existing.workspace)) {
            deletedFiles.push(existing.path)
          }
        }
      }

      const hierarchyDependentFiles = await this.collectHierarchyDependentFiles(changedFiles)
      const filesToReprocess = [...hierarchyDependentFiles].filter(
        (filePath) =>
          !newFiles.includes(filePath) &&
          !changedFiles.includes(filePath) &&
          !deletedFiles.includes(filePath),
      )
      const filesToProcess = [...newFiles, ...changedFiles, ...filesToReprocess]
      // ── Cleanup (6%) ──
      const toRemove = [...deletedFiles, ...changedFiles, ...filesToReprocess]
      const deletedSet = new Set(deletedFiles)
      progress(6, 'Cleaning up', `${String(toRemove.length)} to remove`)
      let filesRemovedCount = 0
      for (const filePath of toRemove) {
        try {
          await this.store.removeFile(filePath)
          await this.store.removeDocument(filePath)
          if (deletedSet.has(filePath)) {
            filesRemovedCount++
            const wsName = filePath.substring(0, filePath.indexOf(':'))
            const breakdown = wsBreakdowns.get(wsName)
            if (breakdown) breakdown.filesRemoved++
          }
        } catch (err) {
          errors.push({ filePath, message: String(err) })
        }
      }
      // ── Pass 1: Extract symbols (7-50%) ──
      const fileTuples: Array<[string, string]> = filesToProcess.map((p) => [
        p,
        absolutePaths.get(p)!,
      ])
      const chunks = groupIntoChunks(fileTuples, chunkBudget)
      const totalToProcess = filesToProcess.length
      let filesIndexed = 0
      let documentsIndexed = 0
      const qualifiedNames = new Map<string, string>()
      const symbolIndex = new SymbolIndex()

      // Build package-name → workspace-name map for cross-workspace import resolution.
      const packageToWorkspace = new Map<string, string>()
      const adapters = this.registry.getAdapters()
      for (const ws of options.workspaces) {
        for (const adapter of adapters) {
          if (adapter.getPackageIdentity) {
            const identity = adapter.getPackageIdentity(ws.codeRoot)
            if (identity) {
              const existingWs = packageToWorkspace.get(identity)
              if (existingWs && existingWs !== ws.name) {
                errors.push({
                  filePath: `${ws.name}:<manifest>`,
                  message: `Package identity collision: "${identity}" already mapped to workspace "${existingWs}"`,
                })
              } else {
                packageToWorkspace.set(identity, ws.name)
              }
            }
          }
        }
      }

      const fileLanguages = new Map(existingFiles.map((file) => [file.path, file.language]))
      const pass1ChunkFiles: string[] = []
      const pass2ChunkFiles: string[] = []
      let stagedFileCount = 0
      let stagedSymbolCount = 0
      let stagedRelationCount = 0
      const changedTypeIds = new Set<string>()
      const seenOverrideKeys = new Set<string>()

      let processed = 0
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkFiles: FileNode[] = []
        const chunkDocuments: DocumentNode[] = []
        const chunkSymbols: SymbolNode[] = []
        for (const [prefixedPath, absPath] of chunk) {
          processed++
          if (processed % 50 === 0 || processed === 1) {
            progress(
              7 + Math.round((processed / totalToProcess) * 43),
              'Parsing symbols',
              `${String(processed)}/${String(totalToProcess)}`,
            )
          }
          try {
            const contentBuffer = readFileSync(absPath)
            const decodedContent = decodeTextualContent(contentBuffer)
            // Use the relative-to-codeRoot path for adapter matching (extension-based)
            const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
            const adapter = this.registry.getAdapterForFile(relPath)
            if (!adapter) {
              if (decodedContent === null) {
                continue
              }
              const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
              const hash = fileHashes.get(prefixedPath) ?? computeContentHash(decodedContent)
              chunkDocuments.push(
                createDocumentNode({
                  path: prefixedPath,
                  configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
                  contentHash: hash,
                  content: decodedContent,
                  workspace: wsName,
                }),
              )
              documentsIndexed++
              const breakdown = wsBreakdowns.get(wsName)
              if (breakdown) {
                breakdown.filesIndexed++
                breakdown.documentsIndexed++
              }
              continue
            }

            const language = this.registry.getLanguageForFile(relPath) ?? 'unknown'
            const content = contentBuffer.toString('utf-8')
            const hash = fileHashes.get(prefixedPath) ?? computeContentHash(content)
            const extracted = adapter.extractSymbolsWithNamespace?.(prefixedPath, content) ?? {
              symbols: adapter.extractSymbols(prefixedPath, content),
              namespace: adapter.extractNamespace?.(content),
            }
            const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
            const symbols = this.assignParentIds(extracted.symbols, language)

            if (adapter.buildQualifiedName && extracted.namespace) {
              for (const s of symbols) {
                qualifiedNames.set(adapter.buildQualifiedName(extracted.namespace, s.name), s.id)
              }
            }

            symbolIndex.addFile(prefixedPath, symbols)
            chunkFiles.push(
              createFileNode({
                path: prefixedPath,
                configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
                language,
                contentHash: hash,
                workspace: wsName,
              }),
            )
            fileLanguages.set(prefixedPath, language)
            chunkSymbols.push(...symbols)
            for (const symbol of symbols) {
              if (symbol.kind === 'class' || symbol.kind === 'interface') {
                changedTypeIds.add(symbol.id)
              }
            }
            filesIndexed++

            const breakdown = wsBreakdowns.get(wsName)
            if (breakdown) breakdown.filesIndexed++
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
          }
        }
        const stageFile = `pass1-${String(chunkIndex).padStart(5, '0')}.json`
        writeStageChunk(stageDir, stageFile, {
          files: chunkFiles,
          documents: chunkDocuments,
          symbols: chunkSymbols,
        })
        pass1ChunkFiles.push(stageFile)
        stagedFileCount += chunkFiles.length
        stagedFileCount += chunkDocuments.length
        stagedSymbolCount += chunkSymbols.length
      }
      // Populate SymbolIndex with existing symbols from unchanged files
      const processedPaths = new Set(filesToProcess)
      for (const prefixedPath of allDiscoveredPaths) {
        if (processedPaths.has(prefixedPath)) continue
        const existing = await this.store.findSymbols({ filePath: prefixedPath })
        if (existing.length > 0) {
          symbolIndex.addFile(prefixedPath, existing)
        }
      }

      const ownershipIndex = this.buildMethodOwnershipIndex(symbolIndex)
      const symbolLookup = createSymbolLookup(symbolIndex)

      // ── Pass 2: Resolve imports + extract relations (50-80%) ──
      processed = 0
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkRelations: Relation[] = []
        for (const [prefixedPath, absPath] of chunk) {
          processed++
          if (processed % 50 === 0 || processed === 1) {
            progress(
              50 + Math.round((processed / totalToProcess) * 30),
              'Resolving imports',
              `${String(processed)}/${String(totalToProcess)}`,
            )
          }
          try {
            const content = readFileSync(absPath, 'utf-8')
            const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
            const adapter = this.registry.getAdapterForFile(relPath)
            if (!adapter) continue

            const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
            const ws = options.workspaces.find((w) => w.name === wsName)

            const symbols = symbolIndex.findByFile(prefixedPath)
            const relationSymbols = adapter.languages().includes('php')
              ? symbolIndex.findByFilePrefix(`${wsName}:`)
              : symbols
            const imports = adapter.extractImportedNames(prefixedPath, content)
            const { importMap, fileImports } = this.resolveImports(
              imports,
              prefixedPath,
              adapter,
              symbolIndex,
              qualifiedNames,
              packageToWorkspace,
              ws?.codeRoot,
            )
            const bindingFacts =
              adapter.extractBindingFacts?.(prefixedPath, content, symbols, imports) ?? []
            const callFacts = adapter.extractCallFacts?.(prefixedPath, content, symbols) ?? []
            const scopedEnvironment = buildScopedBindingEnvironment({
              filePath: prefixedPath,
              symbols,
              imports,
              importMap,
              scopes: [createDefaultFileScope(prefixedPath)],
              facts: bindingFacts,
              symbolLookup,
            })
            const resolvedDependencies = resolveDependencyFacts({
              environment: scopedEnvironment,
              bindingFacts,
              callFacts,
              symbols,
              symbolLookup,
            })
            const relations = adapter.extractRelations(
              prefixedPath,
              content,
              relationSymbols,
              importMap,
            )

            chunkRelations.push(...relations)
            for (const dependency of resolvedDependencies) {
              chunkRelations.push(
                createRelation({
                  source: dependency.sourceSymbolId,
                  target: dependency.targetSymbolId,
                  type: dependency.relationType,
                  metadata: {
                    reason: dependency.reason,
                    line: dependency.location.line,
                    column: dependency.location.column,
                  },
                }),
              )
            }
            for (const targetPath of fileImports) {
              chunkRelations.push(
                createRelation({
                  source: prefixedPath,
                  target: targetPath,
                  type: RelationType.Imports,
                }),
              )
            }
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
          }
        }
        for (const relation of chunkRelations) {
          if (relation.type === RelationType.Overrides) {
            seenOverrideKeys.add(`${relation.source}:${relation.type}:${relation.target}`)
          }
        }
        const stageFile = `pass2-${String(chunkIndex).padStart(5, '0')}.json`
        const uniqueRelations = deduplicateRelations(chunkRelations)
        writeStageChunk(stageDir, stageFile, { relations: uniqueRelations })
        pass2ChunkFiles.push(stageFile)
        stagedRelationCount += uniqueRelations.length
      }

      // ── Specs (80-83%) ──
      progress(80, 'Discovering specs')
      let totalSpecsToProcess = 0
      for (const ws of options.workspaces) {
        totalSpecsToProcess += await ws.specRepo.count()
      }

      let specsProcessed = 0
      let specsIndexed = 0
      const allSpecs: SpecNode[] = []
      const specRelations: Relation[] = []

      const existingSpecs = await this.store.getAllSpecs()
      const existingSpecMap = new Map(existingSpecs.map((s) => [s.specId, s]))

      // 1. Discovery & Global ID set (for relation resolution)
      const knownSpecIds = new Set(existingSpecs.map((s) => s.specId))
      const specsByWorkspace = new Map<string, Spec[]>()

      for (const ws of options.workspaces) {
        const repoSpecs = await ws.specRepo.list()
        specsByWorkspace.set(ws.name, repoSpecs)

        const wsBreakdown = wsBreakdowns.get(ws.name)
        if (wsBreakdown) wsBreakdown.specsDiscovered = repoSpecs.length

        // Prune deleted specs from knownSpecIds for this workspace
        const discoveredIds = new Set(repoSpecs.map((s) => `${ws.name}:${s.name.toString()}`))
        for (const existing of existingSpecs) {
          if (existing.workspace === ws.name && !discoveredIds.has(existing.specId)) {
            knownSpecIds.delete(existing.specId)
          }
        }
        for (const id of discoveredIds) {
          knownSpecIds.add(id)
        }
      }

      // 2. Individual Spec Indexing
      for (const ws of options.workspaces) {
        const repoSpecs = specsByWorkspace.get(ws.name) ?? []
        const wsBreakdown = wsBreakdowns.get(ws.name)
        const specIdsToRemove: string[] = []

        // Mark deleted specs for removal
        const discoveredIds = new Set(repoSpecs.map((s) => `${ws.name}:${s.name.toString()}`))
        for (const existing of existingSpecs) {
          if (existing.workspace === ws.name && !discoveredIds.has(existing.specId)) {
            specIdsToRemove.push(existing.specId)
          }
        }

        for (const repoSpec of repoSpecs) {
          specsProcessed++
          if (specsProcessed % 20 === 0 || specsProcessed === 1) {
            progress(
              80 + Math.round((specsProcessed / Math.max(totalSpecsToProcess, 1)) * 3),
              'Indexing specs',
              `${String(specsProcessed)}/${String(totalSpecsToProcess)}`,
            )
          }

          try {
            const specId = `${ws.name}:${repoSpec.name.toString()}`
            const existing = existingSpecMap.get(specId)
            const specHash = await ws.specRepo.specHash(repoSpec)

            if (specHash !== null && existing?.contentHash === specHash) {
              if (wsBreakdown) wsBreakdown.specsIndexed++
              continue
            }

            const metadata = await ws.specRepo.metadata(repoSpec)
            const dependsOn = await ws.specRepo.readPersistedDependsOn(repoSpec)
            const implementationLinks = await ws.specRepo.readPersistedImplementation(repoSpec)

            let content = ''
            const artifacts = await Promise.all(
              repoSpec.filenames.map((f) => ws.specRepo.artifact(repoSpec, f)),
            )
            for (const artifact of artifacts) {
              if (artifact?.content) {
                content += artifact.content + '\n'
              }
            }

            const specNode = createSpecNode({
              specId,
              path: repoSpec.name.toString(),
              title: metadata?.title ?? repoSpec.name.toString(),
              description: metadata?.description ?? '',
              contentHash: specHash ?? 'unknown',
              content,
              workspace: ws.name,
            })

            if (existing) {
              specIdsToRemove.push(specId)
            }

            // Create relations
            if (dependsOn) {
              for (const depId of dependsOn) {
                if (knownSpecIds.has(depId)) {
                  specRelations.push(
                    createRelation({
                      source: specId,
                      target: depId,
                      type: RelationType.DependsOn,
                    }),
                  )
                }
              }
            }

            if (implementationLinks) {
              for (const link of implementationLinks) {
                if (!link.symbols || link.symbols.length === 0) {
                  specRelations.push(
                    createRelation({
                      source: specId,
                      target: link.file,
                      type: RelationType.CoversFile,
                    }),
                  )
                } else {
                  for (const symbolName of link.symbols) {
                    const matchingSymbols = symbolIndex
                      .findByFile(link.file)
                      .filter((s) => s.name === symbolName)
                    for (const symbol of matchingSymbols) {
                      specRelations.push(
                        createRelation({
                          source: specId,
                          target: symbol.id,
                          type: RelationType.CoversSymbol,
                        }),
                      )
                    }
                  }
                }
              }
            }

            allSpecs.push(specNode)
            specsIndexed++
            if (wsBreakdown) wsBreakdown.specsIndexed++
          } catch (err) {
            errors.push({ filePath: repoSpec.name.toString(), message: String(err) })
          }
        }

        if (specIdsToRemove.length > 0) {
          try {
            await this.store.removeSpecs([...new Set(specIdsToRemove)])
          } catch (err) {
            errors.push({ filePath: ws.name, message: String(err) })
          }
        }
      }

      // Compute per-workspace skipped counts
      for (const filePath of skippedFiles) {
        const wsName = filePath.substring(0, filePath.indexOf(':'))
        const breakdown = wsBreakdowns.get(wsName)
        if (breakdown) breakdown.filesSkipped++
      }

      // ── Bulk load everything (83-95%) ──
      progress(
        83,
        'Bulk loading',
        `${String(stagedFileCount)} files, ${String(stagedSymbolCount)} symbols, ${String(stagedRelationCount + specRelations.length)} relations`,
      )
      const serializedFingerprintMap = serializeFingerprintMap(currentFingerprintMap)
      if (
        stagedFileCount > 0 ||
        allSpecs.length > 0 ||
        stagedRelationCount > 0 ||
        specRelations.length > 0
      ) {
        let bulkStep = 0
        const onBulkStep = (step: string): void => {
          bulkStep++
          progress(83 + Math.min(Math.round(bulkStep * 2), 12), 'Bulk loading', step)
        }
        for (const chunkFile of pass1ChunkFiles) {
          const staged = readFilesAndSymbolsStageChunk(stageDir, chunkFile)
          await this.store.bulkLoad({
            files: staged.files,
            documents: staged.documents,
            symbols: staged.symbols,
            specs: [],
            relations: [],
            onProgress: onBulkStep,
          })
        }
        if (allSpecs.length > 0) {
          await this.store.bulkLoad({
            files: [],
            documents: [],
            symbols: [],
            specs: allSpecs,
            relations: [],
            onProgress: onBulkStep,
          })
        }
        for (const chunkFile of pass2ChunkFiles) {
          const staged = readRelationsStageChunk(stageDir, chunkFile)
          if (staged.relations.length === 0) continue
          await this.store.bulkLoad({
            files: [],
            symbols: [],
            specs: [],
            relations: staged.relations,
            onProgress: onBulkStep,
          })
        }
        if (specRelations.length > 0 || options.vcsRef !== undefined || serializedFingerprintMap) {
          await this.store.bulkLoad({
            files: [],
            symbols: [],
            specs: [],
            relations: specRelations,
            onProgress: onBulkStep,
            ...(options.vcsRef !== undefined ? { vcsRef: options.vcsRef } : {}),
            graphFingerprint: serializedFingerprintMap,
          })
        }
      }

      const crossFileOverrides = await this.deriveCrossFileOverrideRelations(
        changedTypeIds,
        ownershipIndex,
        seenOverrideKeys,
      )
      if (crossFileOverrides.length > 0) {
        await this.store.addRelations(crossFileOverrides)
      }

      // Rebuild FTS indexes after data changes
      progress(96, 'Rebuilding search indexes')
      await this.store.rebuildFtsIndexes()

      progress(100, 'Done')

      const workspaces: WorkspaceIndexBreakdown[] = options.workspaces.map((ws) => {
        const breakdown = wsBreakdowns.get(ws.name)!
        return {
          name: ws.name,
          filesDiscovered: breakdown.filesDiscovered,
          filesIndexed: breakdown.filesIndexed,
          documentsIndexed: breakdown.documentsIndexed,
          filesSkipped: breakdown.filesSkipped,
          filesRemoved: breakdown.filesRemoved,
          specsDiscovered: breakdown.specsDiscovered,
          specsIndexed: breakdown.specsIndexed,
        }
      })

      if (wsBreakdowns.has('root')) {
        const breakdown = wsBreakdowns.get('root')!
        workspaces.push({
          name: 'root',
          filesDiscovered: breakdown.filesDiscovered,
          filesIndexed: breakdown.filesIndexed,
          documentsIndexed: breakdown.documentsIndexed,
          filesSkipped: breakdown.filesSkipped,
          filesRemoved: breakdown.filesRemoved,
          specsDiscovered: 0,
          specsIndexed: 0,
        })
      }

      return {
        filesDiscovered: allDiscoveredPaths.length,
        filesIndexed: filesIndexed + documentsIndexed,
        documentsIndexed,
        filesRemoved: filesRemovedCount,
        filesSkipped: skippedFiles.length,
        specsDiscovered: totalSpecsToProcess,
        specsIndexed,
        errors,
        duration: Date.now() - start,
        workspaces,
        vcsRef: options.vcsRef ?? null,
        graphFingerprint: serializedFingerprintMap,
        fullRebuildReason,
      }
    } finally {
      rmSync(stageDir, { recursive: true, force: true })
    }
  }

  /**
   * Resolves import declarations to symbol ids using the in-memory symbol index.
   * All language-specific resolution is delegated to the adapter.
   * @param imports - Parsed import declarations.
   * @param filePath - The importing file path (workspace-prefixed).
   * @param adapter - The language adapter for this file.
   * @param index - The in-memory symbol index.
   * @param qualifiedNames - Map of qualified names to symbol ids.
   * @param packageToWorkspace - Map of package names to workspace name prefixes.
   * @param codeRoot - Optional absolute path to the workspace code root, used for PSR-4 fallback.
   * @param repoRoot - Optional absolute path to the repository root, used for PSR-4 fallback.
   * @returns An importMap of local import names to resolved symbol ids, and fileImports of resolved absolute paths.
   */
  private resolveImports(
    imports: ImportDeclaration[],
    filePath: string,
    adapter: LanguageAdapter,
    index: SymbolIndex,
    qualifiedNames: Map<string, string>,
    packageToWorkspace: Map<string, string>,
    codeRoot?: string,
    repoRoot?: string,
  ): { importMap: Map<string, string>; fileImports: string[] } {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const knownPackages = [...packageToWorkspace.keys()]

    for (const imp of imports) {
      if (isFileOnlyImport(imp)) {
        const resolved = this.resolveFileImport(imp, filePath, adapter, index, codeRoot, repoRoot)
        if (resolved !== undefined) {
          fileImports.push(resolved)
        }
        continue
      }

      if (imp.isRelative) {
        // Delegate path resolution to the adapter
        if (adapter.resolveRelativeImportPath) {
          const resolved = adapter.resolveRelativeImportPath(filePath, imp.specifier)
          const candidates = Array.isArray(resolved) ? resolved : [resolved]
          for (const candidatePath of candidates) {
            const target = index.findByFile(candidatePath).find((s) => s.name === imp.originalName)
            if (target) {
              importMap.set(imp.localName, target.id)
              break
            }
          }
        }
      } else {
        // Qualified name resolution (e.g. PHP namespaces)
        const qualifiedId = qualifiedNames.get(imp.specifier)
        if (qualifiedId) {
          importMap.set(imp.localName, qualifiedId)
          continue
        }

        // Package resolution — delegate specifier parsing to the adapter
        if (adapter.resolvePackageFromSpecifier) {
          const pkgName = adapter.resolvePackageFromSpecifier(imp.specifier, knownPackages)
          if (pkgName) {
            const wsPrefix = packageToWorkspace.get(pkgName)
            if (wsPrefix !== undefined) {
              const candidates = index.findByName(imp.originalName, wsPrefix + ':')
              if (candidates.length > 0) {
                importMap.set(imp.localName, candidates[0]!.id)
              }
            }
          }
        }

        // PSR-4 fallback for namespace-based imports not resolved via symbol index
        if (adapter.resolveQualifiedNameToPath && codeRoot) {
          const resolvedPath = adapter.resolveQualifiedNameToPath(imp.specifier, codeRoot, repoRoot)
          if (resolvedPath) {
            fileImports.push(resolvedPath)
            continue
          }
        }
      }
    }

    return { importMap, fileImports }
  }

  /**
   * Resolves a file-only import declaration to a workspace file when deterministic.
   * @param imp - Import declaration to resolve.
   * @param filePath - Importing file path.
   * @param adapter - Language adapter.
   * @param index - In-memory symbol index.
   * @param codeRoot - Optional workspace code root.
   * @param repoRoot - Optional repository root.
   * @returns Target file path, or undefined when unresolved.
   */
  private resolveFileImport(
    imp: ImportDeclaration,
    filePath: string,
    adapter: LanguageAdapter,
    index: SymbolIndex,
    codeRoot?: string,
    repoRoot?: string,
  ): string | undefined {
    if (imp.isRelative && adapter.resolveRelativeImportPath) {
      const resolved = adapter.resolveRelativeImportPath(filePath, imp.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      return candidates.find((candidatePath) => index.findByFile(candidatePath).length > 0)
    }

    if (!imp.isRelative && adapter.resolveQualifiedNameToPath && codeRoot) {
      return adapter.resolveQualifiedNameToPath(imp.specifier, codeRoot, repoRoot)
    }

    return undefined
  }

  /**
   * Builds a lightweight method-to-owner index from the extracted symbols.
   * @param index - The in-memory symbol index.
   * @returns Owner-to-method mapping for languages with class-scoped methods.
   */
  private buildMethodOwnershipIndex(index: SymbolIndex): MethodOwnershipIndex {
    const methodsByOwnerId = new Map<string, Map<string, string[]>>()

    for (const [, fileSymbols] of index.entries()) {
      for (const symbol of fileSymbols) {
        if (symbol.kind !== SymbolKind.Method || !symbol.parentId) continue

        const methodsByName = methodsByOwnerId.get(symbol.parentId) ?? new Map<string, string[]>()
        const methodIds = methodsByName.get(symbol.name) ?? []
        methodIds.push(symbol.id)
        methodsByName.set(symbol.name, methodIds)
        methodsByOwnerId.set(symbol.parentId, methodsByName)
      }
    }

    return { methodsByOwnerId }
  }

  /**
   * Collects files that must be re-processed because they contain classes/interfaces
   * that extend or implement modified types from the current changed set.
   * @param changedFiles - Files that were already identified as new or changed.
   * @returns Set of additional file paths to re-extract.
   */
  private async collectHierarchyDependentFiles(changedFiles: string[]): Promise<Set<string>> {
    const toReprocess = new Set<string>()
    if (changedFiles.length === 0) return toReprocess

    const changedSymbols = await this.store.findSymbols({ filePaths: changedFiles })
    const typeIds = new Set<string>()
    for (const s of changedSymbols) {
      if (s.kind === 'class' || s.kind === 'interface') {
        typeIds.add(s.id)
      }
    }

    if (typeIds.size === 0) return toReprocess

    for (const typeId of typeIds) {
      const dependents = await getUpstream(this.store, typeId, { maxDepth: 1 })
      for (const level of dependents.levels.values()) {
        for (const dep of level) {
          // We don't have relation type in SymbolNode, but getUpstream includes hierarchy relations.
          // This is a bit broader than strictly needed (includes CALLS), but safe for correctness.
          toReprocess.add(dep.filePath)
        }
      }
    }

    return toReprocess
  }

  /**
   * Derives COVERS_FILE and COVERS_SYMBOL relations for class methods when the
   * owner type is linked to a spec.
   * @param changedTypeIds - IDs of classes/interfaces that were re-extracted.
   * @param ownershipIndex - Owner-to-method mapping.
   * @param seenOverrideKeys - Relations already identified by Pass 2.
   * @returns Additional relations to add.
   */
  private async deriveCrossFileOverrideRelations(
    changedTypeIds: Set<string>,
    ownershipIndex: MethodOwnershipIndex,
    seenOverrideKeys: Set<string>,
  ): Promise<Relation[]> {
    const relations: Relation[] = []
    if (changedTypeIds.size === 0) return relations

    for (const typeId of changedTypeIds) {
      // Traverse DOWN to find base types
      const hierarchy = await getDownstream(this.store, typeId, { maxDepth: 10 })

      for (const [, symbols] of hierarchy.levels) {
        for (const symbol of symbols) {
          const superTypeId = symbol.id
          // Verify if this is actually a base type (Extends/Implements)
          const baseTargets = await this.store.getExtendedTargets(typeId)
          const implementedTargets = await this.store.getImplementedTargets(typeId)

          const isBase = [...baseTargets, ...implementedTargets].some(
            (r) => r.target === superTypeId,
          )
          if (!isBase) continue

          const subMethods = ownershipIndex.methodsByOwnerId.get(typeId)
          if (!subMethods) continue

          const superMethods = await this.fetchMethodsForType(superTypeId)
          for (const [name, subMethodIds] of subMethods.entries()) {
            const superMethodId = superMethods.get(name)
            if (superMethodId) {
              for (const subId of subMethodIds) {
                const key = `${subId}:${RelationType.Overrides}:${superMethodId}`
                if (!seenOverrideKeys.has(key)) {
                  relations.push(
                    createRelation({
                      source: subId,
                      target: superMethodId,
                      type: RelationType.Overrides,
                    }),
                  )
                  seenOverrideKeys.add(key)
                }
              }
            }
          }
        }
      }
    }

    return relations
  }

  /**
   * Helper to fetch all methods of a type from the store.
   * @param typeId - ID of the class or interface.
   * @returns Map of method name to symbol id.
   */
  private async fetchMethodsForType(typeId: string): Promise<Map<string, string>> {
    const methods = await this.store.findSymbols({
      parentSymbolId: typeId,
      kind: SymbolKind.Method,
    })
    return new Map(methods.map((m) => [m.name, m.id]))
  }

  /**
   * Assigns parentId to symbols within a file based on line/column range.
   * @param symbols - The symbols to process.
   * @param language - The language of the file.
   * @returns A new array of symbols with parentId set where applicable.
   */
  private assignParentIds(symbols: readonly SymbolNode[], language: string): SymbolNode[] {
    const supportedLanguages = new Set(['typescript', 'tsx', 'javascript', 'jsx', 'python', 'php'])
    if (!supportedLanguages.has(language)) return [...symbols]

    const sortedSymbols = [...symbols].sort((left, right) => {
      if (left.line !== right.line) return left.line - right.line
      return left.column - right.column
    })

    const results: SymbolNode[] = []
    let currentOwnerId: string | undefined

    for (const symbol of sortedSymbols) {
      if (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface) {
        currentOwnerId = symbol.id
        results.push(symbol)
        continue
      }

      if (symbol.kind === SymbolKind.Method && currentOwnerId) {
        results.push(
          createSymbolNode({
            ...symbol,
            parentId: currentOwnerId,
          }),
        )
      } else {
        results.push(symbol)
      }
    }

    return results
  }
}

/**
 * No-op progress callback used as default when no onProgress handler is provided.
 */
function noop(): void {
  // intentionally empty
}
