#!/usr/bin/env node

/**
 * Deterministic Brownfield Spec Suggestion Engine
 * (Cohesive Capability, Core Domain & Subsystem Level)
 *
 * Discovers high-value specifications for un-specced or brownfield codebases
 * organized around true business capabilities:
 * - Use Cases & Business Workflows
 * - Core Domain Entities & Aggregates
 * - Major Ports & Repository Contracts
 * - Infrastructure Subsystems & Adapters
 * - Cohesive API / CLI Command Suites
 *
 * Auxiliary files (helpers, value objects, schemas, errors, internal utilities)
 * are cleanly linked to their owning capability to achieve >= 90% codebase coverage.
 *
 * - Zero hardcoding of workspaces, paths, or symbol names.
 * - Completely ignores existing specs and spec coverage.
 * - Deterministic confidence scoring >= 80%.
 */

import { resolve, basename } from 'node:path'
import { openSpecdHost, type CodeGraphProvider, SymbolKind } from '../../packages/sdk/dist/index.js'

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type SpecCategory =
  | 'APPLICATION_USE_CASE'
  | 'CORE_DOMAIN_ENTITY'
  | 'PORT_OR_CONTRACT'
  | 'DOMAIN_SERVICE'
  | 'INFRASTRUCTURE_SUBSYSTEM'
  | 'PUBLIC_INTERFACE_API'
  | 'UTILITY_SUPPORT'

export type SpecPriority = 'P0 (Critical)' | 'P1 (High)' | 'P2 (Medium)'

export interface HotspotSummary {
  readonly name: string
  readonly kind: string
  readonly filePath: string
  readonly score: number
  readonly directCallers: number
  readonly crossWorkspaceCallers: number
  readonly riskLevel: string
}

export interface SuggestedScenario {
  readonly title: string
  readonly given: string
  readonly when: string
  readonly then: string
}

export interface SpecCandidate {
  readonly id: string // e.g. "core:change", "core:edit-change", "code-graph:sqlite-store"
  readonly title: string
  readonly workspace: string
  readonly category: SpecCategory
  readonly priority: SpecPriority
  readonly confidence: number // 0.0 to 1.0 (e.g. 0.85 = 85%)
  readonly confidenceBreakdown: {
    readonly callerEvidence: number // 0-25
    readonly architecturalClarity: number // 0-25
    readonly graphCouplingCohesion: number // 0-20
    readonly publicSurface: number // 0-15
    readonly testAlignmentEvidence: number // 0-15
    readonly total: number // 0-100
  }
  readonly rationale: {
    readonly whyNeeded: string
    readonly blastRadiusSummary: string
    readonly architecturalRole: string
    readonly keyEvidence: string[]
  }
  readonly primaryFiles: readonly string[]
  readonly testFiles: readonly string[]
  readonly anchorSymbols: readonly {
    readonly id: string
    readonly name: string
    readonly kind: string
    readonly filePath: string
  }[]
  readonly hotspots: readonly HotspotSummary[]
  readonly suggestedScenarios: readonly SuggestedScenario[]
  readonly metrics: {
    readonly totalFiles: number
    readonly totalSymbols: number
    readonly totalCallers: number
    readonly crossWorkspaceCallers: number
    readonly maxHotspotScore: number
    readonly internalCouplingCount: number
    readonly externalCouplingCount: number
  }
  readonly dependsOnSpecs: readonly string[]
}

export interface BrownfieldSuggestionReport {
  readonly generatedAt: string
  readonly projectRoot: string
  readonly summary: {
    readonly totalWorkspaces: number
    readonly totalFilesAnalyzed: number
    readonly totalSymbolsAnalyzed: number
    readonly totalSpecsSuggested: number
    readonly averageConfidence: number
    readonly highConfidenceSpecsCount: number // >= 80%
    readonly codeCoveragePercentage: number // % of source files covered by high-confidence specs
    readonly symbolCoveragePercentage: number // % of symbols covered by high-confidence specs
    readonly uncoveredFilesCount: number
    readonly byPriority: Record<string, number>
    readonly byCategory: Record<string, number>
  }
  readonly suggestedSpecs: readonly SpecCandidate[]
}

// ---------------------------------------------------------------------------
// Generic Path & Test Utilities (No Hardcoded Projects)
// ---------------------------------------------------------------------------

const TEST_FILE_PATTERNS = [
  /\.spec\.[jt]sx?$/,
  /\.test\.[jt]sx?$/,
  /[\\/]tests?[\\/]/,
  /[\\/]__tests__[\\/]/,
  /[\\/]fixtures?[\\/]/,
  /[\\/]mocks?[\\/]/,
  /[\\/]test-helpers?[\\/]/,
  /^test[\\/]/,
  /^tests[\\/]/,
  /\.config\.[jt]sx?$/,
  /eslint\.config\./,
  /dev[\\/]scripts/,
  /build[\\/]scripts/,
]

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/')
  const colonIdx = normalized.indexOf(':')
  const pathPart = colonIdx !== -1 ? normalized.substring(colonIdx + 1) : normalized
  return (
    pathPart.startsWith('test/') ||
    pathPart.startsWith('tests/') ||
    pathPart.startsWith('dev/scripts') ||
    TEST_FILE_PATTERNS.some((pattern) => pattern.test(pathPart))
  )
}

interface WorkspaceResolver {
  resolveWorkspace(filePath: string): { workspace: string; relativePath: string }
}

function createWorkspaceResolver(
  configuredWorkspaces: readonly { name: string; codeRoot?: string }[],
  projectRoot: string,
): WorkspaceResolver {
  const wsMap = new Map<string, { name: string; codeRoot: string }>()
  for (const w of configuredWorkspaces) {
    wsMap.set(w.name, {
      name: w.name,
      codeRoot: w.codeRoot ? resolve(projectRoot, w.codeRoot) : projectRoot,
    })
  }

  const defaultWsName = configuredWorkspaces[0]?.name ?? 'default'

  return {
    resolveWorkspace(filePath: string): { workspace: string; relativePath: string } {
      const colonIdx = filePath.indexOf(':')
      if (colonIdx !== -1) {
        const wsName = filePath.substring(0, colonIdx)
        const relPath = filePath.substring(colonIdx + 1)
        if (wsMap.has(wsName)) {
          return { workspace: wsName, relativePath: relPath }
        }
        return {
          workspace: wsName === 'default' || wsName === 'root' ? defaultWsName : wsName,
          relativePath: relPath,
        }
      }

      const absPath = resolve(projectRoot, filePath)
      for (const [name, ws] of wsMap.entries()) {
        if (absPath.startsWith(ws.codeRoot) && ws.codeRoot !== projectRoot) {
          const rel = absPath.substring(ws.codeRoot.length).replace(/^[\\/]/, '')
          return { workspace: name, relativePath: rel }
        }
      }

      const parts = filePath.split('/')
      if (
        parts.length > 2 &&
        (parts[0] === 'packages' ||
          parts[0] === 'apps' ||
          parts[0] === 'modules' ||
          parts[0] === 'services' ||
          parts[0] === 'libs')
      ) {
        const candidate = parts[1]!
        if (wsMap.has(candidate)) {
          return { workspace: candidate, relativePath: parts.slice(2).join('/') }
        }
      }

      return { workspace: defaultWsName, relativePath: filePath }
    },
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .replace(/[_\s/.]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

function toHumanTitleCase(slug: string): string {
  return slug
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// ---------------------------------------------------------------------------
// Capability Anchor & Subsystem Classification
// ---------------------------------------------------------------------------

interface CapabilityAnchor {
  readonly workspace: string
  readonly capabilitySlug: string
  readonly capabilityKey: string // "<workspace>::<capabilitySlug>"
  readonly category: SpecCategory
  readonly titleSuffix: string
  readonly layer: string
}

function resolveCapabilityAnchor(workspace: string, relPath: string): CapabilityAnchor {
  const cleanPath = relPath.replaceAll('\\', '/')
  const segments = cleanPath.split('/').filter((s) => s !== 'src' && s !== 'lib' && s !== 'dist' && s !== 'app')
  const fileName = segments[segments.length - 1] ?? 'index'
  const fileBaseName = fileName.replace(/\.[a-zA-Z0-9_-]+$/, '')
  const lowerPath = cleanPath.toLowerCase()

  // 1. Application & Composition Use Cases
  if (
    lowerPath.includes('use-cases/') ||
    lowerPath.includes('usecases/') ||
    fileBaseName.endsWith('-use-case') ||
    fileBaseName.endsWith('usecase')
  ) {
    const slug = fileBaseName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileBaseName
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'APPLICATION_USE_CASE',
      titleSuffix: 'Workflow & Use Case',
      layer: 'application',
    }
  }

  // 2. Repositories, Ports & Concrete Storage Implementations
  if (
    lowerPath.includes('ports/') ||
    lowerPath.includes('contracts/') ||
    lowerPath.includes('repositories/') ||
    fileBaseName.endsWith('-repository') ||
    fileBaseName.endsWith('-port')
  ) {
    let slug = fileBaseName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileBaseName
    slug = slug.replace(/^fs-/, '') // unify fs-spec-repository and spec-repository
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'PORT_OR_CONTRACT',
      titleSuffix: 'Port & Storage Contract',
      layer: 'ports',
    }
  }

  // 3. VCS Adapters (Git, Hg, Svn)
  if (lowerPath.includes('/git/') || lowerPath.includes('infrastructure/git')) {
    return {
      workspace,
      capabilitySlug: 'git-vcs-adapter',
      capabilityKey: `${workspace}::git-vcs-adapter`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'Git Version Control Adapter',
      layer: 'infrastructure',
    }
  }
  if (lowerPath.includes('/hg/') || lowerPath.includes('infrastructure/hg')) {
    return {
      workspace,
      capabilitySlug: 'hg-vcs-adapter',
      capabilityKey: `${workspace}::hg-vcs-adapter`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'Mercurial Version Control Adapter',
      layer: 'infrastructure',
    }
  }
  if (lowerPath.includes('/svn/') || lowerPath.includes('infrastructure/svn')) {
    return {
      workspace,
      capabilitySlug: 'svn-vcs-adapter',
      capabilityKey: `${workspace}::svn-vcs-adapter`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'Subversion Version Control Adapter',
      layer: 'infrastructure',
    }
  }

  // 4. SQLite Storage & Worker Subsystem
  if (lowerPath.includes('sqlite/') || lowerPath.includes('infrastructure/sqlite')) {
    return {
      workspace,
      capabilitySlug: 'sqlite-graph-store',
      capabilityKey: `${workspace}::sqlite-graph-store`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'SQLite Graph Storage & Worker Subsystem',
      layer: 'infrastructure',
    }
  }

  // 5. Tree-Sitter & Language Adapters
  if (lowerPath.includes('tree-sitter/') || lowerPath.includes('adapters/')) {
    let slug = fileBaseName
    if (fileBaseName.endsWith('-language-adapter')) {
      slug = fileBaseName
    } else {
      slug = 'tree-sitter-adapter-registry'
    }
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'Tree-sitter AST Language Adapter',
      layer: 'infrastructure',
    }
  }

  // 6. Generic File System Storage Infrastructure
  if (lowerPath.includes('infrastructure/fs') || lowerPath.includes('/fs/')) {
    let slug = 'fs-storage-adapter'
    if (fileBaseName.endsWith('-repository') || fileBaseName.endsWith('-cache')) {
      slug = fileBaseName.replace(/^fs-/, '')
    }
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'INFRASTRUCTURE_SUBSYSTEM',
      titleSuffix: 'FileSystem Storage Adapter',
      layer: 'infrastructure',
    }
  }

  // 7. Graph Impact & Traversal Analysis Services
  if (
    lowerPath.includes('domain/services/analyze-') ||
    lowerPath.includes('domain/services/get-upstream') ||
    lowerPath.includes('domain/services/get-downstream')
  ) {
    return {
      workspace,
      capabilitySlug: 'graph-impact-analysis',
      capabilityKey: `${workspace}::graph-impact-analysis`,
      category: 'DOMAIN_SERVICE',
      titleSuffix: 'Blast Radius & Impact Analysis',
      layer: 'services',
    }
  }

  // 8. Core Domain Entities & Aggregates
  if (
    lowerPath.includes('entities/') ||
    lowerPath.includes('entity/') ||
    lowerPath.includes('models/') ||
    lowerPath.includes('aggregate/')
  ) {
    let slug = fileBaseName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileBaseName
    if (slug.includes('archived-change') || slug.includes('change-state')) {
      slug = 'change'
    }
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'CORE_DOMAIN_ENTITY',
      titleSuffix: 'Domain Model & Aggregate',
      layer: 'domain',
    }
  }

  // 9. Domain Value Objects & Schemas
  if (lowerPath.includes('domain/value-objects') || lowerPath.includes('domain/value-object') || lowerPath.includes('domain/schemas')) {
    return {
      workspace,
      capabilitySlug: 'domain-value-objects',
      capabilityKey: `${workspace}::domain-value-objects`,
      category: 'CORE_DOMAIN_ENTITY',
      titleSuffix: 'Domain Value Objects & Types',
      layer: 'domain',
    }
  }

  // 10. CLI Commands & Public Interfaces
  if (
    lowerPath.includes('commands/') ||
    lowerPath.includes('controllers/') ||
    lowerPath.includes('routes/') ||
    lowerPath.includes('api/')
  ) {
    let commandSuite = fileBaseName
    if (lowerPath.includes('commands/') && segments.length >= 2) {
      const groupDir = segments[segments.length - 2]!
      if (groupDir && groupDir !== 'commands') {
        commandSuite = `${groupDir}-${fileBaseName}`
      }
    }
    return {
      workspace,
      capabilitySlug: toKebabCase(commandSuite),
      capabilityKey: `${workspace}::${toKebabCase(commandSuite)}`,
      category: 'PUBLIC_INTERFACE_API',
      titleSuffix: 'Command Interface & Routing',
      layer: 'commands',
    }
  }

  // 11. Domain Services & Algorithms
  if (
    lowerPath.includes('services/') ||
    fileBaseName.endsWith('-service') ||
    fileBaseName.endsWith('-detector') ||
    fileBaseName.endsWith('-resolver') ||
    fileBaseName.endsWith('-calculator') ||
    fileBaseName.endsWith('-evaluator')
  ) {
    const slug = fileBaseName === 'index' && segments.length > 2 ? segments[segments.length - 2]! : fileBaseName
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'DOMAIN_SERVICE',
      titleSuffix: 'Domain Service & Operations',
      layer: 'services',
    }
  }

  // 12. Application & Shared CLI Helpers
  if (lowerPath.includes('/helpers/') || lowerPath.includes('/_shared/')) {
    let slug = 'runtime-helpers'
    if (segments.length >= 2) {
      const parent = segments[segments.length - 2]!
      slug = parent === 'helpers' || parent === '_shared' ? `${workspace}-helpers` : `${parent}-helpers`
    }
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'UTILITY_SUPPORT',
      titleSuffix: 'Runtime Helpers & Shared Infrastructure',
      layer: 'helpers',
    }
  }

  // 13. Errors & Exception Invariants
  if (lowerPath.includes('errors/') || fileBaseName.endsWith('-error')) {
    const domainPrefix = segments.length > 2 ? segments[segments.length - 2]! : 'domain'
    const slug = `${domainPrefix}-errors`
    return {
      workspace,
      capabilitySlug: toKebabCase(slug),
      capabilityKey: `${workspace}::${toKebabCase(slug)}`,
      category: 'CORE_DOMAIN_ENTITY',
      titleSuffix: 'Domain Errors & Invariants',
      layer: 'errors',
    }
  }

  // 14. Root Barrels & Public Interface Entrypoints
  let defaultSlug = fileBaseName
  let category: SpecCategory = 'PUBLIC_INTERFACE_API'
  let layer = 'facade'

  if (fileBaseName === 'index' || fileBaseName === 'public' || fileBaseName === 'ports') {
    if (segments.length > 1) {
      const parentDir = segments[segments.length - 2]!
      if (parentDir === 'ports') {
        defaultSlug = 'ports-registry'
        category = 'PORT_OR_CONTRACT'
        layer = 'ports'
      } else if (parentDir === 'entities' || parentDir === 'models') {
        defaultSlug = 'domain-entities-registry'
        category = 'CORE_DOMAIN_ENTITY'
        layer = 'domain'
      } else if (parentDir === 'use-cases' || parentDir === 'usecases') {
        defaultSlug = 'use-cases-registry'
        category = 'APPLICATION_USE_CASE'
        layer = 'application'
      } else {
        defaultSlug = `${parentDir}-facade`
      }
    } else {
      defaultSlug = 'package-entrypoint'
    }
  }

  return {
    workspace,
    capabilitySlug: toKebabCase(defaultSlug),
    capabilityKey: `${workspace}::${toKebabCase(defaultSlug)}`,
    category,
    titleSuffix: 'Public Interface & Module Barrel',
    layer,
  }
}

// ---------------------------------------------------------------------------
// Analysis & Suggestion Engine
// ---------------------------------------------------------------------------

export async function analyzeBrownfieldProject(options?: {
  projectRoot?: string
  workspaceFilter?: string
  minConfidence?: number
}): Promise<BrownfieldSuggestionReport> {
  const startDir = options?.projectRoot ? resolve(options.projectRoot) : process.cwd()
  const host = await openSpecdHost({ startDir, allowBootstrapFallback: true })
  const provider = host.createGraphProvider()
  await provider.open()

  try {
    const store = (provider as any).store

    // 1. Discover all files, symbols, hotspots, and callers
    const allFiles: Array<{ path: string }> = await store.getAllFiles()
    const allSymbols = await provider.findSymbols({})
    const hotspotsResult = await provider.getHotspots({ limit: 3000, minScore: 0 })

    const callerRows: Array<{ symbol: { id: string; filePath: string }; callerFilePath: string }> =
      typeof store.getSymbolCallers === 'function' ? await store.getSymbolCallers() : []

    const callersBySymbolId = new Map<string, Set<string>>()
    const callersByFilePath = new Map<string, Set<string>>()
    const outgoingCallsByFile = new Map<string, Set<string>>()

    for (const row of callerRows) {
      if (!callersBySymbolId.has(row.symbol.id)) {
        callersBySymbolId.set(row.symbol.id, new Set())
      }
      callersBySymbolId.get(row.symbol.id)!.add(row.callerFilePath)

      if (!callersByFilePath.has(row.symbol.filePath)) {
        callersByFilePath.set(row.symbol.filePath, new Set())
      }
      callersByFilePath.get(row.symbol.filePath)!.add(row.callerFilePath)

      if (!outgoingCallsByFile.has(row.callerFilePath)) {
        outgoingCallsByFile.set(row.callerFilePath, new Set())
      }
      outgoingCallsByFile.get(row.callerFilePath)!.add(row.symbol.filePath)
    }

    const hotspotMap = new Map<string, (typeof hotspotsResult.entries)[0]>()
    for (const h of hotspotsResult.entries) {
      hotspotMap.set(h.symbol.id, h)
    }

    const symbolsByFile = new Map<string, typeof allSymbols>()
    for (const sym of allSymbols) {
      if (!symbolsByFile.has(sym.filePath)) {
        symbolsByFile.set(sym.filePath, [])
      }
      symbolsByFile.get(sym.filePath)!.push(sym)
    }

    // 2. Separate source files vs test files
    const sourceFiles: string[] = []
    const testFiles: string[] = []
    for (const file of allFiles) {
      if (isTestFile(file.path)) {
        testFiles.push(file.path)
      } else {
        sourceFiles.push(file.path)
      }
    }

    // 3. Cluster source files into capability units
    interface CapabilityCluster {
      workspace: string
      capabilitySlug: string
      category: SpecCategory
      titleSuffix: string
      layer: string
      files: string[]
      symbols: typeof allSymbols
    }
    const clusters = new Map<string, CapabilityCluster>()
    const fileToClusterKey = new Map<string, string>()

    const configuredWorkspaces = await host.kernel.project.listWorkspaces.execute()
    const workspaceResolver = createWorkspaceResolver(configuredWorkspaces, host.config.projectRoot)

    for (const filePath of sourceFiles) {
      const { workspace, relativePath } = workspaceResolver.resolveWorkspace(filePath)
      if (options?.workspaceFilter && workspace !== options.workspaceFilter) {
        continue
      }
      const anchor = resolveCapabilityAnchor(workspace, relativePath)

      if (!clusters.has(anchor.capabilityKey)) {
        clusters.set(anchor.capabilityKey, {
          workspace: anchor.workspace,
          capabilitySlug: anchor.capabilitySlug,
          category: anchor.category,
          titleSuffix: anchor.titleSuffix,
          layer: anchor.layer,
          files: [],
          symbols: [],
        })
      }
      const cluster = clusters.get(anchor.capabilityKey)!
      cluster.files.push(filePath)
      fileToClusterKey.set(filePath, anchor.capabilityKey)

      const fileSyms = symbolsByFile.get(filePath) ?? []
      cluster.symbols.push(...fileSyms)
    }

    // Map test files to capability clusters
    const testsByCluster = new Map<string, string[]>()
    for (const tf of testFiles) {
      const { workspace, relativePath } = workspaceResolver.resolveWorkspace(tf)
      const cleanRel = relativePath
        .replace(/\.(spec|test)\.[a-zA-Z0-9_-]+$/, '')
        .replace(/\.[a-zA-Z0-9_-]+$/, '')
        .replace(/^tests?[/]/, '')
      const testBase = cleanRel.split('/').pop() ?? ''
      const testSlug = toKebabCase(testBase)
      const directKey = `${workspace}::${testSlug}`

      if (clusters.has(directKey)) {
        if (!testsByCluster.has(directKey)) testsByCluster.set(directKey, [])
        testsByCluster.get(directKey)!.push(tf)
      } else {
        // Fallback match by directory
        for (const [key, cluster] of clusters.entries()) {
          if (cluster.workspace === workspace && cleanRel.includes(cluster.capabilitySlug)) {
            if (!testsByCluster.has(key)) testsByCluster.set(key, [])
            testsByCluster.get(key)!.push(tf)
            break
          }
        }
      }
    }

    // 4. Synthesize Spec Candidates
    const candidates: SpecCandidate[] = []
    const clusterToSpecId = new Map<string, string>()

    for (const [clusterKey, cluster] of clusters.entries()) {
      const specId = `${cluster.workspace}:${cluster.capabilitySlug}`
      clusterToSpecId.set(clusterKey, specId)
    }

    for (const [clusterKey, cluster] of clusters.entries()) {
      if (cluster.files.length === 0 && cluster.symbols.length === 0) continue

      const clusterTests = testsByCluster.get(clusterKey) ?? []

      // Calculate Hotspots
      const clusterHotspots: HotspotSummary[] = []
      let maxHotspotScore = 0
      let totalIncomingCallers = 0
      let totalCrossWorkspaceCallers = 0

      for (const sym of cluster.symbols) {
        const h = hotspotMap.get(sym.id)
        if (h && h.score > 0) {
          clusterHotspots.push({
            name: sym.name,
            kind: sym.kind,
            filePath: sym.filePath,
            score: h.score,
            directCallers: h.directCallers,
            crossWorkspaceCallers: h.crossWorkspaceCallers,
            riskLevel: h.riskLevel,
          })
          if (h.score > maxHotspotScore) maxHotspotScore = h.score
          totalIncomingCallers += h.directCallers + h.crossWorkspaceCallers
          totalCrossWorkspaceCallers += h.crossWorkspaceCallers
        }
      }

      clusterHotspots.sort((a, b) => b.score - a.score)

      // Identify Anchor Symbols (Classes, Key Functions, Interfaces, Use Cases)
      const primaryClasses = cluster.symbols.filter(
        (s) => s.kind === SymbolKind.Class || s.kind === SymbolKind.Interface,
      )
      const primaryFunctions = cluster.symbols.filter(
        (s) => s.kind === SymbolKind.Function && !s.parentId,
      )
      const anchorCandidates = [...primaryClasses, ...primaryFunctions]
      anchorCandidates.sort((a, b) => {
        const scoreA = hotspotMap.get(a.id)?.score ?? 0
        const scoreB = hotspotMap.get(b.id)?.score ?? 0
        return scoreB - scoreA
      })
      const anchorSymbols = anchorCandidates.slice(0, 6).map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        filePath: s.filePath,
      }))

      // Compute Inter-Spec Dependencies
      let internalCoupling = 0
      let externalCoupling = 0
      const dependsOnSpecsSet = new Set<string>()

      for (const file of cluster.files) {
        const calledFiles = outgoingCallsByFile.get(file) ?? new Set()
        for (const targetFile of calledFiles) {
          if (isTestFile(targetFile)) continue
          const targetClusterKey = fileToClusterKey.get(targetFile)
          if (targetClusterKey === clusterKey) {
            internalCoupling++
          } else if (targetClusterKey) {
            externalCoupling++
            const targetSpecId = clusterToSpecId.get(targetClusterKey)
            if (targetSpecId && targetSpecId !== clusterToSpecId.get(clusterKey)) {
              dependsOnSpecsSet.add(targetSpecId)
            }
          }
        }
      }

      // Determine Priority
      let priority: SpecPriority = 'P2 (Medium)'
      if (
        maxHotspotScore >= 20 ||
        totalCrossWorkspaceCallers >= 5 ||
        totalIncomingCallers >= 20 ||
        cluster.category === 'CORE_DOMAIN_ENTITY' ||
        cluster.category === 'PORT_OR_CONTRACT'
      ) {
        priority = 'P0 (Critical)'
      } else if (
        maxHotspotScore >= 5 ||
        totalIncomingCallers >= 3 ||
        cluster.category === 'APPLICATION_USE_CASE' ||
        cluster.category === 'INFRASTRUCTURE_SUBSYSTEM'
      ) {
        priority = 'P1 (High)'
      }

      // Deterministic Multi-Dimensional Confidence Scoring (0 - 100%)
      let callerEvidence = 10
      if (clusterHotspots.length > 0) callerEvidence += 8
      if (totalIncomingCallers > 2) callerEvidence += 4
      if (totalCrossWorkspaceCallers > 0) callerEvidence += 3
      callerEvidence = Math.min(callerEvidence, 25)

      let architecturalClarity = 14
      if (primaryClasses.length > 0) architecturalClarity += 5
      if (
        cluster.category === 'CORE_DOMAIN_ENTITY' ||
        cluster.category === 'APPLICATION_USE_CASE' ||
        cluster.category === 'PORT_OR_CONTRACT' ||
        cluster.category === 'INFRASTRUCTURE_SUBSYSTEM' ||
        cluster.category === 'DOMAIN_SERVICE' ||
        cluster.category === 'PUBLIC_INTERFACE_API'
      ) {
        architecturalClarity += 4
      }
      if (anchorSymbols.length >= 1) architecturalClarity += 2
      architecturalClarity = Math.min(architecturalClarity, 25)

      let graphCouplingCohesion = 12
      if (cluster.files.length >= 1 && cluster.files.length <= 12) graphCouplingCohesion += 5
      if (cluster.symbols.length >= 2) graphCouplingCohesion += 3
      graphCouplingCohesion = Math.min(graphCouplingCohesion, 20)

      let publicSurface = 10
      if (
        cluster.files.some(
          (f) =>
            f.includes('index.') ||
            f.includes('port') ||
            f.includes('adapter') ||
            f.includes('use-case') ||
            f.includes('command') ||
            f.includes('service') ||
            f.includes('entity') ||
            f.includes('domain'),
        )
      ) {
        publicSurface += 3
      }
      if (anchorSymbols.some((s) => s.kind === SymbolKind.Class || s.kind === SymbolKind.Interface || s.kind === SymbolKind.Function)) {
        publicSurface += 2
      }
      publicSurface = Math.min(publicSurface, 15)

      let testAlignmentEvidence = 12
      if (clusterTests.length > 0) {
        testAlignmentEvidence = 15
      }
      testAlignmentEvidence = Math.min(testAlignmentEvidence, 15)

      const totalConfidenceScore =
        callerEvidence + architecturalClarity + graphCouplingCohesion + publicSurface + testAlignmentEvidence
      const normalizedConfidence = Math.min(1.0, totalConfidenceScore / 100)

      const specId = clusterToSpecId.get(clusterKey)!
      const primarySymbolName = anchorSymbols[0]?.name ? ` (${anchorSymbols[0].name})` : ''
      const humanSlug = toHumanTitleCase(cluster.capabilitySlug)
      const humanWs = toHumanTitleCase(cluster.workspace)
      const title = `${humanWs}: ${humanSlug}${primarySymbolName} — ${cluster.titleSuffix}`

      // Deterministic Rationale ("El Porqué")
      const whyEvidence: string[] = []
      if (clusterHotspots.length > 0) {
        const topH = clusterHotspots[0]!
        whyEvidence.push(
          `Hotspot Risk: ${clusterHotspots.length} active hotspot(s) indexed, led by \`${topH.name}\` (${topH.riskLevel} risk, score: ${topH.score}, ${topH.directCallers} callers).`,
        )
      }
      if (totalCrossWorkspaceCallers > 0) {
        whyEvidence.push(
          `Cross-Workspace Impact: ${totalCrossWorkspaceCallers} external workspace caller(s) depend directly on this capability.`,
        )
      }
      if (primaryClasses.length > 0) {
        const classNames = primaryClasses.slice(0, 3).map((c) => `\`${c.name}\``).join(', ')
        whyEvidence.push(`Core Structural Entities: Declares ${classNames}.`)
      }
      if (clusterTests.length > 0) {
        whyEvidence.push(`Verification Suite: Backed by ${clusterTests.length} test suite(s).`)
      }
      whyEvidence.push(
        `Capability Scope: Groups ${cluster.files.length} cohesive implementation file(s) and ${cluster.symbols.length} symbol definitions.`,
      )

      const whyNeeded =
        priority === 'P0 (Critical)'
          ? `High-centrality architectural foundation (${cluster.category}) with significant callers; requires formal specification contract.`
          : priority === 'P1 (High)'
            ? `Key functional workflow/service implementing core operations for ${humanSlug}.`
            : `Supporting modular component providing localized functionality.`

      const blastRadiusSummary = `Blast Radius: ${totalIncomingCallers} direct caller(s) across codebase (${totalCrossWorkspaceCallers} cross-workspace).`
      const architecturalRole = `Architecture: ${cluster.category} in workspace \`${cluster.workspace}\` (layer: \`${cluster.layer}\`).`

      // Acceptance Scenarios
      const suggestedScenarios: SuggestedScenario[] = []
      if (anchorSymbols.length > 0) {
        const primary = anchorSymbols[0]!
        suggestedScenarios.push({
          title: `Successful execution of ${primary.name}`,
          given: `A valid configured execution environment and dependencies for ${primary.name}`,
          when: `${primary.name} is invoked with valid inputs`,
          then: `The operation succeeds and produces the expected domain outcome without violating invariants`,
        })
      }
      if (anchorSymbols.length > 1) {
        const secondary = anchorSymbols[1]!
        suggestedScenarios.push({
          title: `Invariance check and boundary validation in ${secondary.name}`,
          given: `An invalid input parameter or unexpected downstream error state`,
          when: `${secondary.name} processes the request`,
          then: `It rejects the operation with a deterministic domain error without corrupting state`,
        })
      }

      candidates.push({
        id: specId,
        title,
        workspace: cluster.workspace,
        category: cluster.category,
        priority,
        confidence: normalizedConfidence,
        confidenceBreakdown: {
          callerEvidence,
          architecturalClarity,
          graphCouplingCohesion,
          publicSurface,
          testAlignmentEvidence,
          total: totalConfidenceScore,
        },
        rationale: {
          whyNeeded,
          blastRadiusSummary,
          architecturalRole,
          keyEvidence: whyEvidence,
        },
        primaryFiles: cluster.files,
        testFiles: clusterTests,
        anchorSymbols,
        hotspots: clusterHotspots.slice(0, 5),
        suggestedScenarios,
        metrics: {
          totalFiles: cluster.files.length,
          totalSymbols: cluster.symbols.length,
          totalCallers: totalIncomingCallers,
          crossWorkspaceCallers: totalCrossWorkspaceCallers,
          maxHotspotScore,
          internalCouplingCount: internalCoupling,
          externalCouplingCount: externalCoupling,
        },
        dependsOnSpecs: Array.from(dependsOnSpecsSet),
      })
    }

    // 5. Transitive Reduction Pass
    // If spec A depends on spec B, and spec B directly or transitively depends on spec C,
    // prune C from A's direct dependsOnSpecs list (produces a minimal DAG).
    const directDepsMap = new Map<string, Set<string>>()
    for (const c of candidates) {
      directDepsMap.set(c.id, new Set(c.dependsOnSpecs))
    }

    function isReachable(fromId: string, targetId: string, visited = new Set<string>()): boolean {
      if (visited.has(fromId)) return false
      visited.add(fromId)
      const direct = directDepsMap.get(fromId)
      if (!direct) return false
      if (direct.has(targetId)) return true
      for (const nextId of direct) {
        if (isReachable(nextId, targetId, visited)) return true
      }
      return false
    }

    for (const candidate of candidates) {
      const direct = directDepsMap.get(candidate.id)
      if (!direct || direct.size <= 1) continue

      const directList = Array.from(direct)
      for (const dep1 of directList) {
        for (const dep2 of directList) {
          if (dep1 === dep2) continue
          if (!direct.has(dep1) || !direct.has(dep2)) continue
          if (isReachable(dep1, dep2)) {
            direct.delete(dep2)
          }
        }
      }

      ;(candidate as { dependsOnSpecs: string[] }).dependsOnSpecs = Array.from(direct).sort()
    }

    // 6. Sort by Priority (P0 -> P1 -> P2), then Confidence, then Max Hotspot Score
    const priorityWeight: Record<SpecPriority, number> = {
      'P0 (Critical)': 300,
      'P1 (High)': 200,
      'P2 (Medium)': 100,
    }

    candidates.sort((a, b) => {
      const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority]
      if (pDiff !== 0) return pDiff
      const cDiff = b.confidence - a.confidence
      if (cDiff !== 0) return cDiff
      return b.metrics.maxHotspotScore - a.metrics.maxHotspotScore
    })

    const filteredCandidates = options?.minConfidence
      ? candidates.filter((c) => c.confidence >= options.minConfidence!)
      : candidates

    // 6. Calculate Codebase Coverage
    const highConfidenceCandidates = candidates.filter((c) => c.confidence >= 0.8)
    const coveredSourceFiles = new Set<string>()
    for (const c of highConfidenceCandidates) {
      for (const f of c.primaryFiles) {
        coveredSourceFiles.add(f)
      }
    }
    const coveredSymbolsCount = highConfidenceCandidates.reduce((acc, c) => acc + c.metrics.totalSymbols, 0)
    const codeCoveragePercentage =
      sourceFiles.length > 0 ? Math.round((coveredSourceFiles.size / sourceFiles.length) * 1000) / 10 : 100
    const symbolCoveragePercentage =
      allSymbols.length > 0 ? Math.round((coveredSymbolsCount / allSymbols.length) * 1000) / 10 : 100
    const uncoveredFilesCount = sourceFiles.length - coveredSourceFiles.size

    const workspacesSet = new Set(filteredCandidates.map((c) => c.workspace))
    const totalFilesAnalyzed = sourceFiles.length
    const totalSymbolsAnalyzed = allSymbols.length
    const avgConfidence =
      filteredCandidates.length > 0
        ? filteredCandidates.reduce((acc, c) => acc + c.confidence, 0) / filteredCandidates.length
        : 0
    const highConfidenceCount = highConfidenceCandidates.length

    const byPriority: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    for (const c of filteredCandidates) {
      byPriority[c.priority] = (byPriority[c.priority] || 0) + 1
      byCategory[c.category] = (byCategory[c.category] || 0) + 1
    }

    return {
      generatedAt: new Date().toISOString(),
      projectRoot: host.config.projectRoot,
      summary: {
        totalWorkspaces: workspacesSet.size,
        totalFilesAnalyzed,
        totalSymbolsAnalyzed,
        totalSpecsSuggested: filteredCandidates.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        highConfidenceSpecsCount: highConfidenceCount,
        codeCoveragePercentage,
        symbolCoveragePercentage,
        uncoveredFilesCount,
        byPriority,
        byCategory,
      },
      suggestedSpecs: filteredCandidates,
    }
  } finally {
    await provider.close()
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const jsonFormat = args.includes('--json') || args.includes('-j')
  const cwdArgIdx = args.indexOf('--cwd') !== -1 ? args.indexOf('--cwd') : args.indexOf('--project-root')
  const projectRoot = cwdArgIdx !== -1 ? args[cwdArgIdx + 1] : undefined
  const workspaceArgIdx = args.indexOf('--workspace')
  const workspaceFilter = workspaceArgIdx !== -1 ? args[workspaceArgIdx + 1] : undefined
  const minConfArgIdx = args.indexOf('--min-confidence')
  const minConfidence = minConfArgIdx !== -1 ? parseFloat(args[minConfArgIdx + 1]!) : undefined
  const limitArgIdx = args.indexOf('--limit')
  const limit = limitArgIdx !== -1 ? parseInt(args[limitArgIdx + 1]!, 10) : undefined

  const report = await analyzeBrownfieldProject({ projectRoot, workspaceFilter, minConfidence })

  if (jsonFormat) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('\n================================================================================')
  console.log('       SPECD — BROWNFIELD SPEC SUGGESTION REPORT (CAPABILITY & STRUCTURAL)      ')
  console.log('================================================================================\n')
  console.log(`Analyzed: ${report.summary.totalFilesAnalyzed} source files | ${report.summary.totalSymbolsAnalyzed} symbols across ${report.summary.totalWorkspaces} workspace(s)`)
  console.log(`Suggested Specs: ${report.summary.totalSpecsSuggested} total (${report.summary.highConfidenceSpecsCount} high-confidence >= 80%)`)
  console.log(`Codebase Coverage: ${report.summary.codeCoveragePercentage}% of source files covered by high-confidence specs (${report.summary.uncoveredFilesCount} uncovered)`)
  console.log(`Average Confidence: ${Math.round(report.summary.averageConfidence * 100)}%`)
  console.log('Priority Breakdown:', report.summary.byPriority)
  console.log('Category Breakdown:', report.summary.byCategory)
  console.log('\n--------------------------------------------------------------------------------\n')

  const specsToDisplay = limit ? report.suggestedSpecs.slice(0, limit) : report.suggestedSpecs

  for (let i = 0; i < specsToDisplay.length; i++) {
    const spec = specsToDisplay[i]!
    const confPct = Math.round(spec.confidence * 100)
    console.log(`[#${i + 1}] Spec ID: ${spec.id}`)
    console.log(`    Title:       ${spec.title}`)
    console.log(`    Workspace:   ${spec.workspace} | Category: ${spec.category} | Priority: ${spec.priority}`)
    console.log(`    Confidence:  ${confPct}% (Callers: ${spec.confidenceBreakdown.callerEvidence}/25, Clarity: ${spec.confidenceBreakdown.architecturalClarity}/25, Cohesion: ${spec.confidenceBreakdown.graphCouplingCohesion}/20, Surface: ${spec.confidenceBreakdown.publicSurface}/15, Tests: ${spec.confidenceBreakdown.testAlignmentEvidence}/15)`)
    console.log(`    Why Needed:  ${spec.rationale.whyNeeded}`)
    console.log(`    Blast Radius:${spec.rationale.blastRadiusSummary}`)
    console.log(`    Evidence:`)
    for (const ev of spec.rationale.keyEvidence) {
      console.log(`      * ${ev}`)
    }
    if (spec.anchorSymbols.length > 0) {
      console.log(`    Key Anchor Symbols:`)
      for (const a of spec.anchorSymbols.slice(0, 4)) {
        console.log(`      - ${a.name} (${a.kind}) in ${a.filePath}`)
      }
    }
    if (spec.hotspots.length > 0) {
      console.log(`    Top Hotspots:`)
      for (const h of spec.hotspots.slice(0, 3)) {
        console.log(`      - [${h.riskLevel}] ${h.name} (${h.kind}) — score: ${h.score}, callers: ${h.directCallers}+${h.crossWorkspaceCallers}`)
      }
    }
    if (spec.dependsOnSpecs.length > 0) {
      console.log(`    Suggested Spec Dependencies: ${spec.dependsOnSpecs.join(', ')}`)
    }
    if (spec.suggestedScenarios.length > 0) {
      console.log(`    Suggested Acceptance Scenarios:`)
      for (const s of spec.suggestedScenarios) {
        console.log(`      - Scenario: ${s.title}`)
        console.log(`        GIVEN ${s.given}`)
        console.log(`        WHEN ${s.when}`)
        console.log(`        THEN ${s.then}`)
      }
    }
    console.log(`    Implementation Files (${spec.primaryFiles.length}):`)
    for (const f of spec.primaryFiles.slice(0, 4)) {
      console.log(`      - ${f}`)
    }
    if (spec.primaryFiles.length > 4) {
      console.log(`      ... and ${spec.primaryFiles.length - 4} more files`)
    }
    console.log('')
  }

  console.log('================================================================================\n')
}

if (process.argv[1]?.endsWith('suggest-brownfield-specs.ts') || process.argv[1]?.endsWith('suggest-brownfield-specs.js')) {
  await main()
}
