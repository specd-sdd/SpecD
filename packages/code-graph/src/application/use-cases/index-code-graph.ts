import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type GraphStore } from '../../domain/ports/graph-store.js'
import { createFileNode } from '../../domain/value-objects/file-node.js'
import { createRelation } from '../../domain/value-objects/relation.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { type IndexOptions } from '../../domain/value-objects/index-options.js'
import { type IndexResult, type IndexError } from '../../domain/value-objects/index-result.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { discoverFiles } from './discover-files.js'
import { discoverSpecs } from './discover-specs.js'
import { computeContentHash } from './compute-content-hash.js'

/**
 * Use case that indexes source files and specs into the code graph.
 * Discovers files, computes content hashes, extracts symbols and relations,
 * and persists them in the graph store.
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
   * @param options - Options controlling the indexing run (workspace path, etc.).
   * @returns A summary result with counts and any errors encountered.
   */
  async execute(options: IndexOptions): Promise<IndexResult> {
    const start = Date.now()
    const errors: IndexError[] = []
    const workspacePath = options.workspacePath

    const discoveredFiles = discoverFiles(
      workspacePath,
      (filePath) => this.registry.getAdapterForFile(filePath) !== undefined,
    )

    const existingFiles = await this.store.getAllFiles()
    const existingMap = new Map(existingFiles.map((f) => [f.path, f]))

    const fileHashes = new Map<string, string>()
    for (const relPath of discoveredFiles) {
      try {
        const content = readFileSync(join(workspacePath, relPath), 'utf-8')
        fileHashes.set(relPath, computeContentHash(content))
      } catch (err) {
        errors.push({ filePath: relPath, message: String(err) })
      }
    }

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
    let filesIndexed = 0

    // Phase 1: Extract symbols + DEFINES/EXPORTS
    for (const relPath of filesToProcess) {
      try {
        const content = readFileSync(join(workspacePath, relPath), 'utf-8')
        const adapter = this.registry.getAdapterForFile(relPath)
        if (!adapter) continue

        const language = this.registry.getLanguageForFile(relPath) ?? 'unknown'
        const hash = fileHashes.get(relPath) ?? computeContentHash(content)

        const symbols = adapter.extractSymbols(relPath, content)
        const relations = adapter.extractRelations(relPath, content, symbols, new Map())

        const definesAndExports = relations.filter(
          (r) => r.type === RelationType.Defines || r.type === RelationType.Exports,
        )

        const fileNode = createFileNode({
          path: relPath,
          language,
          contentHash: hash,
          workspace: workspacePath,
        })

        await this.store.upsertFile(fileNode, symbols, definesAndExports)
        filesIndexed++
      } catch (err) {
        errors.push({ filePath: relPath, message: String(err) })
      }
    }

    // Phase 2: Extract IMPORTS relations
    for (const relPath of filesToProcess) {
      try {
        const content = readFileSync(join(workspacePath, relPath), 'utf-8')
        const adapter = this.registry.getAdapterForFile(relPath)
        if (!adapter) continue

        const symbols = adapter.extractSymbols(relPath, content)
        const relations = adapter.extractRelations(relPath, content, symbols, new Map())

        const importRelations = relations.filter((r) => r.type === RelationType.Imports)
        if (importRelations.length === 0) continue

        const existingFile = await this.store.getFile(relPath)
        if (!existingFile) continue

        const existingSymbols = await this.store.findSymbols({ filePath: relPath })
        const allRelations = [
          ...importRelations,
          ...existingSymbols.map((s) =>
            createRelation({ source: relPath, target: s.id, type: RelationType.Defines }),
          ),
        ]

        // Check for EXPORTS
        const exportedRelations = relations.filter((r) => r.type === RelationType.Exports)
        allRelations.push(...exportedRelations)

        await this.store.upsertFile(existingFile, existingSymbols, allRelations)
      } catch (err) {
        errors.push({ filePath: relPath, message: `Phase 2: ${String(err)}` })
      }
    }

    // Remove deleted files
    let filesRemoved = 0
    for (const filePath of deletedFiles) {
      try {
        await this.store.removeFile(filePath)
        filesRemoved++
      } catch (err) {
        errors.push({ filePath, message: String(err) })
      }
    }

    // Spec indexing
    const discoveredSpecs = discoverSpecs(workspacePath)
    const existingSpecs = await this.store.getAllSpecs()
    let specsIndexed = 0

    for (const { spec } of discoveredSpecs) {
      try {
        const relations = spec.dependsOn.map((depId) =>
          createRelation({ source: spec.specId, target: depId, type: RelationType.DependsOn }),
        )
        await this.store.upsertSpec(spec, relations)
        specsIndexed++
      } catch (err) {
        errors.push({ filePath: spec.path, message: String(err) })
      }
    }

    // Remove deleted specs
    const discoveredSpecIds = new Set(discoveredSpecs.map((s) => s.spec.specId))
    for (const existing of existingSpecs) {
      if (!discoveredSpecIds.has(existing.specId)) {
        try {
          await this.store.removeSpec(existing.specId)
        } catch (err) {
          errors.push({ filePath: existing.path, message: String(err) })
        }
      }
    }

    const filesSkipped = discoveredFiles.length - filesToProcess.length

    return {
      filesDiscovered: discoveredFiles.length,
      filesIndexed,
      filesRemoved,
      filesSkipped,
      specsDiscovered: discoveredSpecs.length,
      specsIndexed,
      errors,
      duration: Date.now() - start,
    }
  }
}
