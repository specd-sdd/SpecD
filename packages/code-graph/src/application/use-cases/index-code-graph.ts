import { readFileSync, statSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { setImmediate } from 'node:timers'
import { performance } from 'node:perf_hooks'
import { type Spec, SpecPath, Logger } from '@specd/core'
import { type GraphStore, type ReferenceFactsWrite } from '../../domain/ports/graph-store.js'
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
  type IndexRunCoverageSummary,
  type WorkspaceIndexBreakdown,
} from '../../domain/value-objects/index-result.js'
import { type AdapterRegistryPort } from '../../domain/ports/adapter-registry-port.js'
import { type ResolvedImports } from '../../domain/value-objects/language-adapter.js'
import { mapWithConcurrency } from '../../domain/services/map-with-concurrency.js'
import {
  type IndexCoverage,
  IndexCoverageStatus,
  type IndexSession,
} from '../../domain/value-objects/index-session.js'
import {
  createPublicBinding,
  type LogicalSymbol,
  type PublicBinding,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
  type SymbolLookup,
} from '../../domain/services/index.js'
import { discoverFiles } from './discover-files.js'
import { computeContentHash } from './compute-content-hash.js'
import { InMemoryIndexSession } from './in-memory-index-session.js'
import {
  projectSpecCoverage,
  type PersistedImplementationLink,
} from '../services/project-spec-coverage.js'
import {
  computeWorkspaceFingerprint,
  computeRootFingerprint,
  parseFingerprintMap,
  serializeFingerprintMap,
  detectFingerprintMismatch,
} from './_shared/compute-graph-fingerprint.js'
import { resolveEffectiveGraphConfig } from './_shared/resolve-effective-graph-config.js'
import { readInstalledCodeGraphVersion } from './_shared/installed-code-graph-version.js'
import {
  IndexedInputKind,
  IndexedResourceKind,
  type IndexedInputObservation,
} from '../../domain/value-objects/indexed-input-freshness.js'

const DEFAULT_CHUNK_BYTES = 20 * 1024 * 1024

/** Ceiling for concurrent spec-artifact file reads during indexing. */
const ARTIFACT_READ_CONCURRENCY = 16

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

/** Canonical spec state prepared once for node, dependency, and coverage projection. */
interface PreparedSpecProjection {
  readonly specNode: SpecNode
  readonly dependsOn: readonly string[]
  readonly implementation: readonly PersistedImplementationLink[]
  readonly changed: boolean
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
 * Summarizes the complete index-coverage snapshot in stable status and reason order.
 * @param coverage - Complete per-input coverage snapshot staged by the run.
 * @returns Stable totals, status counts, and reason codes.
 */
function summarizeCoverage(coverage: readonly IndexCoverage[]): IndexRunCoverageSummary {
  const byStatus: Record<IndexCoverageStatus, number> = {
    [IndexCoverageStatus.Indexed]: 0,
    [IndexCoverageStatus.Excluded]: 0,
    [IndexCoverageStatus.Unsupported]: 0,
    [IndexCoverageStatus.ParseFailed]: 0,
    [IndexCoverageStatus.Partial]: 0,
  }
  const reasons = new Set<string>()
  for (const item of coverage) {
    byStatus[item.status]++
    if (item.reason !== undefined) reasons.add(item.reason)
  }
  return { total: coverage.length, byStatus, reasons: [...reasons].sort() }
}

/**
 * Retains the complete reference-fact subgraph whose owning files are unchanged.
 * @param facts - Persisted semantic snapshot.
 * @param replacedPaths - Changed, dependent, or deleted file paths.
 * @returns Snapshot safe to hydrate before re-extracting replaced paths.
 */
function retainReferenceFactsOutsidePaths(
  facts: ReferenceFactsWrite,
  replacedPaths: ReadonlySet<string>,
): ReferenceFactsWrite {
  const declarations = facts.declarations.filter(
    (item) => !replacedPaths.has(item.declaration.location.filePath),
  )
  const logicalIds = new Set(declarations.map((item) => item.logicalSymbolId))
  const logicalSymbols = facts.logicalSymbols.filter((symbol) => logicalIds.has(symbol.id))
  const publicBindings = facts.publicBindings.filter(
    (binding) =>
      !replacedPaths.has(binding.surface) &&
      (binding.targetId === undefined || logicalIds.has(binding.targetId)),
  )
  const localBindings = facts.localBindings.filter(
    (binding) =>
      !replacedPaths.has(binding.filePath) &&
      (binding.targetId === undefined || logicalIds.has(binding.targetId)),
  )
  const retainedIds = new Set([
    ...logicalIds,
    ...publicBindings.map((binding) => binding.id),
    ...localBindings.map((binding) => binding.id),
  ])
  return {
    logicalSymbols,
    declarations,
    publicBindings,
    localBindings,
    steps: facts.steps.filter((step) => retainedIds.has(step.fromId) && retainedIds.has(step.toId)),
    coverage: facts.coverage.filter((coverage) => !replacedPaths.has(coverage.filePath)),
  }
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

/** TypeScript re-export metadata retained by the adapter for pass-2 linking. */
interface TypeScriptReExport {
  readonly specifier: string
  readonly importedName: string
  readonly exportedName: string
}

/** Minimal parser-state shape needed to link TypeScript re-exports. */
interface TypeScriptReExportState {
  readonly kind: 'typescript'
  readonly reExports?: readonly TypeScriptReExport[]
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
   * Links TypeScript named and star re-exports after every declaration is available.
   * @param session - Completed pass-1 indexing session.
   * @returns Resolved public bindings and their provenance steps.
   */
  private linkTypeScriptReExports(session: InMemoryIndexSession): {
    publicBindings: readonly PublicBinding[]
    steps: readonly ResolutionStep[]
    relations: readonly Relation[]
  } {
    const logicalSymbols = session.getLogicalSymbols()
    const logicalById = new Map(logicalSymbols.map((symbol) => [symbol.id, symbol]))
    const logicalIdByDeclaration = new Map<string, string>()
    for (const [logicalId, declarations] of session.getDeclarationsByLogicalId()) {
      for (const declaration of declarations) {
        logicalIdByDeclaration.set(declaration.symbolId, logicalId)
      }
    }

    const bindingsById = new Map(
      session.getPublicBindings().map((binding) => [binding.id, binding]),
    )
    const bindingsBySurface = new Map<string, Map<string, PublicBinding>>()
    const bindingsByRoute = new Map<string, Map<string, PublicBinding>>()
    const routeKey = (surface: string, exportedName: string): string =>
      `${surface}\u0000${exportedName}`
    const indexBinding = (binding: PublicBinding): void => {
      bindingsById.set(binding.id, binding)
      const surfaceBindings =
        bindingsBySurface.get(binding.surface) ?? new Map<string, PublicBinding>()
      surfaceBindings.set(binding.id, binding)
      bindingsBySurface.set(binding.surface, surfaceBindings)
      const routeBindings =
        bindingsByRoute.get(routeKey(binding.surface, binding.exportedName)) ??
        new Map<string, PublicBinding>()
      routeBindings.set(binding.id, binding)
      bindingsByRoute.set(routeKey(binding.surface, binding.exportedName), routeBindings)
    }
    const replaceUnresolvedRoute = (binding: PublicBinding): void => {
      const key = routeKey(binding.surface, binding.exportedName)
      const routeBindings = bindingsByRoute.get(key)
      if (routeBindings !== undefined) {
        for (const [bindingId, candidate] of routeBindings) {
          if (
            candidate.space !== binding.space ||
            candidate.targetId !== undefined ||
            bindingId === binding.id
          ) {
            continue
          }
          bindingsById.delete(bindingId)
          bindingsBySurface.get(candidate.surface)?.delete(bindingId)
          routeBindings.delete(bindingId)
        }
      }
      indexBinding(binding)
    }
    for (const binding of bindingsById.values()) indexBinding(binding)

    const stepsByKey = new Map(
      session
        .getResolutionSteps()
        .map((step) => [JSON.stringify([step.fromId, step.toId, step.kind]), step]),
    )

    const maxPasses = Math.max(session.getAllFilePaths().size, 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false
      for (const filePath of session.getAllFilePaths()) {
        const analysis = session.getAnalysis(filePath)
        const state = analysis?.parserState as TypeScriptReExportState | undefined
        if (state?.kind !== 'typescript' || !state.reExports?.length) continue

        const relPath = filePath.substring(filePath.indexOf(':') + 1)
        const adapter = this.registry.getAdapterForFile(relPath)
        if (!adapter?.resolveRelativeImportPath) continue

        for (const reExport of state.reExports) {
          const resolved = adapter.resolveRelativeImportPath(filePath, reExport.specifier)
          const candidates = Array.isArray(resolved) ? resolved : [resolved]
          const sourcePath = candidates.find(
            (candidate) => session.getFileId(candidate) !== undefined,
          )
          if (!sourcePath) continue

          const sourceBindings = [...(bindingsBySurface.get(sourcePath)?.values() ?? [])].filter(
            (binding) => binding.targetId !== undefined && logicalById.has(binding.targetId),
          )
          const routes =
            reExport.importedName === '*'
              ? sourceBindings.filter((binding) => binding.exportedName !== 'default')
              : [
                  ...(bindingsByRoute.get(routeKey(sourcePath, reExport.importedName))?.values() ??
                    []),
                ].filter(
                  (binding) => binding.targetId !== undefined && logicalById.has(binding.targetId),
                )

          for (const route of routes) {
            const exportedName =
              reExport.exportedName === '*' ? route.exportedName : reExport.exportedName
            const binding = createPublicBinding({
              surface: filePath,
              exportedName,
              space: route.space,
              targetId: route.targetId,
            })
            const previous = bindingsById.get(binding.id)
            if (previous?.targetId !== binding.targetId) changed = true
            replaceUnresolvedRoute(binding)
            const step: ResolutionStep = {
              fromId: binding.id,
              toId: route.targetId!,
              kind: reExport.importedName === '*' ? 're-export:star' : 're-export:named',
            }
            stepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
          }

          if (reExport.importedName !== '*' && routes.length === 0) {
            const target = session
              .findSymbolsByFile(sourcePath)
              .find((symbol) => symbol.name === reExport.importedName)
            const logicalId = target && logicalIdByDeclaration.get(target.id)
            const logical: LogicalSymbol | undefined =
              logicalId === undefined ? undefined : logicalById.get(logicalId)
            if (!logical) continue
            const binding = createPublicBinding({
              surface: filePath,
              exportedName: reExport.exportedName,
              space: logical.space,
              targetId: logical.id,
            })
            const previous = bindingsById.get(binding.id)
            if (previous?.targetId !== binding.targetId) changed = true
            replaceUnresolvedRoute(binding)
            const step: ResolutionStep = {
              fromId: binding.id,
              toId: logical.id,
              kind: 're-export:named',
            }
            stepsByKey.set(JSON.stringify([step.fromId, step.toId, step.kind]), step)
          }
        }
      }
      if (!changed) break
    }

    const publicBindings = [...bindingsById.values()]
    const relations: Relation[] = []
    for (const filePath of session.getAllFilePaths()) {
      const analysis = session.getAnalysis(filePath)
      if (!analysis) continue
      const relPath = filePath.substring(filePath.indexOf(':') + 1)
      const adapter = this.registry.getAdapterForFile(relPath)
      if (!adapter?.resolveRelativeImportPath) continue
      const importsByLocalName = new Map(
        analysis.imports.filter((item) => item.isRelative).map((item) => [item.localName, item]),
      )
      const symbolsById = new Map(analysis.symbols.map((symbol) => [symbol.id, symbol]))
      const symbolsByDescendingLine = [...analysis.symbols].sort(
        (left, right) => right.line - left.line,
      )
      for (const call of analysis.callFacts) {
        const imported = importsByLocalName.get(call.targetName ?? call.name)
        if (!imported) continue
        const resolved = adapter.resolveRelativeImportPath(filePath, imported.specifier)
        const candidates = Array.isArray(resolved) ? resolved : [resolved]
        const surface = candidates.find((candidate) => session.getFileId(candidate) !== undefined)
        const binding =
          surface === undefined
            ? undefined
            : [
                ...(bindingsByRoute.get(routeKey(surface, imported.originalName))?.values() ?? []),
              ].find((candidate) => candidate.targetId !== undefined)
        const source =
          (call.callerSymbolId && symbolsById.get(call.callerSymbolId)) ??
          symbolsByDescendingLine.find((symbol) => symbol.line <= call.location.line)
        if (!binding || !source) continue
        relations.push(
          createRelation({
            source: source.id,
            target: binding.id,
            type: call.form === 'constructor' ? RelationType.Constructs : RelationType.Calls,
            metadata: {
              reason: 'public binding route',
              line: call.location.line,
              column: call.location.column,
            },
          }),
        )
      }
    }

    return {
      publicBindings,
      steps: [...stepsByKey.values()],
      relations,
    }
  }

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
    const start = performance.now()
    const errors: IndexError[] = []
    const phaseMetrics = {
      importResolution: { count: 0, durationMs: 0 },
      dependencyFacts: { count: 0, durationMs: 0 },
      adapterRelations: { count: 0, durationMs: 0 },
      reexports: { count: 0, durationMs: 0 },
      hierarchyOverrides: { count: 0, durationMs: 0 },
      persistence: { count: 0, durationMs: 0 },
      searchIndexRebuild: { count: 0, durationMs: 0 },
    }
    const onProgress = options.onProgress ?? noop
    const chunkBudget = options.chunkBytes ?? DEFAULT_CHUNK_BYTES
    const runId = `index-stage-${Date.now()}`
    const stageDir = makeStageDir(this.store.storagePath, runId)
    try {
      const progress = (pct: number, phase: string, detail?: string): void => {
        onProgress(Math.min(pct, 100), detail ? `${phase} — ${detail}` : phase)
      }

      // ── Discovery (0-5%) ──
      const discoveryStart = performance.now()
      progress(0, 'Discovering files')
      const allDiscoveredPaths: string[] = []
      const fileHashes = new Map<string, string>()
      const coverageByFilePath = new Map<string, IndexCoverage>()
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
          vcsRoot: options.vcsRoot,
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
          vcsRoot: options.vcsRoot,
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
      const indexedResourceKinds = new Map<string, IndexedResourceKind>()
      for (const file of existingFiles) {
        existingArtifactHashes.set(file.path, file.contentHash)
        indexedResourceKinds.set(file.path, IndexedResourceKind.File)
      }
      for (const document of existingDocuments) {
        existingArtifactHashes.set(document.path, document.contentHash)
        indexedResourceKinds.set(document.path, IndexedResourceKind.Document)
      }
      const existingCoverage = await this.store.findIndexCoverage(allDiscoveredPaths)
      for (const coverage of existingCoverage) {
        coverageByFilePath.set(coverage.filePath, coverage)
        if (coverage.contentHash !== undefined && !existingArtifactHashes.has(coverage.filePath)) {
          existingArtifactHashes.set(coverage.filePath, coverage.contentHash)
        }
      }

      // ── Fingerprint comparison ──
      const version = options.codeGraphVersion ?? readInstalledCodeGraphVersion()
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

      let fullRebuildReason: string | null =
        options.force === true ? 'Forced logical graph reindex requested by indexing' : null
      let fullRebuild = options.force === true
      const newFiles: string[] = []
      const changedFiles: string[] = []
      const deletedFiles: string[] = []
      const skippedFiles: string[] = []
      const fingerprintInvalidatedPaths = new Set<string>()

      if (options.force === true || fingerprintMismatch) {
        fullRebuild = true
        if (options.force === true) {
          progress(5, 'Forced reindex', 'Reconsidering every selected input')
        } else {
          fullRebuildReason =
            'Graph derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index'
          progress(5, 'Fingerprint mismatch', 'Forcing re-index of mismatched workspaces')
          // Remove all files from mismatched workspaces so they get re-processed
          // but do NOT recreate the store — other workspaces are unaffected
          for (const ef of [...existingFiles, ...existingDocuments]) {
            const storedFp = storedFingerprintMap.get(ef.workspace)
            const currentFp = currentFingerprintMap.get(ef.workspace)
            if (storedFp !== undefined && currentFp !== undefined && storedFp !== currentFp) {
              fingerprintInvalidatedPaths.add(ef.path)
            }
          }
        }
        // A forced or fingerprint-invalidated run never permits retained state to skip input.
        newFiles.push(...allDiscoveredPaths)
      } else {
        const observationResources = [
          ...existingFiles.map((file) => ({
            workspace: file.workspace,
            resourceKind: IndexedResourceKind.File,
            resourceId: file.path,
          })),
          ...existingDocuments.map((document) => ({
            workspace: document.workspace,
            resourceKind: IndexedResourceKind.Document,
            resourceId: document.path,
          })),
        ]
        const observationByResource = new Map<string, IndexedInputObservation>()
        try {
          for (const observation of await this.store.getIndexedInputObservations(
            observationResources,
          )) {
            if (observation.inputKind === IndexedInputKind.Filesystem && !observation.stale) {
              observationByResource.set(observation.resourceId, observation)
            }
          }
        } catch {
          // Stores without observation support retain content-hash diff behavior.
        }

        // Reuse indexed hashes when filesystem stamps match; hash only changed stamps
        // and targets (such as non-text coverage) without a persisted observation.
        progress(2, 'Checking files', `${String(allDiscoveredPaths.length)} files`)
        for (let i = 0; i < allDiscoveredPaths.length; i++) {
          const prefixedPath = allDiscoveredPaths[i]!
          const absPath = absolutePaths.get(prefixedPath)!
          try {
            const observation = observationByResource.get(prefixedPath)
            const existingHash = existingArtifactHashes.get(prefixedPath)
            const stat = statSync(absPath)
            if (
              observation !== undefined &&
              existingHash !== undefined &&
              observation.indexedContentHash === existingHash &&
              observation.lastObservedMtime === stat.mtimeMs &&
              observation.lastObservedSize === stat.size
            ) {
              fileHashes.set(prefixedPath, existingHash)
            } else {
              fileHashes.set(prefixedPath, computeContentHash(readFileSync(absPath, 'utf-8')))
            }
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
          }
          if (i % 200 === 0) {
            progress(
              2 + Math.round((i / allDiscoveredPaths.length) * 3),
              'Checking files',
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
        const existingPaths = new Set([
          ...existingFiles.map((existing) => existing.path),
          ...existingDocuments.map((existing) => existing.path),
          ...existingCoverage.map((coverage) => coverage.filePath),
        ])
        for (const existingPath of existingPaths) {
          const workspace = existingPath.slice(0, existingPath.indexOf(':'))
          if (!discoveredSet.has(existingPath) && indexedWorkspaceNames.has(workspace)) {
            deletedFiles.push(existingPath)
          }
        }
      }

      const semanticRefreshRequired =
        existingCoverage.length > 0 &&
        (newFiles.length > 0 || changedFiles.length > 0 || deletedFiles.length > 0)
      let persistedReferenceFacts = semanticRefreshRequired
        ? await this.store.getAllReferenceFacts()
        : undefined
      // Native stores enforce relation endpoint integrity, so an import whose target did not
      // exist at the previous generation cannot be recovered from persisted relations alone.
      // Reconsider every existing code file only when additions may satisfy such imports.
      const additionCandidates =
        newFiles.length === 0 ? [] : existingFiles.map((existing) => existing.path)
      const affectedClosure =
        persistedReferenceFacts === undefined
          ? new Set<string>()
          : await this.collectAffectedFileClosure(
              [...newFiles, ...changedFiles, ...deletedFiles, ...additionCandidates],
              new Set(allDiscoveredPaths),
              persistedReferenceFacts,
            )
      const filesToReprocess = [...affectedClosure].filter(
        (filePath) =>
          !newFiles.includes(filePath) &&
          !changedFiles.includes(filePath) &&
          !deletedFiles.includes(filePath),
      )
      const filesToProcess = [...new Set([...newFiles, ...changedFiles, ...filesToReprocess])]
      const contentChangedPaths = new Set([...newFiles, ...changedFiles])
      // ── Cleanup (6%) ──
      const toRemove = [
        ...new Set([
          ...fingerprintInvalidatedPaths,
          ...deletedFiles,
          ...changedFiles,
          ...filesToReprocess,
        ]),
      ]
      const deletedSet = new Set(deletedFiles)
      progress(6, 'Cleaning up', `${String(toRemove.length)} to remove`)
      let filesRemovedCount = 0
      for (const filePath of toRemove) {
        if (deletedSet.has(filePath)) {
          filesRemovedCount++
          const wsName = filePath.substring(0, filePath.indexOf(':'))
          const breakdown = wsBreakdowns.get(wsName)
          if (breakdown) breakdown.filesRemoved++
        }
      }
      Logger.debug(
        `[IndexCodeGraph] Discovery took ${Math.round(performance.now() - discoveryStart)}ms`,
      )

      // ── Pass 1: Extract symbols (7-50%) ──
      Logger.debug('[IndexCodeGraph] Code Indexing Phase 1 (analyze/register) started')
      const pass1Start = performance.now()
      const fileTuples: Array<[string, string]> = filesToProcess.map((p) => [
        p,
        absolutePaths.get(p)!,
      ])
      const chunks = groupIntoChunks(fileTuples, chunkBudget)
      const totalToProcess = filesToProcess.length
      let filesIndexed = 0
      let documentsIndexed = 0
      const session = new InMemoryIndexSession()
      if (persistedReferenceFacts !== undefined) {
        const replacedPaths = new Set([...filesToProcess, ...deletedFiles])
        const retainedFiles = existingFiles.filter((file) => !replacedPaths.has(file.path))
        const retainedSymbols = await this.store.findSymbols({
          filePaths: retainedFiles.map((file) => file.path),
        })
        const symbolsByFile = new Map<string, SymbolNode[]>()
        for (const symbol of retainedSymbols) {
          const symbols = symbolsByFile.get(symbol.filePath) ?? []
          symbols.push(symbol)
          symbolsByFile.set(symbol.filePath, symbols)
        }
        for (const file of retainedFiles) {
          session.hydratePersistedFile(file, symbolsByFile.get(file.path) ?? [])
        }
        session.hydrateReferenceFacts(
          retainReferenceFactsOutsidePaths(persistedReferenceFacts, replacedPaths),
        )
      }

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
      const seenOverrideKeys = new Set<string>()
      const hierarchyTargetsByType = new Map<string, Set<string>>()

      progress(7, 'Analyzing files')

      let processed = 0
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkFiles: FileNode[] = []
        const chunkDocuments: DocumentNode[] = []
        const chunkSymbols: SymbolNode[] = []
        for (const [prefixedPath, absPath] of chunk) {
          processed++
          if (processed % 50 === 0 || processed === 1) {
            progress(
              7 + Math.round((processed / Math.max(totalToProcess, 1)) * 43),
              'Analyzing files',
              `${String(processed)}/${String(totalToProcess)}`,
            )
          }
          try {
            Logger.debug(`[IndexCodeGraph] Start processing file ${processed}: ${prefixedPath}`)
            const fileStart = performance.now()
            const contentBuffer = readFileSync(absPath)
            const decodedContent = decodeTextualContent(contentBuffer)
            // Use the relative-to-codeRoot path for adapter matching (extension-based)
            const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
            const adapter = this.registry.getAdapterForFile(relPath)
            if (!adapter) {
              if (decodedContent === null) {
                coverageByFilePath.set(prefixedPath, {
                  filePath: prefixedPath,
                  contentHash: fileHashes.get(prefixedPath),
                  status: IndexCoverageStatus.Unsupported,
                  reason: 'non-text-content',
                  capabilities: [],
                })
                const elapsed = performance.now() - fileStart
                if (elapsed > 500) {
                  Logger.debug(
                    `[IndexCodeGraph] File processing took ${Math.round(elapsed)}ms: ${prefixedPath} (skipped/binary)`,
                  )
                }
                continue
              }
              const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
              const hash = fileHashes.get(prefixedPath) ?? computeContentHash(decodedContent)
              const document = createDocumentNode({
                path: prefixedPath,
                configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
                contentHash: hash,
                content: decodedContent,
                workspace: wsName,
              })
              chunkDocuments.push(document)
              indexedResourceKinds.set(prefixedPath, IndexedResourceKind.Document)
              session.registerDocument(document)
              coverageByFilePath.set(prefixedPath, {
                filePath: prefixedPath,
                contentHash: hash,
                status: IndexCoverageStatus.Unsupported,
                reason: 'no-language-adapter',
                capabilities: [],
              })
              if (contentChangedPaths.has(prefixedPath)) {
                documentsIndexed++
                const breakdown = wsBreakdowns.get(wsName)
                if (breakdown) {
                  breakdown.filesIndexed++
                  breakdown.documentsIndexed++
                }
              }
              const elapsed = performance.now() - fileStart
              if (elapsed > 500) {
                Logger.debug(
                  `[IndexCodeGraph] File processing took ${Math.round(elapsed)}ms: ${prefixedPath} (document)`,
                )
              }
              continue
            }

            const language = this.registry.getLanguageForFile(relPath) ?? 'unknown'
            const content = contentBuffer.toString('utf-8')
            const hash = fileHashes.get(prefixedPath) ?? computeContentHash(content)
            const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
            const ws = options.workspaces.find((w) => w.name === wsName)

            const draft = adapter.analyzeFile(prefixedPath, content, {
              session,
              workspaceName: wsName,
              ...(ws?.codeRoot !== undefined ? { codeRoot: ws.codeRoot } : {}),
              repoRoot: options.projectRoot,
            })

            const symbols = this.assignParentIds(draft.symbols, language)
            const finalDraft = { ...draft, symbols }

            session.registerFile({
              filePath: prefixedPath,
              configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
              language,
              contentHash: hash,
              workspace: wsName,
            })

            session.registerAnalysis({
              filePath: prefixedPath,
              analysis: finalDraft,
            })
            const capabilities = finalDraft.referenceFacts?.capabilities ?? adapter.capabilities?.()
            const enabledCapabilities =
              capabilities === undefined
                ? []
                : Object.entries(capabilities)
                    .filter(([, enabled]) => enabled)
                    .map(([capability]) => capability)
                    .sort()
            coverageByFilePath.set(prefixedPath, {
              filePath: prefixedPath,
              contentHash: hash,
              status:
                finalDraft.referenceFacts === undefined
                  ? IndexCoverageStatus.Partial
                  : IndexCoverageStatus.Indexed,
              reason:
                finalDraft.referenceFacts === undefined ? 'reference-facts-unavailable' : undefined,
              capabilities: enabledCapabilities,
            })

            chunkFiles.push(
              createFileNode({
                path: prefixedPath,
                configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
                language,
                contentHash: hash,
                workspace: wsName,
                content,
              }),
            )
            indexedResourceKinds.set(prefixedPath, IndexedResourceKind.File)
            fileLanguages.set(prefixedPath, language)
            chunkSymbols.push(...symbols)
            if (contentChangedPaths.has(prefixedPath)) {
              filesIndexed++
              const breakdown = wsBreakdowns.get(wsName)
              if (breakdown) breakdown.filesIndexed++
            }

            const elapsed = performance.now() - fileStart
            if (elapsed > 500) {
              Logger.debug(
                `[IndexCodeGraph] File processing took ${Math.round(elapsed)}ms: ${prefixedPath} (${language})`,
              )
            }
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
            coverageByFilePath.set(prefixedPath, {
              filePath: prefixedPath,
              contentHash: fileHashes.get(prefixedPath),
              status: IndexCoverageStatus.ParseFailed,
              reason: 'analysis-failed',
              capabilities: [],
            })
          }

          if (processed % 50 === 0) {
            Logger.debug(`[IndexCodeGraph] Yielding event loop at ${processed} files`)
            await new Promise<void>((resolve) => setImmediate(resolve))
            Logger.debug(`[IndexCodeGraph] Resuming from event loop yield at ${processed} files`)
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
      // Populate session with existing symbols from unchanged files
      const processedPaths = new Set(filesToProcess)
      for (const prefixedPath of allDiscoveredPaths) {
        if (processedPaths.has(prefixedPath)) continue
        const existing = await this.store.findSymbols({ filePath: prefixedPath })
        if (existing.length > 0) {
          session.registerFile({
            filePath: prefixedPath,
            configRelativePath: configRelativePaths.get(prefixedPath) ?? '',
            language: fileLanguages.get(prefixedPath) ?? 'unknown',
            contentHash: existingArtifactHashes.get(prefixedPath) ?? '',
            workspace: prefixedPath.substring(0, prefixedPath.indexOf(':')),
          })
          session.registerAnalysis({
            filePath: prefixedPath,
            analysis: {
              language: fileLanguages.get(prefixedPath) ?? 'unknown',
              symbols: existing,
              imports: [],
              bindingFacts: [],
              callFacts: [],
            },
          })
        }
      }

      Logger.debug(
        `[IndexCodeGraph] Code Indexing Phase 1 (analyze/register) completed in ${Math.round(performance.now() - pass1Start)}ms`,
      )

      Logger.debug('[IndexCodeGraph] Code Indexing Phase 2 (resolve/build) started')
      const pass2Start = performance.now()
      progress(50, 'Resolving imports')

      const ownershipIndex = this.buildMethodOwnershipIndex(session)
      const symbolLookup: SymbolLookup = {
        findByName: (name, filePrefix) => session.findSymbolsByName(name, filePrefix),
        findByFile: (filePath) => session.findSymbolsByFile(filePath),
      }

      // ── Pass 2: Resolve imports + extract relations (50-80%) ──
      let resolvedImportsProcessed = 0
      let relationsProcessed = 0
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const chunkRelations: Relation[] = []
        const resolvedImportsMap = new Map<string, ResolvedImports>()

        // 1. Resolve imports first for all files in this chunk
        const importResolutionStart = performance.now()
        for (const [prefixedPath] of chunk) {
          resolvedImportsProcessed++
          if (resolvedImportsProcessed % 50 === 0 || resolvedImportsProcessed === 1) {
            progress(
              50 + Math.round((resolvedImportsProcessed / Math.max(totalToProcess, 1)) * 15),
              'Resolving imports',
              `${String(resolvedImportsProcessed)}/${String(totalToProcess)}`,
            )
          }
          try {
            const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
            const adapter = this.registry.getAdapterForFile(relPath)
            if (!adapter) continue

            const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
            const ws = options.workspaces.find((w) => w.name === wsName)

            const analysis = session.getAnalysis(prefixedPath)
            if (!analysis) continue

            const resolvedImports = adapter.resolveImports(analysis, {
              session,
              qualifiedNames: session.getQualifiedNames(),
              packageToWorkspace,
              ...(ws?.codeRoot !== undefined ? { codeRoot: ws.codeRoot } : {}),
              repoRoot: options.projectRoot,
            })
            resolvedImportsMap.set(prefixedPath, resolvedImports)
            phaseMetrics.importResolution.count += resolvedImports.fileImports.length
          } catch (err) {
            errors.push({ filePath: prefixedPath, message: String(err) })
          }
        }
        phaseMetrics.importResolution.durationMs += performance.now() - importResolutionStart

        // 2. Build relations from stored facts plus session lookups
        for (const [prefixedPath] of chunk) {
          relationsProcessed++
          if (relationsProcessed % 50 === 0 || relationsProcessed === 1) {
            progress(
              65 + Math.round((relationsProcessed / Math.max(totalToProcess, 1)) * 15),
              'Building relations',
              `${String(relationsProcessed)}/${String(totalToProcess)}`,
            )
          }
          try {
            const relPath = prefixedPath.substring(prefixedPath.indexOf(':') + 1)
            const adapter = this.registry.getAdapterForFile(relPath)
            if (!adapter) continue

            const wsName = prefixedPath.substring(0, prefixedPath.indexOf(':'))
            const ws = options.workspaces.find((w) => w.name === wsName)

            const analysis = session.getAnalysis(prefixedPath)
            if (!analysis) continue

            const resolvedImports = resolvedImportsMap.get(prefixedPath)
            if (!resolvedImports) continue

            const dependencyStart = performance.now()
            const scopedEnvironment = buildScopedBindingEnvironment({
              analysis,
              importMap: resolvedImports.importMap,
              symbolLookup,
            })
            const resolvedDependencies = resolveDependencyFacts({
              environment: scopedEnvironment,
              analysis,
              symbolLookup,
            })
            phaseMetrics.dependencyFacts.durationMs += performance.now() - dependencyStart
            phaseMetrics.dependencyFacts.count += resolvedDependencies.length
            const adapterRelationsStart = performance.now()
            const relations = adapter.buildRelations(analysis, {
              session,
              resolvedImports,
              ...(ws?.codeRoot !== undefined ? { codeRoot: ws.codeRoot } : {}),
              repoRoot: options.projectRoot,
            })
            phaseMetrics.adapterRelations.durationMs += performance.now() - adapterRelationsStart
            phaseMetrics.adapterRelations.count += relations.length

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
            for (const targetPath of resolvedImports.fileImports) {
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
          if (relation.type === RelationType.Extends || relation.type === RelationType.Implements) {
            const targets = hierarchyTargetsByType.get(relation.source) ?? new Set<string>()
            targets.add(relation.target)
            hierarchyTargetsByType.set(relation.source, targets)
          }
        }
        const stageFile = `pass2-${String(chunkIndex).padStart(5, '0')}.json`
        const uniqueRelations = deduplicateRelations(chunkRelations)
        writeStageChunk(stageDir, stageFile, { relations: uniqueRelations })
        pass2ChunkFiles.push(stageFile)
        stagedRelationCount += uniqueRelations.length
      }
      Logger.debug(
        `[IndexCodeGraph] Code Indexing Phase 2 (resolve/build) completed in ${Math.round(performance.now() - pass2Start)}ms`,
      )
      Logger.debug(
        `[IndexCodeGraph] Heap used after Pass 2: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      )

      // ── Specs (80-83%) ──
      const specsStart = performance.now()
      let specCleanupDuration = 0
      let specGetAllSpecsDuration = 0
      let specListDuration = 0
      let specArtifactReadDuration = 0
      let specMetadataReadDuration = 0

      progress(80, 'Discovering specs')
      let totalSpecsToProcess = 0

      let specsProcessed = 0
      let specsIndexed = 0
      const allSpecs: SpecNode[] = []
      const specObservations: IndexedInputObservation[] = []
      const specDependencyRelations: Relation[] = []
      const preparedSpecs: PreparedSpecProjection[] = []
      const obsoleteSpecIds = new Set<string>()

      const getAllSpecsStart = performance.now()
      const existingSpecs = await this.store.getAllSpecs()
      const existingSpecMap = new Map(existingSpecs.map((s) => [s.specId, s]))
      specGetAllSpecsDuration = performance.now() - getAllSpecsStart

      // 1. Discovery & Global ID set (for relation resolution)
      const knownSpecIds = new Set(existingSpecs.map((s) => s.specId))
      const specsByWorkspace = new Map<string, Spec[]>()

      const listStart = performance.now()
      for (const ws of options.workspaces) {
        Logger.debug(`[IndexCodeGraph] listing specs in: ${ws.specRepo.specsPath}`)
        const listed = await ws.specRepo.list(undefined)
        const repoSpecs: Spec[] = []
        for (const entry of listed.items) {
          const spec = await ws.specRepo.get(SpecPath.parse(entry.path))
          if (spec !== null) repoSpecs.push(spec)
        }
        specsByWorkspace.set(ws.name, repoSpecs)
        totalSpecsToProcess += repoSpecs.length

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
      specListDuration = performance.now() - listStart

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

            // Resolve and sort content artifacts (exclude sidecars)
            const contentFilenames = repoSpec.filenames
              .filter((f) => !f.startsWith('.') && f !== 'spec-lock.json' && f !== 'metadata.json')
              .sort((a, b) => {
                if (a === 'spec.md') return -1
                if (b === 'spec.md') return 1
                return a.localeCompare(b)
              })

            const artifactStart = performance.now()
            const artifacts = await mapWithConcurrency(
              contentFilenames,
              ARTIFACT_READ_CONCURRENCY,
              (f) => ws.specRepo.artifact(repoSpec, f),
            )
            specArtifactReadDuration += performance.now() - artifactStart

            let content = ''
            for (const artifact of artifacts) {
              if (artifact?.content) {
                content += artifact.content + '\n'
              }
            }

            const metadataStart = performance.now()
            let title = repoSpec.name.toString()
            let description = ''
            let optimizedDescription: string | undefined
            let metadataFingerprint = computeContentHash(content)

            if (options.getSpecMetadata !== undefined) {
              const materialized = await options.getSpecMetadata.execute({ specId })
              title = materialized.metadata.title ?? title
              description =
                materialized.metadata.optimizedDescription ||
                materialized.metadata.description ||
                ''
              optimizedDescription = materialized.metadata.optimizedDescription
              metadataFingerprint = materialized.metadataFingerprint
            } else {
              const snapshot = await ws.specRepo.readMetadataSnapshot(repoSpec)
              if (snapshot.kind === 'present') {
                title = snapshot.metadata.title ?? title
                description =
                  snapshot.metadata.optimizedDescription || snapshot.metadata.description || ''
                optimizedDescription = snapshot.metadata.optimizedDescription
              }
            }

            if (ws.specRepo.specsPath !== undefined) {
              const specName = repoSpec.name.toString()
              const repositorySpecName =
                ws.prefix !== null && specName.startsWith(`${ws.prefix}/`)
                  ? specName.slice(ws.prefix.length + 1)
                  : specName
              for (const filename of repoSpec.filenames) {
                const absoluteInput = join(ws.specRepo.specsPath, repositorySpecName, filename)
                if (!existsSync(absoluteInput)) continue
                const inputLocator = relative(options.projectRoot, absoluteInput).replaceAll(
                  '\\',
                  '/',
                )
                if (inputLocator === '..' || inputLocator.startsWith('../')) continue
                const inputStat = statSync(absoluteInput)
                specObservations.push({
                  workspace: ws.name,
                  resourceKind: IndexedResourceKind.Spec,
                  resourceId: specId,
                  inputKind: IndexedInputKind.Filesystem,
                  inputLocator,
                  indexedContentHash: computeContentHash(readFileSync(absoluteInput, 'utf8')),
                  lastObservedMtime: inputStat.mtimeMs,
                  lastObservedSize: inputStat.size,
                  generation: serializeFingerprintMap(currentFingerprintMap),
                  stale: false,
                })
              }
            }

            const persisted = await ws.specRepo.readPersistedState(repoSpec)
            const dependsOn = persisted?.dependsOn ?? []
            const implementation = persisted?.implementation ?? []
            const persistedStateObservation = await this.store
              .getIndexedInputObservations([
                {
                  workspace: ws.name,
                  resourceKind: IndexedResourceKind.Spec,
                  resourceId: specId,
                },
              ])
              .then((observations) =>
                observations.find((observation) =>
                  observation.inputLocator.endsWith('/spec-lock.json'),
                ),
              )
              .catch(() => undefined)
            specMetadataReadDuration += performance.now() - metadataStart

            const specNode = createSpecNode({
              specId,
              path: repoSpec.name.toString(),
              title,
              description,
              contentHash: metadataFingerprint,
              content,
              workspace: ws.name,
              optimizedDescription,
            })
            const persistedStateChanged =
              persistedStateObservation?.indexedContentHash !== persisted?.originalHash
            const changed = existing?.contentHash !== metadataFingerprint || persistedStateChanged
            preparedSpecs.push({ specNode, dependsOn, implementation, changed })

            if (!fullRebuild && !changed) {
              if (wsBreakdown) wsBreakdown.specsIndexed++
              continue
            }

            if (existing) {
              specIdsToRemove.push(specId)
            }

            // Create relations
            for (const depId of dependsOn) {
              if (knownSpecIds.has(depId)) {
                specDependencyRelations.push(
                  createRelation({
                    source: specId,
                    target: depId,
                    type: RelationType.DependsOn,
                  }),
                )
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
          const cleanupStart = performance.now()
          for (const specId of specIdsToRemove) obsoleteSpecIds.add(specId)
          specCleanupDuration += performance.now() - cleanupStart
        }
      }

      progress(83, 'Indexing specs', `${String(specsProcessed)}/${String(totalSpecsToProcess)}`)

      const coverageProjectionRequired =
        fullRebuild ||
        semanticRefreshRequired ||
        preparedSpecs.some((prepared) => prepared.changed) ||
        existingCoverage.length === 0
      if (coverageProjectionRequired && persistedReferenceFacts === undefined) {
        persistedReferenceFacts = await this.store.getAllReferenceFacts()
        const replacedPaths = new Set([...filesToProcess, ...deletedFiles])
        const retainedFiles = existingFiles.filter((file) => !replacedPaths.has(file.path))
        const retainedSymbols = await this.store.findSymbols({
          filePaths: retainedFiles.map((file) => file.path),
        })
        const symbolsByFile = new Map<string, SymbolNode[]>()
        for (const symbol of retainedSymbols) {
          const symbols = symbolsByFile.get(symbol.filePath) ?? []
          symbols.push(symbol)
          symbolsByFile.set(symbol.filePath, symbols)
        }
        for (const file of retainedFiles) {
          session.hydratePersistedFile(file, symbolsByFile.get(file.path) ?? [])
        }
        session.hydrateReferenceFacts(
          retainReferenceFactsOutsidePaths(persistedReferenceFacts, replacedPaths),
        )
      }

      const logicalIdByDeclarationSymbolId = new Map<string, string>()
      for (const [logicalId, declarations] of session.getDeclarationsByLogicalId()) {
        for (const declaration of declarations) {
          logicalIdByDeclarationSymbolId.set(declaration.symbolId, logicalId)
        }
      }
      const coverageProjection = coverageProjectionRequired
        ? projectSpecCoverage({
            specs: preparedSpecs.map((prepared) => ({
              specId: prepared.specNode.specId,
              implementation: prepared.implementation,
            })),
            indexedFilePaths: session.getAllFilePaths(),
            symbolsByFile: (filePath) => session.findSymbolsByFile(filePath),
            logicalIdByDeclarationSymbolId,
          })
        : { relations: [], diagnostics: [] }

      // Compute per-workspace skipped counts
      for (const filePath of skippedFiles) {
        const wsName = filePath.substring(0, filePath.indexOf(':'))
        const breakdown = wsBreakdowns.get(wsName)
        if (breakdown) breakdown.filesSkipped++
      }

      const totalSpecPhaseDuration = performance.now() - specsStart
      const specIndexingDuration = totalSpecPhaseDuration - specCleanupDuration

      Logger.debug(`[IndexCodeGraph] Spec Indexing took ${Math.round(specIndexingDuration)}ms`)
      Logger.debug(`[IndexCodeGraph]   - GetAllSpecs: ${Math.round(specGetAllSpecsDuration)}ms`)
      Logger.debug(`[IndexCodeGraph]   - List: ${Math.round(specListDuration)}ms`)
      Logger.debug(`[IndexCodeGraph]   - ArtifactRead: ${Math.round(specArtifactReadDuration)}ms`)
      Logger.debug(`[IndexCodeGraph]   - MetadataRead: ${Math.round(specMetadataReadDuration)}ms`)
      Logger.debug(
        `[IndexCodeGraph] Obsolete Spec Cleanup took ${Math.round(specCleanupDuration)}ms`,
      )

      // ── Bulk load everything (83-95%) ──
      const bulkStart = performance.now()
      progress(
        83,
        'Bulk loading',
        `${String(stagedFileCount)} files, ${String(stagedSymbolCount)} symbols, ${String(stagedRelationCount + specDependencyRelations.length + coverageProjection.relations.length)} relations`,
      )
      const serializedFingerprintMap = serializeFingerprintMap(currentFingerprintMap)
      const observations: IndexedInputObservation[] = []
      if (errors.length === 0) {
        observations.push(...specObservations)
        for (const resourceId of allDiscoveredPaths) {
          const resourceKind = indexedResourceKinds.get(resourceId)
          const absolutePath = absolutePaths.get(resourceId)
          const inputLocator = configRelativePaths.get(resourceId)
          const indexedContentHash =
            fileHashes.get(resourceId) ?? existingArtifactHashes.get(resourceId)
          if (
            resourceKind === undefined ||
            absolutePath === undefined ||
            inputLocator === undefined ||
            indexedContentHash === undefined
          ) {
            continue
          }
          const stat = statSync(absolutePath)
          observations.push({
            workspace: resourceId.slice(0, resourceId.indexOf(':')),
            resourceKind,
            resourceId,
            inputKind: IndexedInputKind.Filesystem,
            inputLocator,
            indexedContentHash,
            lastObservedMtime: stat.mtimeMs,
            lastObservedSize: stat.size,
            generation: serializedFingerprintMap,
            stale: false,
          })
        }
      }
      const hierarchyStart = performance.now()
      const crossFileOverrides = this.deriveCrossFileOverrideRelations(
        hierarchyTargetsByType,
        ownershipIndex,
        seenOverrideKeys,
      )
      phaseMetrics.hierarchyOverrides.durationMs += performance.now() - hierarchyStart
      phaseMetrics.hierarchyOverrides.count = crossFileOverrides.length

      const logicalSymbols = session.getLogicalSymbols()
      const logicalIds = new Set(logicalSymbols.map((symbol) => symbol.id))
      const reexportStart = performance.now()
      const linkedReferences = this.linkTypeScriptReExports(session)
      phaseMetrics.reexports.durationMs += performance.now() - reexportStart
      phaseMetrics.reexports.count =
        linkedReferences.relations.length + linkedReferences.steps.length
      const publicBindings = linkedReferences.publicBindings.map((binding) => ({
        ...binding,
        targetId:
          binding.targetId !== undefined && logicalIds.has(binding.targetId)
            ? binding.targetId
            : undefined,
      }))
      const localBindings = session.getLocalBindings().map((binding) => ({
        ...binding,
        targetId:
          binding.targetId !== undefined && logicalIds.has(binding.targetId)
            ? binding.targetId
            : undefined,
      }))
      const knownReferenceIds = new Set([
        ...logicalIds,
        ...publicBindings.map((binding) => binding.id),
        ...localBindings.map((binding) => binding.id),
      ])
      const referenceFacts: ReferenceFactsWrite = {
        logicalSymbols,
        declarations: [...session.getDeclarationsByLogicalId()].flatMap(
          ([logicalSymbolId, declarations]) =>
            declarations.map((declaration) => ({ logicalSymbolId, declaration })),
        ),
        publicBindings,
        localBindings,
        steps: linkedReferences.steps.filter(
          (step) => knownReferenceIds.has(step.fromId) && knownReferenceIds.has(step.toId),
        ),
        coverage: allDiscoveredPaths.map(
          (filePath): IndexCoverage =>
            coverageByFilePath.get(filePath) ?? {
              filePath,
              contentHash: fileHashes.get(filePath) ?? existingArtifactHashes.get(filePath),
              status: IndexCoverageStatus.Partial,
              reason: 'coverage-not-recorded',
              capabilities: [],
            },
        ),
      }

      const rebuildSearchIndexes =
        semanticRefreshRequired ||
        coverageProjectionRequired ||
        stagedFileCount > 0 ||
        allSpecs.length > 0 ||
        obsoleteSpecIds.size > 0 ||
        toRemove.length > 0
      let bulkStep = 0
      let searchRebuildStart: number | undefined
      const onBulkStep = (step: string): void => {
        if (step === 'search-indexes' && searchRebuildStart === undefined) {
          searchRebuildStart = performance.now()
        }
        bulkStep++
        progress(83 + Math.min(Math.round(bulkStep * 2), 13), 'Bulk loading', step)
      }
      const writeSession = this.store.beginBulkIndexSession({
        onProgress: onBulkStep,
        replaceCodeGraph: fullRebuild,
        rebuildSearchIndexes,
        ...(options.vcsRef === undefined ? {} : { vcsRef: options.vcsRef }),
        graphFingerprint: serializedFingerprintMap,
        ...(errors.length === 0
          ? {
              indexedWorkspaces: [...indexedWorkspaceNames],
              clearGraphStaleLatch: true,
            }
          : {}),
      })
      try {
        const persistenceStart = performance.now()
        await writeSession.removeFiles(toRemove)
        await writeSession.removeDocuments(toRemove)
        await writeSession.removeSpecs([...obsoleteSpecIds])
        for (const chunkFile of pass1ChunkFiles) {
          const staged = readFilesAndSymbolsStageChunk(stageDir, chunkFile)
          await writeSession.writeFiles(staged.files)
          await writeSession.writeDocuments(staged.documents)
          await writeSession.writeSymbols(staged.symbols)
        }
        await writeSession.writeSpecs(allSpecs)
        for (const chunkFile of pass2ChunkFiles) {
          const staged = readRelationsStageChunk(stageDir, chunkFile)
          await writeSession.writeRelations(staged.relations)
        }
        if (coverageProjectionRequired) {
          await writeSession.writeReferenceFacts(referenceFacts)
        }
        if (observations.length > 0) await writeSession.writeObservations(observations)
        await writeSession.writeRelations([
          ...specDependencyRelations,
          ...coverageProjection.relations,
          ...crossFileOverrides,
          ...linkedReferences.relations,
        ])
        phaseMetrics.persistence.durationMs += performance.now() - persistenceStart
        phaseMetrics.persistence.count =
          stagedFileCount +
          stagedSymbolCount +
          stagedRelationCount +
          specDependencyRelations.length +
          coverageProjection.relations.length
        const commitStart = performance.now()
        await writeSession.commit()
        const commitEnd = performance.now()
        phaseMetrics.persistence.durationMs += (searchRebuildStart ?? commitEnd) - commitStart
        phaseMetrics.searchIndexRebuild.durationMs =
          searchRebuildStart === undefined ? 0 : commitEnd - searchRebuildStart
        phaseMetrics.searchIndexRebuild.count = rebuildSearchIndexes
          ? stagedFileCount + allSpecs.length
          : 0
      } catch (error) {
        await writeSession.rollback().catch(() => {})
        throw error
      }

      Logger.debug(`[IndexCodeGraph] Bulk Load took ${Math.round(performance.now() - bulkStart)}ms`)
      Logger.debug(`[IndexCodeGraph] Total Run took ${Math.round(performance.now() - start)}ms`)

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

      session.setAdapterState('napi-keepalive', null)
      return {
        filesDiscovered: allDiscoveredPaths.length,
        filesIndexed: filesIndexed + documentsIndexed,
        documentsIndexed,
        filesRemoved: filesRemovedCount,
        filesSkipped: skippedFiles.length,
        specsDiscovered: totalSpecsToProcess,
        specsIndexed,
        errors,
        duration: performance.now() - start,
        workspaces,
        vcsRef: options.vcsRef ?? null,
        graphFingerprint: serializedFingerprintMap,
        fullRebuild,
        fullRebuildReason,
        phaseMetrics,
        coverage: summarizeCoverage(referenceFacts.coverage),
        coverageDiagnostics: coverageProjection.diagnostics,
      }
    } finally {
      rmSync(stageDir, { recursive: true, force: true })
    }
  }

  /**
   * Builds a lightweight method-to-owner index from the extracted symbols in the session.
   * @param session - The indexing session.
   * @returns Owner-to-method mapping for languages with class-scoped methods.
   */
  private buildMethodOwnershipIndex(session: IndexSession): MethodOwnershipIndex {
    const methodsByOwnerId = new Map<string, Map<string, string[]>>()

    for (const filePath of session.getAllFilePaths()) {
      const fileSymbols = session.findSymbolsByFile(filePath)
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
   * Computes the transitive persisted-file closure whose derived facts can change.
   * @param seedFiles - New, changed, deleted, or conservative addition-candidate files.
   * @param visibleFiles - Files visible in the current discovery generation.
   * @param facts - Complete persisted reference snapshot.
   * @returns Visible affected files, including the supplied seeds when still present.
   */
  private async collectAffectedFileClosure(
    seedFiles: readonly string[],
    visibleFiles: ReadonlySet<string>,
    facts: ReferenceFactsWrite,
  ): Promise<Set<string>> {
    const affected = new Set(seedFiles.filter((filePath) => visibleFiles.has(filePath)))
    let frontier = [...new Set(seedFiles)]
    const publicOwnerById = new Map(
      facts.publicBindings.map((binding) => [binding.id, binding.surface]),
    )
    const localOwnerById = new Map(
      facts.localBindings.map((binding) => [binding.id, binding.filePath]),
    )
    const declarationIdsByFile = new Map<string, Set<string>>()
    for (const item of facts.declarations) {
      const ids = declarationIdsByFile.get(item.declaration.location.filePath) ?? new Set<string>()
      ids.add(item.logicalSymbolId)
      declarationIdsByFile.set(item.declaration.location.filePath, ids)
    }
    const bindingIdsByFile = new Map<string, Set<string>>()
    for (const binding of facts.publicBindings) {
      const ids = bindingIdsByFile.get(binding.surface) ?? new Set<string>()
      ids.add(binding.id)
      bindingIdsByFile.set(binding.surface, ids)
    }
    for (const binding of facts.localBindings) {
      const ids = bindingIdsByFile.get(binding.filePath) ?? new Set<string>()
      ids.add(binding.id)
      bindingIdsByFile.set(binding.filePath, ids)
    }
    const reverseSteps = new Map<string, Set<string>>()
    for (const step of facts.steps) {
      const sources = reverseSteps.get(step.toId) ?? new Set<string>()
      sources.add(step.fromId)
      reverseSteps.set(step.toId, sources)
    }

    while (frontier.length > 0) {
      const next = new Set(await this.store.findDirectlyAffectedFiles(frontier))
      const changedReferenceIds = new Set<string>()
      for (const filePath of frontier) {
        for (const id of declarationIdsByFile.get(filePath) ?? []) changedReferenceIds.add(id)
        for (const id of bindingIdsByFile.get(filePath) ?? []) changedReferenceIds.add(id)
      }
      const referenceQueue = [...changedReferenceIds]
      for (let index = 0; index < referenceQueue.length; index++) {
        for (const sourceId of reverseSteps.get(referenceQueue[index]!) ?? []) {
          if (changedReferenceIds.has(sourceId)) continue
          changedReferenceIds.add(sourceId)
          referenceQueue.push(sourceId)
          const owner = publicOwnerById.get(sourceId) ?? localOwnerById.get(sourceId)
          if (owner !== undefined) next.add(owner)
        }
      }

      frontier = [...next]
        .filter((filePath) => visibleFiles.has(filePath) && !affected.has(filePath))
        .sort()
      for (const filePath of frontier) affected.add(filePath)
    }
    return affected
  }

  /**
   * Derives cross-file OVERRIDES relations from the current in-memory hierarchy.
   * @param hierarchyTargetsByType - Direct EXTENDS/IMPLEMENTS targets keyed by subtype.
   * @param ownershipIndex - Owner-to-method mapping.
   * @param seenOverrideKeys - Relations already identified by Pass 2.
   * @returns Additional relations to add.
   */
  private deriveCrossFileOverrideRelations(
    hierarchyTargetsByType: ReadonlyMap<string, ReadonlySet<string>>,
    ownershipIndex: MethodOwnershipIndex,
    seenOverrideKeys: Set<string>,
  ): Relation[] {
    const relations: Relation[] = []
    for (const [typeId, superTypeIds] of hierarchyTargetsByType) {
      const subMethods = ownershipIndex.methodsByOwnerId.get(typeId)
      if (subMethods === undefined) continue
      for (const superTypeId of superTypeIds) {
        const superMethods = ownershipIndex.methodsByOwnerId.get(superTypeId)
        if (superMethods === undefined) continue
        for (const [name, subMethodIds] of subMethods) {
          const superMethodId = superMethods.get(name)?.[0]
          if (superMethodId === undefined) continue
          for (const subId of subMethodIds) {
            const key = `${subId}:${RelationType.Overrides}:${superMethodId}`
            if (seenOverrideKeys.has(key)) continue
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

    return relations
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
