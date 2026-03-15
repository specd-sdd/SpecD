import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type GraphStore } from '../../domain/ports/graph-store.js'
import { type FileNode, createFileNode } from '../../domain/value-objects/file-node.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type SpecNode } from '../../domain/value-objects/spec-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { type IndexOptions } from '../../domain/value-objects/index-options.js'
import { type IndexResult, type IndexError } from '../../domain/value-objects/index-result.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { discoverFiles } from './discover-files.js'
import { discoverSpecs } from './discover-specs.js'
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
 * @param files - The file paths to group.
 * @param workspacePath - The workspace root.
 * @param budget - Maximum bytes per chunk.
 * @returns An array of file path arrays (chunks).
 */
function groupIntoChunks(files: string[], workspacePath: string, budget: number): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let currentBytes = 0

  for (const relPath of files) {
    let size = 0
    try {
      size = statSync(join(workspacePath, relPath)).size
    } catch {
      size = 0
    }

    if (current.length > 0 && currentBytes + size > budget) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }

    current.push(relPath)
    currentBytes += size
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Use case that indexes source files and specs into the code graph.
 * Single-pass parsing with in-memory symbol index, chunked for memory control,
 * and CSV bulk loading for speed.
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
   * Executes the indexing pipeline for the given workspace.
   * @param options - Options controlling the indexing run.
   * @returns A summary result with counts and any errors encountered.
   */
  async execute(options: IndexOptions): Promise<IndexResult> {
    const start = Date.now()
    const errors: IndexError[] = []
    const workspacePath = options.workspacePath
    const onProgress = options.onProgress ?? noop
    const chunkBudget = options.chunkBytes ?? DEFAULT_CHUNK_BYTES

    // Progress helper
    const progress = (pct: number, phase: string, detail?: string): void => {
      onProgress(Math.min(pct, 100), detail ? `${phase} — ${detail}` : phase)
    }

    // ── Discovery (0-5%) ──
    progress(0, 'Discovering files')
    const discoveredFiles = discoverFiles(
      workspacePath,
      (filePath) => this.registry.getAdapterForFile(filePath) !== undefined,
    )

    progress(2, 'Hashing files', `${discoveredFiles.length} files`)
    const existingFiles = await this.store.getAllFiles()
    const existingMap = new Map(existingFiles.map((f) => [f.path, f]))

    const fileHashes = new Map<string, string>()
    for (let i = 0; i < discoveredFiles.length; i++) {
      const relPath = discoveredFiles[i]!
      try {
        fileHashes.set(
          relPath,
          computeContentHash(readFileSync(join(workspacePath, relPath), 'utf-8')),
        )
      } catch (err) {
        errors.push({ filePath: relPath, message: String(err) })
      }
      if (i % 200 === 0) {
        progress(
          2 + Math.round((i / discoveredFiles.length) * 3),
          'Hashing files',
          `${i}/${discoveredFiles.length}`,
        )
      }
    }

    // ── Diff (5-6%) ──
    progress(5, 'Computing diff')
    const discoveredSet = new Set(discoveredFiles)
    const newFiles: string[] = []
    const changedFiles: string[] = []
    const deletedFiles: string[] = []

    for (const relPath of discoveredFiles) {
      const hash = fileHashes.get(relPath)
      const existing = existingMap.get(relPath)
      if (!existing) {
        newFiles.push(relPath)
      } else if (hash && existing.contentHash !== hash) {
        changedFiles.push(relPath)
      }
    }

    for (const existing of existingFiles) {
      if (!discoveredSet.has(existing.path)) {
        deletedFiles.push(existing.path)
      }
    }

    const filesToProcess = [...newFiles, ...changedFiles]

    // ── Cleanup (6%) ──
    const toRemove = [...deletedFiles, ...changedFiles]
    progress(6, 'Cleaning up', `${toRemove.length} to remove`)
    let filesRemoved = 0
    for (const filePath of toRemove) {
      try {
        await this.store.removeFile(filePath)
        if (deletedFiles.includes(filePath)) filesRemoved++
      } catch (err) {
        errors.push({ filePath, message: String(err) })
      }
    }

    // ── Single-pass parse: symbols + imports + CALLS (7-80%) ──
    const chunks = groupIntoChunks(filesToProcess, workspacePath, chunkBudget)
    const totalToProcess = filesToProcess.length
    let filesIndexed = 0
    const qualifiedNames = new Map<string, string>()
    const symbolIndex = new SymbolIndex()
    const monorepoMap = this.discoverMonorepoPackages(workspacePath)

    const allFiles: FileNode[] = []
    const allSymbols: SymbolNode[] = []
    const allRelations: Relation[] = []

    // First pass: parse all files to build symbol index
    // We need ALL symbols before resolving CALLS, because file A may call
    // a symbol from file Z that hasn't been parsed yet in this chunk.
    // So: pass 1 = extract symbols, pass 2 = resolve imports + CALLS per chunk.
    // But pass 2 uses the in-memory symbolIndex, NOT the store — so it's fast.

    // Pass 1: Extract symbols (7-50%)
    let processed = 0
    for (const chunk of chunks) {
      for (const relPath of chunk) {
        processed++
        if (processed % 50 === 0 || processed === 1) {
          progress(
            7 + Math.round((processed / totalToProcess) * 43),
            'Parsing symbols',
            `${processed}/${totalToProcess}`,
          )
        }
        try {
          const content = readFileSync(join(workspacePath, relPath), 'utf-8')
          const adapter = this.registry.getAdapterForFile(relPath)
          if (!adapter) continue

          const language = this.registry.getLanguageForFile(relPath) ?? 'unknown'
          const hash = fileHashes.get(relPath) ?? computeContentHash(content)
          const symbols = adapter.extractSymbols(relPath, content)

          if (adapter.extractNamespace) {
            const ns = adapter.extractNamespace(content)
            if (ns) {
              for (const s of symbols) {
                qualifiedNames.set(`${ns}\\${s.name}`, s.id)
              }
            }
          }

          symbolIndex.addFile(relPath, symbols)
          allFiles.push(
            createFileNode({
              path: relPath,
              language,
              contentHash: hash,
              workspace: workspacePath,
            }),
          )
          allSymbols.push(...symbols)
          filesIndexed++
        } catch (err) {
          errors.push({ filePath: relPath, message: String(err) })
        }
      }
    }

    // Pass 2: Resolve imports + extract relations (50-80%)
    // Now all symbols are in the index — we can resolve cross-file references
    processed = 0
    for (const chunk of chunks) {
      for (const relPath of chunk) {
        processed++
        if (processed % 50 === 0 || processed === 1) {
          progress(
            50 + Math.round((processed / totalToProcess) * 30),
            'Resolving imports',
            `${processed}/${totalToProcess}`,
          )
        }
        try {
          const content = readFileSync(join(workspacePath, relPath), 'utf-8')
          const adapter = this.registry.getAdapterForFile(relPath)
          if (!adapter) continue

          const symbols = symbolIndex.findByFile(relPath)
          const imports = adapter.extractImportedNames(relPath, content)
          const importMap = this.resolveImports(
            imports,
            relPath,
            workspacePath,
            symbolIndex,
            qualifiedNames,
            monorepoMap,
          )
          const relations = adapter.extractRelations(relPath, content, symbols, importMap)

          allRelations.push(...relations)
        } catch (err) {
          errors.push({ filePath: relPath, message: String(err) })
        }
      }
      // Chunk content eligible for GC after this iteration
    }

    // ── Specs (80-83%) ──
    progress(80, 'Discovering specs')
    const discoveredSpecs = discoverSpecs(workspacePath, (found) => {
      progress(80, 'Discovering specs', `${found} found`)
    })
    let specsIndexed = 0
    const allSpecs: SpecNode[] = []

    if (discoveredSpecs.length > 0) {
      const discoveredSpecIds = new Set(discoveredSpecs.map((s) => s.spec.specId))
      const existingSpecs = await this.store.getAllSpecs()
      const existingSpecMap = new Map(existingSpecs.map((s) => [s.specId, s]))

      // Remove deleted specs
      for (const existing of existingSpecs) {
        if (!discoveredSpecIds.has(existing.specId)) {
          try {
            await this.store.removeSpec(existing.specId)
          } catch (err) {
            errors.push({ filePath: existing.path, message: String(err) })
          }
        }
      }

      // Only process new or changed specs
      for (const { spec } of discoveredSpecs) {
        try {
          const existing = existingSpecMap.get(spec.specId)
          if (existing && existing.contentHash === spec.contentHash) continue

          // Remove old version if it exists (bulk load can't upsert)
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
        } catch (err) {
          errors.push({ filePath: spec.path, message: String(err) })
        }
      }
    }

    // ── Bulk load everything (83-95%) ──
    progress(
      83,
      'Bulk loading',
      `${allFiles.length} files, ${allSymbols.length} symbols, ${allRelations.length} relations`,
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

    progress(100, 'Done')

    return {
      filesDiscovered: discoveredFiles.length,
      filesIndexed,
      filesRemoved,
      filesSkipped: discoveredFiles.length - filesToProcess.length,
      specsDiscovered: discoveredSpecs.length,
      specsIndexed,
      errors,
      duration: Date.now() - start,
    }
  }

  /**
   * Resolves import declarations to symbol ids using the in-memory symbol index.
   * No store queries — purely in-memory lookup.
   * @param imports - Parsed import declarations.
   * @param filePath - The importing file path.
   * @param rootPath - The workspace root.
   * @param index - The in-memory symbol index.
   * @param qualifiedNames - Map of PHP qualified names to symbol ids.
   * @param monorepo - Map of package names to directories.
   * @returns A map of local import names to resolved symbol ids.
   */
  private resolveImports(
    imports: ImportDeclaration[],
    filePath: string,
    rootPath: string,
    index: SymbolIndex,
    qualifiedNames: Map<string, string>,
    monorepo: Map<string, string>,
  ): Map<string, string> {
    const importMap = new Map<string, string>()

    for (const imp of imports) {
      if (imp.isRelative) {
        const resolvedPath = this.resolveImportPath(filePath, imp.specifier)
        const target = index.findByFile(resolvedPath).find((s) => s.name === imp.originalName)
        if (target) {
          importMap.set(imp.localName, target.id)
        }
      } else {
        // Qualified name (PHP namespaces)
        const qualifiedId = qualifiedNames.get(imp.specifier)
        if (qualifiedId) {
          importMap.set(imp.localName, qualifiedId)
          continue
        }

        // Monorepo package
        const pkgName = imp.specifier.startsWith('@')
          ? imp.specifier.split('/').slice(0, 2).join('/')
          : imp.specifier.split('/')[0]!
        const pkgDir = monorepo.get(pkgName)
        if (!pkgDir) continue

        const pkgPrefix = relative(rootPath, pkgDir).replaceAll('\\', '/') + '/'
        const candidates = index.findByName(imp.originalName, pkgPrefix)
        if (candidates.length > 0) {
          importMap.set(imp.localName, candidates[0]!.id)
        }
      }
    }

    return importMap
  }

  /**
   * Discovers monorepo packages from pnpm-workspace.yaml.
   * @param workspacePath - The workspace root path.
   * @returns A map of package names to directory paths.
   */
  private discoverMonorepoPackages(workspacePath: string): Map<string, string> {
    const packages = new Map<string, string>()
    const wsFile = join(workspacePath, 'pnpm-workspace.yaml')
    if (!existsSync(wsFile)) return packages

    let wsContent: string
    try {
      wsContent = readFileSync(wsFile, 'utf-8')
    } catch {
      return packages
    }

    const globs: string[] = []
    const lines = wsContent.split('\n')
    let inPkgs = false
    for (const line of lines) {
      if (line.match(/^packages\s*:/)) {
        inPkgs = true
        continue
      }
      if (inPkgs) {
        const m = line.match(/^\s+-\s+['"]?([^'"]+)['"]?/)
        if (m?.[1]) globs.push(m[1])
        else if (!line.match(/^\s/)) inPkgs = false
      }
    }

    for (const glob of globs) {
      if (glob.endsWith('/*')) {
        const parentDir = join(workspacePath, glob.slice(0, -2))
        if (!existsSync(parentDir)) continue
        try {
          for (const entry of readdirSync(parentDir)) {
            this.tryRegisterPackage(join(parentDir, entry), packages)
          }
        } catch {
          continue
        }
      } else {
        this.tryRegisterPackage(join(workspacePath, glob), packages)
      }
    }

    return packages
  }

  /**
   * Tries to register a package from its directory.
   * @param dir - Directory to check.
   * @param packages - Map to register into.
   */
  private tryRegisterPackage(dir: string, packages: Map<string, string>): void {
    const pkgJsonPath = join(dir, 'package.json')
    if (!existsSync(pkgJsonPath)) return
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { name?: string }
      if (pkg.name) packages.set(pkg.name, dir)
    } catch {
      /* skip */
    }
  }

  /**
   * Resolves a relative import specifier to a file path.
   * @param fromFile - The importing file.
   * @param specifier - The relative specifier.
   * @returns The resolved file path.
   */
  private resolveImportPath(fromFile: string, specifier: string): string {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
    const parts = specifier.split('/')
    const segments = fromDir.split('/')

    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') segments.pop()
      else segments.push(part)
    }

    let resolved = segments.join('/')
    resolved = resolved.replace(/\.js$/, '.ts')
    if (!resolved.includes('.')) resolved += '.ts'
    return resolved
  }
}

/**
 * No-op progress callback used as default when no onProgress handler is provided.
 */
function noop(): void {
  // intentionally empty
}
