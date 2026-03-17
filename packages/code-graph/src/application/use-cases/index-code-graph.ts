import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { type GraphStore } from '../../domain/ports/graph-store.js'
import { type FileNode, createFileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
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
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { discoverFiles } from './discover-files.js'
import { computeContentHash } from './compute-content-hash.js'

const DEFAULT_CHUNK_BYTES = 20 * 1024 * 1024

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
 * Use case that indexes source files and specs into the code graph.
 * Multi-workspace, two-pass parsing with in-memory symbol index,
 * chunked for memory control, and CSV bulk loading for speed.
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
   * Executes the indexing pipeline for the given workspaces.
   * @param options - Options controlling the indexing run.
   * @returns A summary result with counts and any errors encountered.
   */
  async execute(options: IndexOptions): Promise<IndexResult> {
    const start = Date.now()
    const errors: IndexError[] = []
    const onProgress = options.onProgress ?? noop
    const chunkBudget = options.chunkBytes ?? DEFAULT_CHUNK_BYTES

    const progress = (pct: number, phase: string, detail?: string): void => {
      onProgress(Math.min(pct, 100), detail ? `${phase} — ${detail}` : phase)
    }

    // ── Discovery (0-5%) — per workspace ──
    progress(0, 'Discovering files')
    const existingFiles = await this.store.getAllFiles()
    const existingMap = new Map(existingFiles.map((f) => [f.path, f]))

    // Per-workspace tracking
    const wsBreakdowns = new Map<
      string,
      {
        filesDiscovered: number
        filesIndexed: number
        filesSkipped: number
        filesRemoved: number
        specsDiscovered: number
        specsIndexed: number
      }
    >()

    // [workspacePrefixedPath, absolutePath] tuples for all files to process
    const allDiscoveredPaths: string[] = []
    const fileHashes = new Map<string, string>()
    const absolutePaths = new Map<string, string>() // prefixed path -> absolute path

    for (const ws of options.workspaces) {
      wsBreakdowns.set(ws.name, {
        filesDiscovered: 0,
        filesIndexed: 0,
        filesSkipped: 0,
        filesRemoved: 0,
        specsDiscovered: 0,
        specsIndexed: 0,
      })

      const relFiles = discoverFiles(
        ws.codeRoot,
        (filePath) => this.registry.getAdapterForFile(filePath) !== undefined,
      )

      const breakdown = wsBreakdowns.get(ws.name)!
      breakdown.filesDiscovered = relFiles.length

      for (const relPath of relFiles) {
        const prefixedPath = `${ws.name}:${relPath}`
        allDiscoveredPaths.push(prefixedPath)
        absolutePaths.set(prefixedPath, join(ws.codeRoot, relPath))
      }
    }

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
    const newFiles: string[] = []
    const changedFiles: string[] = []
    const deletedFiles: string[] = []

    for (const prefixedPath of allDiscoveredPaths) {
      const hash = fileHashes.get(prefixedPath)
      const existing = existingMap.get(prefixedPath)
      if (!existing) {
        newFiles.push(prefixedPath)
      } else if (hash && existing.contentHash !== hash) {
        changedFiles.push(prefixedPath)
      }
    }

    // Only consider files from the workspaces being indexed as candidates for deletion
    const indexedWorkspaceNames = new Set(options.workspaces.map((ws) => ws.name))
    for (const existing of existingFiles) {
      if (!discoveredSet.has(existing.path) && indexedWorkspaceNames.has(existing.workspace)) {
        deletedFiles.push(existing.path)
      }
    }

    // Track per-workspace removals
    for (const filePath of deletedFiles) {
      const wsName = filePath.substring(0, filePath.indexOf(':'))
      const breakdown = wsBreakdowns.get(wsName)
      if (breakdown) breakdown.filesRemoved++
    }

    const filesToProcess = [...newFiles, ...changedFiles]

    // ── Cleanup (6%) ──
    const toRemove = [...deletedFiles, ...changedFiles]
    progress(6, 'Cleaning up', `${String(toRemove.length)} to remove`)
    let filesRemoved = 0
    for (const filePath of toRemove) {
      try {
        await this.store.removeFile(filePath)
        if (deletedFiles.includes(filePath)) filesRemoved++
      } catch (err) {
        errors.push({ filePath, message: String(err) })
      }
    }

    // ── Pass 1: Extract symbols (7-50%) — all workspaces ──
    const fileTuples: Array<[string, string]> = filesToProcess.map((p) => [
      p,
      absolutePaths.get(p)!,
    ])
    const chunks = groupIntoChunks(fileTuples, chunkBudget)
    const totalToProcess = filesToProcess.length
    let filesIndexed = 0
    const qualifiedNames = new Map<string, string>()
    const symbolIndex = new SymbolIndex()

    // Build package-name → workspace-name map for cross-workspace import resolution.
    // Each adapter reads its language's manifest (package.json, go.mod, etc.) to
    // extract the package identity. This is language-agnostic and works for both
    // monorepo and multirepo setups.
    const packageToWorkspace = new Map<string, string>()
    const adapters = this.registry.getAdapters()
    for (const ws of options.workspaces) {
      for (const adapter of adapters) {
        if (adapter.getPackageIdentity) {
          const identity = adapter.getPackageIdentity(ws.codeRoot, ws.repoRoot)
          if (identity) {
            packageToWorkspace.set(identity, ws.name)
            break
          }
        }
      }
    }

    const allFiles: FileNode[] = []
    const allSymbols: SymbolNode[] = []
    const allRelations: Relation[] = []

    let processed = 0
    for (const chunk of chunks) {
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
          const content = readFileSync(absPath, 'utf-8')
          // Use the relative-to-codeRoot path for adapter matching (extension-based)
          const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
          const adapter = this.registry.getAdapterForFile(relPath)
          if (!adapter) continue

          const language = this.registry.getLanguageForFile(relPath) ?? 'unknown'
          const hash = fileHashes.get(prefixedPath) ?? computeContentHash(content)
          // Extract symbols with workspace-prefixed path
          const symbols = adapter.extractSymbols(prefixedPath, content)
          const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))

          if (adapter.extractNamespace && adapter.buildQualifiedName) {
            const ns = adapter.extractNamespace(content)
            if (ns) {
              for (const s of symbols) {
                qualifiedNames.set(adapter.buildQualifiedName(ns, s.name), s.id)
              }
            }
          }

          symbolIndex.addFile(prefixedPath, symbols)
          allFiles.push(
            createFileNode({
              path: prefixedPath,
              language,
              contentHash: hash,
              workspace: wsName,
            }),
          )
          allSymbols.push(...symbols)
          filesIndexed++

          // Track per-workspace
          const breakdown = wsBreakdowns.get(wsName)
          if (breakdown) breakdown.filesIndexed++
        } catch (err) {
          errors.push({ filePath: prefixedPath, message: String(err) })
        }
      }
    }

    // ── Pass 2: Resolve imports + extract relations (50-80%) ──
    processed = 0
    for (const chunk of chunks) {
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

          const symbols = symbolIndex.findByFile(prefixedPath)
          const imports = adapter.extractImportedNames(prefixedPath, content)
          const importMap = this.resolveImports(
            imports,
            prefixedPath,
            adapter,
            symbolIndex,
            qualifiedNames,
            packageToWorkspace,
          )
          const relations = adapter.extractRelations(prefixedPath, content, symbols, importMap)

          allRelations.push(...relations)
        } catch (err) {
          errors.push({ filePath: prefixedPath, message: String(err) })
        }
      }
    }

    // ── Specs (80-83%) — per workspace ──
    progress(80, 'Discovering specs')
    let totalSpecsDiscovered = 0
    let specsIndexed = 0
    const allSpecs: SpecNode[] = []

    const existingSpecs = await this.store.getAllSpecs()
    const existingSpecMap = new Map(existingSpecs.map((s) => [s.specId, s]))

    for (const ws of options.workspaces) {
      const discoveredSpecs = await ws.specs()

      const wsBreakdown = wsBreakdowns.get(ws.name)!
      wsBreakdown.specsDiscovered = discoveredSpecs.length
      totalSpecsDiscovered += discoveredSpecs.length
      progress(80, 'Discovering specs', `${String(totalSpecsDiscovered)} found`)

      const discoveredSpecIds = new Set(discoveredSpecs.map((s) => s.spec.specId))

      // Remove deleted specs for this workspace (always runs, even when no specs discovered)
      for (const existing of existingSpecs) {
        if (existing.workspace === ws.name && !discoveredSpecIds.has(existing.specId)) {
          try {
            await this.store.removeSpec(existing.specId)
          } catch (err) {
            errors.push({ filePath: existing.path, message: String(err) })
          }
        }
      }

      for (const { spec } of discoveredSpecs) {
        try {
          const existing = existingSpecMap.get(spec.specId)
          if (existing && existing.contentHash === spec.contentHash) continue

          if (existing) {
            await this.store.removeSpec(spec.specId)
          }

          for (const depId of spec.dependsOn) {
            if (discoveredSpecIds.has(depId)) {
              allRelations.push(
                createRelation({
                  source: spec.specId,
                  target: depId,
                  type: RelationType.DependsOn,
                }),
              )
            }
          }
          allSpecs.push(spec)
          specsIndexed++
          wsBreakdown.specsIndexed++
        } catch (err) {
          errors.push({ filePath: spec.path, message: String(err) })
        }
      }
    }

    // Compute per-workspace skipped counts
    for (const ws of options.workspaces) {
      const breakdown = wsBreakdowns.get(ws.name)!
      breakdown.filesSkipped = breakdown.filesDiscovered - breakdown.filesIndexed
    }

    // ── Bulk load everything (83-95%) ──
    progress(
      83,
      'Bulk loading',
      `${String(allFiles.length)} files, ${String(allSymbols.length)} symbols, ${String(allRelations.length)} relations`,
    )
    if (allFiles.length > 0 || allSpecs.length > 0) {
      try {
        let bulkStep = 0
        await this.store.bulkLoad({
          files: allFiles,
          symbols: allSymbols,
          specs: allSpecs,
          relations: allRelations,
          onProgress: (step) => {
            bulkStep++
            progress(83 + Math.min(Math.round(bulkStep * 2), 12), 'Bulk loading', step)
          },
        })
      } catch (err) {
        errors.push({ filePath: '<bulk-load>', message: String(err) })
      }
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
        filesSkipped: breakdown.filesSkipped,
        filesRemoved: breakdown.filesRemoved,
        specsDiscovered: breakdown.specsDiscovered,
        specsIndexed: breakdown.specsIndexed,
      }
    })

    return {
      filesDiscovered: allDiscoveredPaths.length,
      filesIndexed,
      filesRemoved,
      filesSkipped: allDiscoveredPaths.length - filesToProcess.length,
      specsDiscovered: totalSpecsDiscovered,
      specsIndexed,
      errors,
      duration: Date.now() - start,
      workspaces,
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
   * @returns A map of local import names to resolved symbol ids.
   */
  private resolveImports(
    imports: ImportDeclaration[],
    filePath: string,
    adapter: LanguageAdapter,
    index: SymbolIndex,
    qualifiedNames: Map<string, string>,
    packageToWorkspace: Map<string, string>,
  ): Map<string, string> {
    const importMap = new Map<string, string>()
    const knownPackages = [...packageToWorkspace.keys()]

    for (const imp of imports) {
      if (imp.isRelative) {
        // Delegate path resolution to the adapter
        if (adapter.resolveRelativeImportPath) {
          const resolvedPath = adapter.resolveRelativeImportPath(filePath, imp.specifier)
          const target = index.findByFile(resolvedPath).find((s) => s.name === imp.originalName)
          if (target) {
            importMap.set(imp.localName, target.id)
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
      }
    }

    return importMap
  }
}

/**
 * No-op progress callback used as default when no onProgress handler is provided.
 */
function noop(): void {
  // intentionally empty
}
