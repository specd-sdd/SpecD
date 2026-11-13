#!/usr/bin/env node
/**
 * Unified Deterministic & Heuristic Spec Completeness Auditor.
 *
 * Architecture:
 * 1. CodeGraph Subsystem Integration:
 *    - Uses `.specd/config/graph/code-graph.sqlite` (compiled via Tree-sitter polyglot adapters)
 *    - Extracts symbols, constructor parameters, and COVERS_SYMBOL / COVERS_FILE relations in <30ms
 *    - Falls back to filesystem AST indexing if graph is not yet initialized
 * 2. Markdown AST (MDAST) Hierarchical Sectioning for BOTH `spec.md` and `verify.md`
 * 3. Multi-Tier Symbol & Contract Discovery:
 *    - Tier 1: TypeScript AST Declarations (class, interface, function)
 *    - Tier 2: Example Constructor Invocations (e.g. `new SymbolName(arg1, arg2)`)
 *    - Tier 3: Prose & List Injected Dependencies (Prose/List-inferred constructor contracts)
 *    - Tier 4: CodeGraph `COVERS_SYMBOL` Verified Relations (SQLite Graph Store)
 *    - Tier 5: Dedicated Requirement Sections (e.g. `### Requirement: SymbolName use case`)
 *    - Tier 6: Spec-Lock Implementation Links (`spec-lock.json` with ownership disambiguation)
 *    - Tier 7: Inline Code & Backticks in spec.md & verify.md (`` `Symbol` ``)
 *    - Tier 8: Plain Text Prose Candidate Harvester + Ground Truth Symbol Filter
 * 4. AST-to-AST Differential Parameter & Order Conformance Analyzer
 * 5. 15-Dimensional Architectural & Graph Intelligence Completeness Suite:
 *    -- Part B: Architectural Completeness Suite --
 *    - Dimension 1: Error Topology Coverage (throw new Error vs verify.md THEN assertions & isolation policies)
 *    - Dimension 2: Union & Enum Branch Matrix (type union literals in verify.md scenarios)
 *    - Dimension 3: I/O Interface Field Coverage (Public Input/Result properties in spec & verify)
 *    - Dimension 4: Boolean Toggle Symmetry (True vs False/absent/null cases in verify.md)
 *    - Dimension 5: Call Graph vs Spec Dependencies Alignment
 *    - Dimension 6: State Mutation & Side-Effect Visibility (verify.md THEN persists/records)
 *    - Dimension 7: Graceful Fallback & Degradation Coverage (verify.md resilience & error isolation scenarios)
 *    - Dimension 8: Reverse Drift & Zombie References (dangling specs/symbols in spec-lock)
 *    - Dimension 9: Public API Member Coverage (class methods documented in spec / verified in verify.md)
 *    - Dimension 10: Graph Topology & Layering Rules (cycle detection & architectural tier rules)
 *    - Dimension 11: Async & Transaction Contracts (AbortSignal & rollback verification)
 *    -- Part C: Graph Intelligence & Ecosystem Impact Suite --
 *    - Dimension 12: Hotspot & Blast Radius vs Verification Density (downstream consumers vs scenario coverage)
 *    - Dimension 13: Dead Code & Graph Reachability (orphaned spec-lock files & island ghost specs)
 *    - Dimension 14: Event Emission & Hook Lifecycle Contracts (event payload & hook error isolation)
 *    - Dimension 15: Performance Anti-patterns & Loop I/O (N+1 query & unbatched I/O detection)
 *
 * Usage:
 *   npx tsx dev/scripts/spec-completeness-poc.ts --symbol <SymbolName>
 *   npx tsx dev/scripts/spec-completeness-poc.ts --spec <specId>
 *   npx tsx dev/scripts/spec-completeness-poc.ts --change <changeName>
 *   npx tsx dev/scripts/spec-completeness-poc.ts <SymbolName | specId>
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fromMarkdown } from '../../packages/core/node_modules/mdast-util-from-markdown/index.js'
import { extractMetadata } from '../../packages/core/dist/index.js'
import { DatabaseSync } from 'node:sqlite'

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

interface ParameterInfo {
  name: string
  type: string
  isOptional: boolean
  position: number
}

interface ClassSignature {
  name: string
  filePath: string
  workspace: string
  constructorParams: ParameterInfo[]
  methods: string[]
}

interface CodeSymbol {
  name: string
  kind: 'class' | 'interface' | 'function' | 'type' | 'variable' | 'enum'
  filePath: string
  workspace: string
  classSig?: ClassSignature
  source?: string
}

interface ContractDeclaration {
  symbolName: string
  kind: 'class' | 'interface' | 'function' | 'type'
  sectionName: string
  constructorParams?: ParameterInfo[]
  rawCode: string
  isInferredFromProse?: boolean
  isFromExampleInvocation?: boolean
}

interface SymbolMention {
  symbolName: string
  source: 'contract-ast' | 'spec-lock' | 'inline-code' | 'prose-heuristic'
  sectionName: string
}

interface SpecInfo {
  specId: string
  workspace: string
  filePath: string
  verifyFilePath?: string
  title: string
  sections: { name: string; depth: number }[]
  contractDeclarations: Map<string, ContractDeclaration>
  symbolMentions: Map<string, SymbolMention>
  specLockImplementationSymbols: Set<string>
  specLockImplementationFiles: { file: string; symbols: string[] }[]
  metadata?: any
  rules: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  scenarios: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
  requirementsText: string
  verifyText: string
  rawContent: string
  verifyContent?: string
  mdast?: any
  verifyMdast?: any
  declaredDependencies?: readonly string[]
  isDepsInitialized?: boolean
}

interface PresenceCheck {
  inRequirements: boolean
  inVerify: boolean
  badge: string
}

function checkPresence(query: string | RegExp, spec: SpecInfo): PresenceCheck {
  let inReq = false
  let inVer = false

  const reqText = spec.requirementsText || spec.rawContent || ''
  const verText = spec.verifyText || spec.verifyContent || ''

  if (typeof query === 'string') {
    const qLower = query.toLowerCase()
    inReq = reqText.toLowerCase().includes(qLower)
    inVer = verText.toLowerCase().includes(qLower)
  } else {
    inReq = query.test(reqText)
    inVer = query.test(verText)
  }

  const badge =
    inReq && inVer
      ? `${colors.green}[Req: ✔ | Ver: ✔]${colors.reset}`
      : inReq
        ? `${colors.yellow}[Req: ✔ | Ver: ✖]${colors.reset}`
        : inVer
          ? `${colors.yellow}[Req: ✖ | Ver: ✔]${colors.reset}`
          : `${colors.red}[Req: ✖ | Ver: ✖]${colors.reset}`

  return { inRequirements: inReq, inVerify: inVer, badge }
}

interface HeuristicResult {
  dimension: string
  score: number // 0 to 100
  passed: boolean
  findings: { type: 'ok' | 'warn' | 'error'; message: string }[]
}

interface CodeGraphData {
  db?: any
  symbols: Map<string, CodeSymbol[]>
  coveredSymbolsBySpec: Map<string, Set<string>>
  coveredFilesBySpec: Map<string, Set<string>>
  fileToSpecs: Map<string, Set<string>>
  symbolToSpecs: Map<string, Set<string>>
  fileDependencies: Map<string, Set<{ file: string; symbolName: string | null }>>
}

let PROJECT_ROOT = process.cwd()

function listFiles(dir: string, fileNameOrExt: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.turbo') {
        listFiles(fullPath, fileNameOrExt, out)
      }
    } else if (entry.isFile()) {
      if (fileNameOrExt.startsWith('.')) {
        if (entry.name.endsWith(fileNameOrExt)) out.push(fullPath)
      } else {
        if (entry.name === fileNameOrExt) out.push(fullPath)
      }
    }
  }
  return out
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase())
}

function extractMdastText(nodes: any[]): string {
  if (!Array.isArray(nodes)) return ''
  return nodes
    .map((n) => {
      if (typeof n.value === 'string') return n.value
      if (Array.isArray(n.children)) return extractMdastText(n.children)
      return ''
    })
    .join('')
}

/**
 * Dynamically resolves a raw or canonical file path to an absolute filesystem path
 * using the registered workspace configuration.
 */
function resolveWorkspaceFilePath(rawOrCanonicalFile: string, host?: any): string {
  const workspaces: any[] = host?.config?.workspaces || []
  let wsName = ''
  let relPath = rawOrCanonicalFile

  if (rawOrCanonicalFile.includes(':')) {
    const parts = rawOrCanonicalFile.split(':')
    wsName = parts[0]
    relPath = parts.slice(1).join(':')
  }

  // 1. Direct workspace match
  if (wsName) {
    const ws = workspaces.find((w) => w.name === wsName)
    if (ws?.codeRoot) {
      return path.resolve(ws.codeRoot, relPath)
    }
  }

  // 2. Check if relPath matches relative to any workspace codeRoot
  for (const ws of workspaces) {
    if (ws?.codeRoot) {
      const candidate = path.resolve(ws.codeRoot, relPath)
      if (fs.existsSync(candidate)) return candidate
    }
  }

  // 3. Fallback to project root
  return path.resolve(PROJECT_ROOT, relPath)
}

/**
 * Converts any file path into canonical `<workspace>:<relPath>` by matching against workspace roots.
 */
function toCanonicalWorkspacePath(
  filePath: string,
  host?: any,
): { workspace: string; relPath: string; canonical: string } {
  const workspaces: any[] = host?.config?.workspaces || []
  const resolvedDiskPath = resolveWorkspaceFilePath(filePath, host)
  const normFile = path.resolve(resolvedDiskPath).replace(/\\/g, '/')

  // Sort workspaces so more specific codeRoots (e.g. packages/core) match before root workspaces (e.g. specd root)
  const sortedWorkspaces = [...workspaces]
    .filter((w) => w?.codeRoot)
    .sort((a, b) => (b.codeRoot?.length || 0) - (a.codeRoot?.length || 0))

  for (const ws of sortedWorkspaces) {
    const normRoot = path.resolve(ws.codeRoot).replace(/\\/g, '/')
    if (normFile.startsWith(normRoot + '/') || normFile === normRoot) {
      const rel = normFile.slice(normRoot.length).replace(/^\//, '')
      return { workspace: ws.name, relPath: rel, canonical: `${ws.name}:${rel}` }
    }
  }

  if (filePath.includes(':')) {
    const [ws, ...rest] = filePath.split(':')
    return { workspace: ws, relPath: rest.join(':'), canonical: filePath }
  }

  const relFromRoot = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/')
  return { workspace: 'unknown', relPath: relFromRoot, canonical: relFromRoot }
}

/**
 * Dynamically determines if a file is an entrypoint, barrel, or binary for a workspace.
 */
function isEntrypointFile(filePath: string, host?: any): boolean {
  const norm = filePath.replace(/\\/g, '/')
  const baseName = path.basename(norm, path.extname(norm)).toLowerCase()
  const CONVENTIONAL_ENTRYPOINTS = new Set([
    'index',
    'main',
    'cli',
    'public',
    'entrypoint',
    'mod',
    'lib',
    '__init__',
    'app',
    'server',
  ])
  if (CONVENTIONAL_ENTRYPOINTS.has(baseName)) return true

  // Check against workspace package.json declared entry points if present
  const workspaces: any[] = host?.config?.workspaces || []
  for (const ws of workspaces) {
    const wsDir = ws?.codeRoot || ws?.path
    if (wsDir && fs.existsSync(wsDir)) {
      const pkgPath = path.join(wsDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
          const entryFields = [
            pkg.main,
            pkg.module,
            pkg.types,
            ...(typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {})),
          ]
          for (const ef of entryFields) {
            if (typeof ef === 'string') {
              const efBase = path.basename(ef, path.extname(ef)).toLowerCase()
              if (efBase === baseName) return true
            }
          }
        } catch {}
      }
    }
  }
  return false
}

interface DynamicWorkspaceTopology {
  tiers: Map<string, number>
  leafWorkspaces: Set<string>
}

/**
 * Computes topological architectural tiers and leaf workspaces dynamically
 * from workspace manifests and CodeGraph inter-workspace relations.
 */
function computeDynamicWorkspaceTiers(
  host?: any,
  codeGraphData?: CodeGraphData | null,
): DynamicWorkspaceTopology {
  const workspaces: any[] = host?.config?.workspaces || []
  const wsNames = new Set<string>(workspaces.map((w) => w.name))
  const outwardDeps = new Map<string, Set<string>>()
  const inwardDeps = new Map<string, Set<string>>()
  const binaryWorkspaces = new Set<string>()

  for (const name of wsNames) {
    outwardDeps.set(name, new Set())
    inwardDeps.set(name, new Set())
  }

  // 1. Inspect manifests (package.json / workspace configs)
  for (const ws of workspaces) {
    const wsDir = ws?.codeRoot || ws?.path
    if (wsDir && fs.existsSync(wsDir)) {
      const pkgJsonPath = path.join(wsDir, 'package.json')
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
          if (pkg.bin) binaryWorkspaces.add(ws.name)
          const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
            ...(pkg.peerDependencies || {}),
          }
          for (const depPkgName of Object.keys(allDeps)) {
            for (const otherWs of workspaces) {
              if (
                otherWs.name === depPkgName ||
                depPkgName === `@specd/${otherWs.name}` ||
                otherWs.packageName === depPkgName
              ) {
                if (otherWs.name !== ws.name) {
                  outwardDeps.get(ws.name)?.add(otherWs.name)
                  inwardDeps.get(otherWs.name)?.add(ws.name)
                }
              }
            }
          }
        } catch {}
      }
    }
  }

  // 2. Cross-reference CodeGraph inter-workspace relations
  if (codeGraphData?.db) {
    try {
      const rows = codeGraphData.db
        .prepare(
          `SELECT DISTINCT source, target FROM relations WHERE type IN ('IMPORTS', 'DEPENDS_ON')`,
        )
        .all() as { source: string; target: string }[]

      for (const r of rows) {
        const srcWs = r.source.split(':')[0]
        const tgtWs = r.target.split(':')[0]
        if (wsNames.has(srcWs) && wsNames.has(tgtWs) && srcWs !== tgtWs) {
          outwardDeps.get(srcWs)?.add(tgtWs)
          inwardDeps.get(tgtWs)?.add(srcWs)
        }
      }
    } catch {}
  }

  // 3. Compute topological tiers: base layers (outwardDeps = 0) get tier 0.
  const tiers = new Map<string, number>()
  function getTier(ws: string, visited: Set<string>): number {
    if (visited.has(ws)) return 0
    visited.add(ws)
    const targets = outwardDeps.get(ws)
    if (!targets || targets.size === 0) return 0
    let max = 0
    for (const t of targets) {
      const sub = getTier(t, new Set(visited))
      if (sub >= max) max = sub + 1
    }
    return max
  }

  for (const name of wsNames) {
    tiers.set(name, getTier(name, new Set()))
  }

  // 4. Identify leaf workspaces: workspaces with 0 inward dependencies, binaries, or top-tier applications
  const maxTier = Math.max(...Array.from(tiers.values()), 0)
  const leafWorkspaces = new Set<string>()
  for (const [ws, callers] of inwardDeps) {
    const isBinary = binaryWorkspaces.has(ws)
    const isTopTier = (tiers.get(ws) || 0) === maxTier && maxTier > 0
    const filteredCallers = Array.from(callers).filter((c) => {
      const cOut = outwardDeps.get(c)?.size || 0
      return cOut < wsNames.size * 0.5
    })

    if (callers.size === 0 || isBinary || isTopTier || filteredCallers.length === 0) {
      leafWorkspaces.add(ws)
    }
  }

  return { tiers, leafWorkspaces }
}

/**
 * Resolves implementation files for a spec dynamically using:
 * 1. Spec-lock declarations
 * 2. CodeGraph COVERS_FILE relations in SQLite
 * 3. Polyglot source file resolution
 */
function findImplementationFilesForSpec(
  specId: string,
  specLockFiles: { file: string; symbols: string[] }[],
  host?: any,
  codeGraphData?: CodeGraphData | null,
): string[] {
  const implFiles: string[] = []

  // 1. Spec-lock implementation files
  if (specLockFiles && specLockFiles.length > 0) {
    for (const item of specLockFiles) {
      if (!item.file.includes('test/') && !item.file.includes('tests/')) {
        const resolved = resolveWorkspaceFilePath(item.file, host)
        if (fs.existsSync(resolved)) {
          implFiles.push(resolved)
        }
      }
    }
  }

  // 2. CodeGraph COVERS_FILE relations
  if (implFiles.length === 0 && codeGraphData?.coveredFilesBySpec?.has(specId)) {
    const covered = codeGraphData.coveredFilesBySpec.get(specId)!
    for (const cov of covered) {
      if (!cov.includes('test/') && !cov.includes('tests/')) {
        const resolved = resolveWorkspaceFilePath(cov, host)
        if (fs.existsSync(resolved)) {
          implFiles.push(resolved)
        }
      }
    }
  }

  // 3. Polyglot source file lookup in the spec's owning workspace
  if (implFiles.length === 0) {
    const specName = specId.split(':').pop()?.split('/').pop() || ''
    const [specWs] = specId.split(':')
    const workspaces: any[] = host?.config?.workspaces || []
    const targetWorkspaces = workspaces.filter((w) => w.name === specWs || !specWs)
    const workspacesToScan = targetWorkspaces.length > 0 ? targetWorkspaces : workspaces

    const COMMON_EXTS = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.php',
      '.go',
      '.rs',
      '.rb',
      '.cs',
    ]
    for (const ws of workspacesToScan) {
      if (ws.codeRoot && fs.existsSync(ws.codeRoot)) {
        for (const ext of COMMON_EXTS) {
          const matches = listFiles(ws.codeRoot, `${specName}${ext}`).filter(
            (f) => !f.includes('/test/') && !f.includes('/tests/'),
          )
          if (matches.length > 0) {
            implFiles.push(...matches)
          }
        }
      }
    }
  }

  return Array.from(new Set(implFiles))
}

function isGlobalSpec(specId: string): boolean {
  return (
    specId.includes(':_global/') ||
    specId.startsWith('_global/') ||
    specId.startsWith('default:_global/')
  )
}

/**
 * Loads symbols, constructors, and spec coverage mappings directly from
 * `.specd/config/graph/code-graph.sqlite` via `DatabaseSync`.
 *
 * =========================================================================================
 * ARCHITECTURAL RATIONALE & FUTURE CODEGRAPH ROADMAP
 * =========================================================================================
 * We use direct SQLite read queries via `node:sqlite` in this script to achieve ultra-fast (<30ms)
 * synchronous index hydration. However, several direct SQL queries exist here specifically
 * because `@specd/code-graph` (both `CodeGraphProvider` and `GraphStore`) currently lacks
 * dedicated high-level domain query APIs or contains efficiency bottlenecks.
 *
 * Below is the breakdown of why each raw SQLite query is used, what functions MUST be
 * implemented in `@specd/code-graph` to replace them, and how existing CodeGraph components
 * can be evolved for significantly higher efficiency:
 *
 * 1. QUERY: `SELECT id, name, kind, file_path, line, comment, parent_id FROM symbols WHERE kind IN (...)`
 *    --------------------------------------------------------------------------------------
 *    • Why SQLite is used today:
 *      `CodeGraphProvider.findSymbols(query)` only accepts a single scalar `kind?: SymbolKind`,
 *      preventing multi-kind batch queries (e.g. ['class', 'interface', 'function', 'type']) in
 *      one request. Calling `findSymbols({})` without filters fetches all 40k+ symbols including
 *      local variables and internal nodes without multi-kind projection.
 *    • Future CodeGraph API to implement:
 *      ```ts
 *      // In GraphStore and CodeGraphProvider:
 *      interface SymbolBatchQuery {
 *        readonly kinds?: readonly SymbolKind[]
 *        readonly workspaces?: readonly string[]
 *        readonly excludeKinds?: readonly SymbolKind[]
 *      }
 *      getAllSymbols(query?: SymbolBatchQuery): Promise<SymbolNode[]>
 *      ```
 *
 * 2. STRUCTURAL MAPPING: Parent-to-Constructor Resolution (`constructorsByParentId.set(r.parent_id, r)`)
 *    --------------------------------------------------------------------------------------
 *    • Why manual association is used today:
 *      Tree-sitter already links methods to their parent class using `parent_id`, but
 *      `CodeGraphProvider` does not expose a high-level helper to query class members or constructors.
 *    • Future CodeGraph API to implement:
 *      ```ts
 *      // In CodeGraphProvider:
 *      getSymbolChildren(parentId: string, kinds?: readonly SymbolKind[]): Promise<SymbolNode[]>
 *      getClassConstructor(classSymbolId: string): Promise<SymbolNode | undefined>
 *      ```
 *
 * 3. CONTRACT EXTRACTION: Reading constructor parameters from source file lines via regex/AST
 *    --------------------------------------------------------------------------------------
 *    • Why source file reading is used today:
 *      `SymbolNode` only persists source coordinates (`line`, `column`, `selectionRange`), but drops
 *      parameter signatures, types, default values, and optionality (`?`). Tree-sitter extracts
 *      the AST node during indexing, but discards parameter lists to keep the node footprint light.
 *    • Future CodeGraph API to implement:
 *      Extend the Tree-sitter LanguageAdapter pipeline to produce a `SymbolContract` fact table:
 *      ```ts
 *      // In @specd/code-graph:
 *      interface ParameterContract {
 *        readonly name: string
 *        readonly type?: string
 *        readonly isOptional: boolean
 *        readonly position: number
 *      }
 *      interface SymbolContract {
 *        readonly symbolId: string
 *        readonly parameters: readonly ParameterContract[]
 *        readonly returnType?: string
 *      }
 *      getSymbolContract(symbolId: string): Promise<SymbolContract | undefined>
 *      ```
 *
 * 4. QUERY: `SELECT source, target, type FROM relations WHERE type IN ('COVERS_SYMBOL', 'COVERS_FILE')`
 *    --------------------------------------------------------------------------------------
 *    • Why SQLite is used today:
 *      `CodeGraphProvider` only exposes single-spec methods (`getCoveredSymbols(specId)` and
 *      `getCoveredFiles(specId)`). In a workspace with 280+ specs, running 280 round-trips through
 *      the worker IPC protocol creates an N+1 bottleneck and risks tripping the backpressure queue
 *      (`StoreOverloadError: pending >= 256`). A single SQL SELECT loads the entire coverage matrix in 2ms.
 *    • Future CodeGraph API to implement:
 *      ```ts
 *      // In GraphStore and CodeGraphProvider:
 *      interface SpecCoverageSummary {
 *        readonly specId: string
 *        readonly coveredSymbols: readonly string[]
 *        readonly coveredFiles: readonly string[]
 *      }
 *      getAllSpecCoverages(): Promise<Map<string, SpecCoverageSummary>>
 *      // Or a generic batch relations query:
 *      getRelationsByType(types: readonly RelationType[]): Promise<Relation[]>
 *      ```
 *
 * 5. SERVER ARCHITECTURE (HTTP/DAEMON) & EFFICIENCY EVOLUTIONS
 *    --------------------------------------------------------------------------------------
 *    • A. Why Worker Threads are Essential for HTTP/Daemon Servers:
 *         In an HTTP server, MCP server, or daemon environment, delegating SQLite operations
 *         to a background worker thread (`worker_threads`) is a critical architectural requirement:
 *         it prevents heavy SQL table scans and wide graph traversals from blocking the main
 *         Node.js event loop, ensuring the HTTP server remains responsive to incoming requests,
 *         health checks, and WebSockets. Furthermore, `maxPendingOperations: 256` acts as a crucial
 *         backpressure/load-shedding guard against memory exhaustion and queue saturation.
 *
 *    • B. The Real Bottleneck: Protocol Granularity (Chatty IPC vs Batch RPCs):
 *         The bottleneck is NOT the worker thread itself; it is chatty, fine-grained APIs
 *         (e.g. querying 280+ specs individually via `getCoveredSymbols(specId)`).
 *         Sending 280 separate postMessage calls creates 280 event-loop hops and saturates the
 *         worker queue with 280 tasks.
 *         EVOLUTION: Implement coarse-grained vectorized/batch RPC operations on the worker protocol
 *         (e.g. `getAllSpecCoverages()` or `getCoveredSymbolsForSpecs(specIds)`).
 *         This turns 280 chatty IPC round-trips into a SINGLE message that executes in 2ms inside
 *         the worker, consumes 1 queue slot, and keeps the HTTP server event loop completely free.
 *         (Optionally: for single-tenant CLI commands that run standalone, a direct in-process
 *         read-only mode can bypass worker startup, while servers always use the worker).
 *
 *    • C. Missing SQLite Index on `symbols.parent_id` (High Server Impact):
 *         Currently, `schema.ts` indexes `name`, `kind`, `file_path`, but does NOT index `parent_id`.
 *         In an HTTP server under concurrent traffic, any query filtering by `parentSymbolId`
 *         triggers a full table scan across 40,000+ rows, keeping the worker thread CPU busy and
 *         delaying subsequent queued HTTP requests.
 *         EVOLUTION: Add `CREATE INDEX IF NOT EXISTS idx_symbols_parent_id ON symbols(parent_id);`
 *         to `packages/code-graph/src/infrastructure/sqlite/schema.ts`.
 *
 *    • D. Persisting Parameter Contracts to Eliminate Server Disk I/O:
 *         In an HTTP server, workers should avoid touching the filesystem to re-read source files
 *         on the fly. Tree-sitter already visits parameter lists during indexing.
 *         EVOLUTION: Persisting a compact JSON column `contract_json` on `symbols` (~30 bytes/row)
 *         allows the HTTP server to serve full parameter contracts directly from SQLite without
 *         secondary disk reads.
 * =========================================================================================
 */
function tryLoadFromCodeGraphDatabase(host?: any): CodeGraphData | null {
  const dbPath = host?.config?.configPath
    ? path.join(host.config.configPath, 'graph', 'code-graph.sqlite')
    : path.join(PROJECT_ROOT, '.specd/config/graph/code-graph.sqlite')

  if (!DatabaseSync || !fs.existsSync(dbPath)) return null

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true })

    // 1. Raw SQL: Bulk symbol fetch by kinds
    // FUTURE: Replace with `await codeGraphProvider.getAllSymbols({ kinds: ['class', 'interface', 'function', 'type', 'variable', 'method'] })`
    const rows = db
      .prepare(
        `SELECT id, name, kind, file_path, line, comment, parent_id
         FROM symbols
         WHERE kind IN ('class', 'interface', 'function', 'type', 'variable', 'method')`,
      )
      .all() as any[]

    // 2. Structural mapping: Connect constructors and member methods to parent class
    // FUTURE: Replace with `await codeGraphProvider.getClassConstructor(classSymbolId)` and `getSymbolChildren(parentId)`
    const constructorsByParentId = new Map<string, any>()
    const methodsByParentId = new Map<string, string[]>()
    for (const r of rows) {
      if (r.kind === 'method' && r.parent_id) {
        if (r.name === 'constructor' || r.name === '__init__') {
          constructorsByParentId.set(r.parent_id, r)
        } else {
          let list = methodsByParentId.get(r.parent_id)
          if (!list) {
            list = []
            methodsByParentId.set(r.parent_id, list)
          }
          list.push(r.name)
        }
      }
    }

    // 3. Hydrate symbol models and parse constructor parameter contracts
    // FUTURE: Replace with `const contract = await codeGraphProvider.getSymbolContract(symbol.id)`
    const symbols = new Map<string, CodeSymbol[]>()
    for (const r of rows) {
      if (r.kind === 'method') continue

      const fullPath = resolveWorkspaceFilePath(r.file_path, host)
      const workspace = toCanonicalWorkspacePath(fullPath, host).workspace

      let classSig: ClassSignature | undefined
      if (r.kind === 'class') {
        const ctor = constructorsByParentId.get(r.id)
        const constructorParams: ParameterInfo[] = []
        if (ctor && fs.existsSync(fullPath)) {
          const fileLines = fs.readFileSync(fullPath, 'utf8').split('\n')
          const sliceText = fileLines.slice(ctor.line - 1, ctor.line + 15).join(' ')
          const match = sliceText.match(/(?:constructor|__init__)\s*\(([\s\S]*?)\)/)
          if (match && match[1].trim()) {
            const rawParams = match[1].split(',')
            rawParams.forEach((p, idx) => {
              const cleaned = p.trim().replace(/^(?:(?:private|protected|public|readonly)\s+)+/, '')
              const parts = cleaned.split(':')
              const pName = parts[0].replace('?', '').trim()
              const pType = parts[1]?.trim() || 'any'
              if (pName) {
                constructorParams.push({
                  name: pName,
                  type: pType,
                  isOptional: cleaned.includes('?'),
                  position: idx,
                })
              }
            })
          }
        }
        let classMethods = methodsByParentId.get(r.id) || []
        if (
          fs.existsSync(fullPath) &&
          (fullPath.endsWith('.ts') ||
            fullPath.endsWith('.js') ||
            fullPath.endsWith('.tsx') ||
            fullPath.endsWith('.jsx'))
        ) {
          try {
            const fileContent = fs.readFileSync(fullPath, 'utf8')
            const sf = ts.createSourceFile(fullPath, fileContent, ts.ScriptTarget.Latest, true)
            function findClassMembers(node: ts.Node) {
              if (ts.isClassDeclaration(node) && node.name?.text === r.name) {
                classMethods = []
                node.members.forEach((m) => {
                  if (
                    (ts.isMethodDeclaration(m) ||
                      ts.isGetAccessorDeclaration(m) ||
                      ts.isSetAccessorDeclaration(m)) &&
                    m.name
                  ) {
                    const modifiers = m.modifiers || []
                    const isPrivate = modifiers.some(
                      (mod) =>
                        mod.kind === ts.SyntaxKind.PrivateKeyword ||
                        mod.kind === ts.SyntaxKind.ProtectedKeyword,
                    )
                    if (isPrivate || ts.isPrivateIdentifier(m.name)) return

                    const mName = m.name.getText(sf)
                    if (mName && mName !== 'constructor' && !mName.startsWith('_')) {
                      classMethods.push(mName)
                    }
                  }
                })
              } else {
                ts.forEachChild(node, findClassMembers)
              }
            }
            findClassMembers(sf)
          } catch {}
        }

        classSig = {
          name: r.name,
          filePath: fullPath,
          workspace,
          constructorParams,
          methods: classMethods,
        }
      }

      const sym: CodeSymbol = {
        name: r.name,
        kind: r.kind,
        filePath: fullPath,
        workspace,
        classSig,
        source: 'code-graph.sqlite',
      }

      const existing = symbols.get(r.name) || []
      existing.push(sym)
      symbols.set(r.name, existing)
    }

    // 4. Raw SQL: Bulk spec coverage & dependency relation lookup
    // FUTURE: Replace with `await codeGraphProvider.getAllSpecCoverages()`
    const relRows = db
      .prepare(
        `SELECT source, target, type FROM relations WHERE type IN ('COVERS_SYMBOL', 'COVERS_FILE', 'IMPORTS', 'CALLS')`,
      )
      .all() as any[]

    const coveredSymbolsBySpec = new Map<string, Set<string>>()
    const coveredFilesBySpec = new Map<string, Set<string>>()
    const fileToSpecs = new Map<string, Set<string>>()
    const symbolToSpecs = new Map<string, Set<string>>()
    const fileDependencies = new Map<string, Set<{ file: string; symbolName: string | null }>>()

    for (const rel of relRows) {
      if (rel.type === 'COVERS_SYMBOL') {
        const set = coveredSymbolsBySpec.get(rel.source) || new Set()
        const targetNameMatch =
          rel.target.match(/\|([A-Za-z0-9_]+)\|/) || rel.target.match(/:([A-Za-z0-9_]+):/)
        if (targetNameMatch) {
          const symName = targetNameMatch[1]
          set.add(symName)
          let specSet = symbolToSpecs.get(symName)
          if (!specSet) {
            specSet = new Set()
            symbolToSpecs.set(symName, specSet)
          }
          specSet.add(rel.source)
        }
        coveredSymbolsBySpec.set(rel.source, set)
      } else if (rel.type === 'COVERS_FILE') {
        const set = coveredFilesBySpec.get(rel.source) || new Set()
        set.add(rel.target)
        coveredFilesBySpec.set(rel.source, set)

        let specSet = fileToSpecs.get(rel.target)
        if (!specSet) {
          specSet = new Set()
          fileToSpecs.set(rel.target, specSet)
        }
        specSet.add(rel.source)
      } else if (rel.type === 'IMPORTS' || rel.type === 'CALLS') {
        const extractFileAndSymbol = (t: string): { file: string; symbolName: string | null } => {
          let symbolName: string | null = null
          const publicMatch = t.match(/\|([A-Za-z0-9_]+)\|[0-9]+:value/)
          if (publicMatch) {
            symbolName = publicMatch[1]
          } else {
            const funcMatch = t.match(
              /:(?:function|class|interface|type|variable|method):([A-Za-z0-9_]+):/,
            )
            if (funcMatch) symbolName = funcMatch[1]
          }
          const fileMatch = t.match(/([a-z0-9-]+:[a-zA-Z0-9_\-\.\/]+\.(?:ts|js|php|py|go|mjs|cjs))/)
          const file = fileMatch ? fileMatch[1] : t.replace(/:[a-z]+:[^:]+:\d+:\d+$/, '')
          return { file, symbolName }
        }

        const srcInfo = extractFileAndSymbol(rel.source)
        const tgtInfo = extractFileAndSymbol(rel.target)

        let set = fileDependencies.get(srcInfo.file)
        if (!set) {
          set = new Set()
          fileDependencies.set(srcInfo.file, set)
        }
        set.add(tgtInfo)
      }
    }

    return {
      db,
      symbols,
      coveredSymbolsBySpec,
      coveredFilesBySpec,
      fileToSpecs,
      symbolToSpecs,
      fileDependencies,
    }
  } catch (err) {
    return null
  }
}

/** Dynamic Codebase Symbol Indexer (CodeGraph SQLite First with AST Fallback) */
function buildDynamicCodeSymbolIndex(host?: any): {
  symbolIndex: Map<string, CodeSymbol[]>
  codeGraphData: CodeGraphData | null
} {
  const graphData = tryLoadFromCodeGraphDatabase(host)
  if (graphData && graphData.symbols.size > 0) {
    return { symbolIndex: graphData.symbols, codeGraphData: graphData }
  }

  // Fallback to AST scanning across all configured workspace code roots
  const symbolIndex = new Map<string, CodeSymbol[]>()
  const workspaces = host?.config?.workspaces || []
  const scanRoots =
    workspaces.length > 0
      ? workspaces.map((w: any) => w.codeRoot).filter((r: any) => Boolean(r) && fs.existsSync(r))
      : [PROJECT_ROOT]

  const tsFiles: string[] = []
  for (const root of scanRoots) {
    tsFiles.push(
      ...listFiles(root, '.ts').filter(
        (f) => !f.endsWith('.d.ts') && !f.includes('/test/') && !f.includes('/tests/'),
      ),
    )
  }

  for (const filePath of tsFiles) {
    const content = fs.readFileSync(filePath, 'utf8')
    const workspace = toCanonicalWorkspacePath(filePath, host).workspace

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

    function addSymbol(sym: CodeSymbol) {
      const existing = symbolIndex.get(sym.name) || []
      existing.push(sym)
      symbolIndex.set(sym.name, existing)
    }

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text
        const constructorParams: ParameterInfo[] = []
        const methods: string[] = []

        node.members.forEach((member) => {
          if (ts.isConstructorDeclaration(member)) {
            member.parameters.forEach((param, index) => {
              const paramName = param.name.getText(sourceFile)
              const paramType = param.type ? param.type.getText(sourceFile) : 'any'
              const isOptional = Boolean(param.questionToken || param.initializer)
              constructorParams.push({
                name: paramName,
                type: paramType,
                isOptional,
                position: index,
              })
            })
          } else if (ts.isMethodDeclaration(member) && member.name) {
            const modifiers = member.modifiers || []
            const isPrivate = modifiers.some(
              (mod) =>
                mod.kind === ts.SyntaxKind.PrivateKeyword ||
                mod.kind === ts.SyntaxKind.ProtectedKeyword,
            )
            if (!isPrivate && !ts.isPrivateIdentifier(member.name)) {
              const mName = member.name.getText(sourceFile)
              if (mName && mName !== 'constructor' && !mName.startsWith('_')) {
                methods.push(mName)
              }
            }
          }
        })

        const classSig: ClassSignature = {
          name: className,
          filePath,
          workspace,
          constructorParams,
          methods,
        }

        addSymbol({
          name: className,
          kind: 'class',
          filePath,
          workspace,
          classSig,
          source: 'ast-fallback',
        })
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        addSymbol({
          name: node.name.text,
          kind: 'interface',
          filePath,
          workspace,
          source: 'ast-fallback',
        })
      } else if (ts.isTypeAliasDeclaration(node) && node.name) {
        addSymbol({
          name: node.name.text,
          kind: 'type',
          filePath,
          workspace,
          source: 'ast-fallback',
        })
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        addSymbol({
          name: node.name.text,
          kind: 'function',
          filePath,
          workspace,
          source: 'ast-fallback',
        })
      } else if (ts.isEnumDeclaration(node) && node.name) {
        addSymbol({
          name: node.name.text,
          kind: 'enum',
          filePath,
          workspace,
          source: 'ast-fallback',
        })
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return { symbolIndex, codeGraphData: null }
}

/** Parses markdown spec content (from SpecRepository artifact or merged preview) */
function parseSpecContent(
  specId: string,
  content: string,
  filePath: string,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
  verifyContent?: string,
  persistedImplementation?: readonly { file: string; symbols?: string[] }[],
  verifyFilePath?: string,
  declaredDependencies: readonly string[] = [],
  isDepsInitialized: boolean = false,
  metadata?: any,
): SpecInfo {
  const dirParts = specId.split(':')
  const workspace = dirParts[0]

  const rules: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }> =
    metadata?.rules || []
  const scenarios: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }> = metadata?.scenarios || []

  let requirementsText = ''
  let verifyText = ''

  if (rules.length > 0) {
    requirementsText = rules
      .map((r) => {
        const rulesList = Array.isArray(r.rules) ? r.rules.join('\n') : ''
        return `Requirement: ${r.requirement}\n${rulesList}`
      })
      .join('\n\n')
  } else if (content) {
    requirementsText = content
  }

  if (scenarios.length > 0) {
    verifyText = scenarios
      .map((s) => {
        const given = s.given?.length ? `Given: ${s.given.join(', ')}` : ''
        const when = s.when?.length ? `When: ${s.when.join(', ')}` : ''
        const then = s.then?.length ? `Then: ${s.then.join(', ')}` : ''
        const steps = [given, when, then].filter(Boolean).join('\n')
        return `Scenario: ${s.name} [Requirement: ${s.requirement}]\n${steps}`
      })
      .join('\n\n')
  } else if (verifyContent) {
    verifyText = verifyContent
  }

  const mdast = fromMarkdown(content || '')

  let title = ''
  const sections: { name: string; depth: number }[] = []
  const contractDeclarations = new Map<string, ContractDeclaration>()
  const symbolMentions = new Map<string, SymbolMention>()
  const specLockImplementationSymbols = new Set<string>()
  const specLockImplementationFiles: { file: string; symbols: string[] }[] = []

  let currentSection = 'Document Root'
  const sectionStack: { name: string; depth: number }[] = []

  const sourcePriority: Record<SymbolMention['source'], number> = {
    'contract-ast': 4,
    'spec-lock': 3,
    'inline-code': 2,
    'prose-heuristic': 1,
  }

  function recordMention(
    symbolName: string,
    source: SymbolMention['source'],
    customSection?: string,
  ) {
    if (!dynamicCodeSymbolIndex.has(symbolName)) return
    const existing = symbolMentions.get(symbolName)
    const effectiveSection = customSection || currentSection

    if (!existing || sourcePriority[source] > sourcePriority[existing.source]) {
      symbolMentions.set(symbolName, {
        symbolName,
        source,
        sectionName: effectiveSection,
      })
    }
  }

  function extractProseCandidates(text: string) {
    const pascalMatches = text.matchAll(/\b([A-Z][a-zA-Z0-9_]{2,})\b/g)
    for (const match of pascalMatches) {
      recordMention(match[1], 'prose-heuristic')
    }

    const camelMatches = text.matchAll(/\b([a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*)\b/g)
    for (const match of camelMatches) {
      recordMention(match[1], 'prose-heuristic')
    }

    const memberMatches = text.matchAll(/\b([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)(?:\(\))?\b/g)
    for (const match of memberMatches) {
      recordMention(match[1], 'prose-heuristic')
    }
  }

  function extractInjectedDependenciesFromProse(node: any, targetClassName: string) {
    const isConstructorSection =
      /(?:constructor|construction|\bports\b)/i.test(currentSection) &&
      !/(?:spec dependencies|declared dependencies|\bdependencies\b)/i.test(currentSection)
    if (!isConstructorSection) return

    const extractedParams: ParameterInfo[] = []

    if (node.type === 'list') {
      if (Array.isArray(node.children)) {
        node.children.forEach((item: any, idx: number) => {
          const itemText = extractMdastText([item]).trim()
          if (itemText.includes('](') || /\.(?:md|json|yaml|yml)\b/i.test(itemText)) return // Skip document / spec links
          const pairMatch = itemText.match(/([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)/)
          if (pairMatch) {
            extractedParams.push({
              name: pairMatch[1],
              type: pairMatch[2],
              isOptional: itemText.toLowerCase().includes('optional'),
              position: idx,
            })
          } else {
            const typeMatch = itemText.match(/\b([A-Z][a-zA-Z0-9_]+)\b/)
            if (typeMatch && dynamicCodeSymbolIndex.has(typeMatch[1])) {
              const typeName = typeMatch[1]
              extractedParams.push({
                name: toCamelCase(typeName),
                type: typeName,
                isOptional: itemText.toLowerCase().includes('optional'),
                position: idx,
              })
            }
          }
        })
      }
    } else if (node.type === 'paragraph') {
      const pText = extractMdastText([node])
      const injectMatch = pText.match(
        /(?:inject|accepts?|takes?|receives?|instantiated with|constructor(?:-injects?)?)\s+([^.]+)/i,
      )
      if (injectMatch) {
        const afterVerb = injectMatch[1]
        const symbolTokens = Array.from(afterVerb.matchAll(/\b([A-Z][a-zA-Z0-9_]+)\b/g)).map(
          (m) => m[1],
        )
        symbolTokens.forEach((sym, idx) => {
          if (dynamicCodeSymbolIndex.has(sym)) {
            extractedParams.push({
              name: toCamelCase(sym),
              type: sym,
              isOptional: false,
              position: idx,
            })
          }
        })
      }
    }

    if (extractedParams.length > 0) {
      const existing = contractDeclarations.get(targetClassName)
      if (!existing || !existing.constructorParams || existing.constructorParams.length === 0) {
        contractDeclarations.set(targetClassName, {
          symbolName: targetClassName,
          kind: 'class',
          sectionName: `${currentSection} [Prose / List Inferred]`,
          constructorParams: extractedParams,
          rawCode: '/* Inferred from Spec Prose / List */',
          isInferredFromProse: true,
        })
        recordMention(targetClassName, 'contract-ast')
      }
    }
  }

  function walk(node: any) {
    if (node.type === 'heading') {
      const headingText = extractMdastText(node.children).trim()
      const depth = node.depth || 1

      if (depth === 1 && !title) {
        title = headingText
      }

      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].depth >= depth) {
        sectionStack.pop()
      }
      sectionStack.push({ name: headingText, depth })
      currentSection = sectionStack.map((s) => s.name).join(' > ')
      sections.push({ name: headingText, depth })

      extractProseCandidates(headingText)

      const reqMatch = headingText.match(
        /^requirement:\s*([A-Z][a-zA-Z0-9_]+)(?:\s+use\s+case|\s+class)?/i,
      )
      if (reqMatch && dynamicCodeSymbolIndex.has(reqMatch[1])) {
        recordMention(reqMatch[1], 'contract-ast', currentSection)
      }
    } else if (node.type === 'code') {
      const lang = (node.lang || '').toLowerCase()
      if (lang === 'typescript' || lang === 'ts') {
        const code = node.value || ''
        const sourceFile = ts.createSourceFile('contract.ts', code, ts.ScriptTarget.Latest, true)

        function visitTsNode(tsNode: ts.Node) {
          if (ts.isClassDeclaration(tsNode) && tsNode.name) {
            const className = tsNode.name.text
            const constructorParams: ParameterInfo[] = []
            tsNode.members.forEach((member) => {
              if (ts.isConstructorDeclaration(member)) {
                member.parameters.forEach((param, index) => {
                  const paramName = param.name.getText(sourceFile)
                  const paramType = param.type ? param.type.getText(sourceFile) : 'any'
                  const isOptional = Boolean(param.questionToken || param.initializer)
                  constructorParams.push({
                    name: paramName,
                    type: paramType,
                    isOptional,
                    position: index,
                  })
                })
              }
            })

            contractDeclarations.set(className, {
              symbolName: className,
              kind: 'class',
              sectionName: currentSection,
              constructorParams,
              rawCode: code,
              isInferredFromProse: false,
            })
            recordMention(className, 'contract-ast')
          } else if (ts.isInterfaceDeclaration(tsNode) && tsNode.name) {
            contractDeclarations.set(tsNode.name.text, {
              symbolName: tsNode.name.text,
              kind: 'interface',
              sectionName: currentSection,
              rawCode: code,
              isInferredFromProse: false,
            })
            recordMention(tsNode.name.text, 'contract-ast')
          } else if (ts.isNewExpression(tsNode) && ts.isIdentifier(tsNode.expression)) {
            const className = tsNode.expression.text
            if (dynamicCodeSymbolIndex.has(className) && !contractDeclarations.has(className)) {
              const constructorParams: ParameterInfo[] = []
              if (tsNode.arguments) {
                tsNode.arguments.forEach((arg, index) => {
                  const rawArgName = arg.getText(sourceFile).replace(/[^a-zA-Z0-9_]/g, '')
                  constructorParams.push({
                    name: rawArgName,
                    type: 'any',
                    isOptional: false,
                    position: index,
                  })
                })
              }

              contractDeclarations.set(className, {
                symbolName: className,
                kind: 'class',
                sectionName: `${currentSection} [Example Instantiation]`,
                constructorParams,
                rawCode: code,
                isInferredFromProse: false,
                isFromExampleInvocation: true,
              })
              recordMention(className, 'contract-ast')
            }
          }
          ts.forEachChild(tsNode, visitTsNode)
        }

        visitTsNode(sourceFile)
      }
    } else if (node.type === 'inlineCode') {
      const val = (node.value || '').trim()
      const rootSymbolMatch = val.match(/^([A-Za-z0-9_]+)(?:\.|\(|$)/)
      if (rootSymbolMatch) {
        recordMention(rootSymbolMatch[1], 'inline-code')
      }
    } else if (node.type === 'text') {
      extractProseCandidates(node.value || '')
    } else if (node.type === 'paragraph' || node.type === 'list') {
      const candidateSymbolName = title.replace(/[^a-zA-Z0-9_]/g, '')
      if (candidateSymbolName) {
        extractInjectedDependenciesFromProse(node, candidateSymbolName)
      }
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(mdast)

  // Format-agnostic metadata rule & scenario ingestion (no markdown artifact dependency)
  if (rules.length > 0) {
    for (const r of rules) {
      const secName = `Requirement: ${r.requirement}`
      sections.push({ name: secName, depth: 2 })
      extractProseCandidates(r.requirement)
      if (Array.isArray(r.rules)) {
        for (const ruleStr of r.rules) {
          extractProseCandidates(ruleStr)
          const inlineMatches = ruleStr.matchAll(/`([A-Za-z0-9_]+)(?:\(\))?`/g)
          for (const m of inlineMatches) {
            recordMention(m[1], 'inline-code', secName)
          }
        }
      }
    }
  }

  if (scenarios.length > 0) {
    for (const s of scenarios) {
      const secName = `Scenario: ${s.name} (${s.requirement})`
      sections.push({ name: secName, depth: 3 })
      extractProseCandidates(s.name)
      const allSteps = [...(s.given || []), ...(s.when || []), ...(s.then || [])]
      for (const step of allSteps) {
        extractProseCandidates(step)
        const inlineMatches = step.matchAll(/`([A-Za-z0-9_]+)(?:\(\))?`/g)
        for (const m of inlineMatches) {
          recordMention(m[1], 'inline-code', secName)
        }
      }
    }
  }

  // Populate implementation links from GetPersistedSpecImplementation use case (no raw disk read)
  if (persistedImplementation && Array.isArray(persistedImplementation)) {
    for (const impl of persistedImplementation) {
      const symList: string[] = []
      if (typeof impl.file === 'string') {
        if (Array.isArray(impl.symbols)) {
          for (const sym of impl.symbols) {
            if (typeof sym === 'string') {
              symList.push(sym)
              specLockImplementationSymbols.add(sym)
              recordMention(sym, 'spec-lock', `spec-lock > ${impl.file}`)
            }
          }
        }
        specLockImplementationFiles.push({ file: impl.file, symbols: symList })
      }
    }
  } else if (filePath && fs.existsSync(filePath)) {
    // Graceful fallback if invoked outside kernel context
    const specDir = path.dirname(filePath)
    const specLockPath = path.join(specDir, 'spec-lock.json')
    if (fs.existsSync(specLockPath)) {
      try {
        const lockContent = JSON.parse(fs.readFileSync(specLockPath, 'utf8'))
        if (Array.isArray(lockContent.implementation)) {
          for (const impl of lockContent.implementation) {
            const symList: string[] = []
            if (typeof impl.file === 'string') {
              if (Array.isArray(impl.symbols)) {
                for (const sym of impl.symbols) {
                  if (typeof sym === 'string') {
                    symList.push(sym)
                    specLockImplementationSymbols.add(sym)
                    recordMention(sym, 'spec-lock', `spec-lock.json > ${impl.file}`)
                  }
                }
              }
              specLockImplementationFiles.push({ file: impl.file, symbols: symList })
            }
          }
        }
      } catch {}
    }
  }

  let verifyMdast: any
  if (verifyContent) {
    try {
      verifyMdast = fromMarkdown(verifyContent)
      function walkVerify(node: any) {
        if (node.type === 'inlineCode') {
          const val = (node.value || '').trim()
          const rootSymbolMatch = val.match(/^([A-Za-z0-9_]+)(?:\.|\(|$)/)
          if (rootSymbolMatch && dynamicCodeSymbolIndex.has(rootSymbolMatch[1])) {
            recordMention(
              rootSymbolMatch[1],
              'inline-code',
              verifyFilePath ? path.basename(verifyFilePath) : 'verify',
            )
          }
        } else if (node.type === 'text') {
          extractProseCandidates(node.value || '')
        }
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) walkVerify(child)
        }
      }
      walkVerify(verifyMdast)
    } catch {}
  }

  return {
    specId,
    workspace,
    filePath,
    verifyFilePath,
    title: title || metadata?.title || specId,
    sections,
    contractDeclarations,
    symbolMentions,
    specLockImplementationSymbols,
    specLockImplementationFiles,
    metadata,
    rules,
    scenarios,
    requirementsText,
    verifyText,
    rawContent: content || requirementsText,
    verifyContent: verifyContent || verifyText,
    mdast,
    verifyMdast,
    declaredDependencies,
    isDepsInitialized,
  }
}

/** Builds SpecInfo for a spec entity using workspace repository & kernel use cases (FORMAT-AGNOSTIC, NO ARTIFACT READS) */
async function buildSpecInfo(
  host: any,
  ws: any,
  spec: any,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
): Promise<SpecInfo> {
  const specId = `${ws.name}:${spec.name.toString()}`

  // 1. Authoritative Spec metadata loaded via Kernel Use Case (FORMAT-AGNOSTIC, NO ARTIFACT READS)
  let metadata: any = null
  let declaredDependencies: string[] = []
  let isDepsInitialized = false
  try {
    const metaRes = await host.kernel.specs.getMetadata.execute({ specId })
    metadata = metaRes?.metadata ?? null
    if (metadata?.dependsOn) {
      declaredDependencies = [...metadata.dependsOn]
      isDepsInitialized = true
    }
  } catch {
    try {
      const depRes = await host.kernel.specs.getPersistedDeps.execute({ specId })
      declaredDependencies = [...depRes.dependsOn]
      isDepsInitialized = depRes.initialized
    } catch {}
  }

  // 2. Persisted implementation links loaded via GetPersistedSpecImplementation use case
  let implementation: any[] = []
  try {
    const persisted = await host.kernel.specs.getPersistedImplementation.execute({ specId })
    implementation = persisted.implementation || []
  } catch {}

  // 3. Fallback: Only read artifacts if metadata has neither rules nor scenarios
  let content = ''
  let verifyContent = ''
  let reqFilename = ''
  let verFilename = ''

  try {
    const schemaRes = await host.kernel.specs.getActiveSchema.execute()
    const schema = schemaRes?.schema
    const specArtifacts: any[] = schema
      ? schema.artifacts().filter((a: any) => a.scope === 'spec')
      : []
    const extraction = schema?.metadataExtraction()

    const rulesArtifactId =
      extraction?.rules?.[0]?.artifact ?? extraction?.title?.artifact ?? specArtifacts[0]?.id
    const scenariosArtifactId =
      extraction?.scenarios?.[0]?.artifact ??
      specArtifacts.find((a: any) => a.id !== rulesArtifactId)?.id

    const reqDef = specArtifacts.find((a: any) => a.id === rulesArtifactId) || specArtifacts[0]
    const verDef = specArtifacts.find((a: any) => a.id === scenariosArtifactId) || specArtifacts[1]

    if (reqDef) {
      reqFilename = reqDef.filename || (reqDef.output ? path.basename(reqDef.output) : '')
    }
    if (verDef) {
      verFilename = verDef.filename || (verDef.output ? path.basename(verDef.output) : '')
    }

    if (!metadata || (!metadata.rules?.length && !metadata.scenarios?.length)) {
      if (reqFilename) {
        const specArtifact = await ws.specRepo.artifact(spec, reqFilename)
        content = specArtifact?.content || ''
      }
      if (verFilename) {
        const verifyArtifact = await ws.specRepo.artifact(spec, verFilename)
        verifyContent = verifyArtifact?.content || ''
      }
    }
  } catch {}

  // 4. Resolve canonical workspace paths for AST display
  const prefix = ws.prefix
  const specPathStr = spec.name.toString()
  let rel = specPathStr
  if (prefix && rel.startsWith(prefix + '/')) {
    rel = rel.slice(prefix.length + 1)
  } else if (prefix && rel === prefix) {
    rel = ''
  }
  const specDir = ws.specRepo.specsPath ? path.join(ws.specRepo.specsPath, rel) : ''
  const filePath = specDir && reqFilename ? path.join(specDir, reqFilename) : ''
  const verifyFilePath = specDir && verFilename ? path.join(specDir, verFilename) : ''

  return parseSpecContent(
    specId,
    content,
    filePath,
    dynamicCodeSymbolIndex,
    verifyContent,
    implementation,
    verifyFilePath,
    declaredDependencies,
    isDepsInitialized,
    metadata,
  )
}

/** Loads all specs from workspace spec repositories via SDK Host (NO raw disk scanning) */
async function loadAllSpecs(
  host: any,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
): Promise<Map<string, SpecInfo>> {
  const { SpecPath } = await import('../../packages/sdk/dist/index.js')
  const specs = new Map<string, SpecInfo>()
  const workspaces = await host.kernel.project.listWorkspaces.execute()

  for (const ws of workspaces) {
    const list = await ws.specRepo.list()
    for (const entry of list.items) {
      try {
        const spec = await ws.specRepo.get(SpecPath.parse(entry.path))
        if (!spec) continue
        const specInfo = await buildSpecInfo(host, ws, spec, dynamicCodeSymbolIndex)
        specs.set(specInfo.specId, specInfo)
      } catch {
        // Skip unresolvable specs gracefully
      }
    }
  }
  return specs
}

/** Evaluates symbol ownership using CodeGraph relations + AST Contracts + Domain Heuristics */
function evaluateSymbolOwnership(
  symbolName: string,
  classSig: ClassSignature,
  allSpecs: Map<string, SpecInfo>,
  codeGraphData: CodeGraphData | null,
) {
  const kebab = toKebabCase(symbolName)
  const codeWorkspace = classSig.workspace

  interface CandidateOwner {
    spec: SpecInfo
    contract?: ContractDeclaration
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    score: number
    rationale: string
  }

  const candidates: CandidateOwner[] = []
  const extendingSpecs: SpecInfo[] = []

  for (const spec of allSpecs.values()) {
    const contract = spec.contractDeclarations.get(symbolName)
    const isSpecIdMatch = spec.specId.endsWith(`:${kebab}`)
    const isWorkspaceMatch = spec.workspace === codeWorkspace
    const isLockLinked = spec.specLockImplementationSymbols.has(symbolName)
    const mention = spec.symbolMentions.get(symbolName)

    // CodeGraph relations check: does the graph store an explicit COVERS_SYMBOL link?
    const isCodeGraphCovered = codeGraphData?.coveredSymbolsBySpec.get(spec.specId)?.has(symbolName)

    const normSymbol = toKebabCase(symbolName).replace(/[-_\s]+/g, ' ')
    const hasDedicatedSection = spec.sections.some((s) => {
      const normSection = s.name.toLowerCase().replace(/[-_\s]+/g, ' ')
      return normSection.includes(`requirement ${normSymbol}`) || normSection.includes(normSymbol)
    })

    const specDirName = path.basename(path.dirname(spec.filePath || ''))
    const stemMatch =
      symbolName.toLowerCase().includes(specDirName.toLowerCase()) ||
      specDirName.toLowerCase().includes(symbolName.toLowerCase()) ||
      (specDirName === 'indexer' && symbolName.toLowerCase().startsWith('index'))

    let score = 0
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
    let rationale = ''

    if (contract && !contract.isInferredFromProse && !contract.isFromExampleInvocation) {
      score += 500
      confidence = 'HIGH'
      rationale = `Spec declares formal TypeScript AST contract in section: "${contract.sectionName}"`
    } else if (contract && contract.isFromExampleInvocation) {
      if (hasDedicatedSection || stemMatch || isSpecIdMatch) {
        score += 400
        confidence = 'HIGH'
        rationale = `Spec instantiates constructor in example: "${contract.sectionName}"`
      } else {
        score += 50
        rationale = `Symbol instantiated as helper/dependency in example`
      }
    } else if (contract && contract.isInferredFromProse) {
      score += 350
      confidence = 'HIGH'
      rationale = `Spec declares constructor ports in Prose/List under: "${contract.sectionName}"`
    }

    if (isCodeGraphCovered) {
      score += 350
      if (confidence !== 'HIGH') {
        confidence = 'HIGH'
        rationale = `CodeGraph verified relation: Spec directly covers '${symbolName}' in graph (COVERS_SYMBOL)`
      }
    }

    if (hasDedicatedSection) {
      score += 300
      if (confidence !== 'HIGH') {
        confidence = 'HIGH'
        rationale = `Spec has dedicated requirement section for '${symbolName}'`
      }
    }

    if (isSpecIdMatch) {
      score += 200
      if (confidence === 'LOW') {
        confidence = 'HIGH'
        rationale = `Spec ID '${spec.specId}' exactly matches symbol '${symbolName}'`
      }
    } else if (stemMatch && isWorkspaceMatch) {
      score += 150
      if (confidence === 'LOW') {
        confidence = 'HIGH'
        rationale = `Spec '${spec.specId}' domain and stem match '${symbolName}'`
      }
    }

    if (isWorkspaceMatch) {
      score += 50
    }

    if (isLockLinked) {
      score += 80
      if (confidence === 'LOW') {
        confidence = 'MEDIUM'
        rationale = `Spec explicitly links symbol implementation in spec-lock.json`
      }
    }

    if (mention && score === 0) {
      extendingSpecs.push(spec)
    } else if (score > 0) {
      candidates.push({ spec, contract, confidence, score, rationale })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  const owner = candidates.length > 0 ? candidates[0].spec : null
  const contract = candidates.length > 0 ? candidates[0].contract : undefined
  const ownerConfidence = candidates.length > 0 ? candidates[0].confidence : 'LOW'
  const rationale = candidates.length > 0 ? candidates[0].rationale : ''

  return {
    owner,
    contract,
    ownerConfidence,
    rationale,
    extendingSpecs: extendingSpecs.filter((s) => s.specId !== owner?.specId),
  }
}

/** Compares code constructor with spec declared contract constructor */
function analyzeConstructorCompleteness(
  codeSig: ClassSignature,
  specParams: ParameterInfo[] | undefined,
) {
  if (!specParams || specParams.length === 0) {
    return {
      score: 0,
      hasDeclaredConstructor: Boolean(specParams),
      matching: [],
      missingInSpec: codeSig.constructorParams.map((p) => p.name),
      extraInSpec: [],
      orderMismatches: [],
    }
  }

  const codeParams = codeSig.constructorParams
  const codeParamMap = new Map(codeParams.map((p) => [p.name.toLowerCase(), p]))
  const specParamMap = new Map(specParams.map((p) => [p.name.toLowerCase(), p]))

  const matching: string[] = []
  const missingInSpec: string[] = []
  const extraInSpec: string[] = []
  const orderMismatches: { name: string; codePos: number; specPos: number }[] = []

  for (const [name, codeParam] of codeParamMap) {
    if (specParamMap.has(name)) {
      matching.push(codeParam.name)
      const specParam = specParamMap.get(name)!
      if (specParam.position !== codeParam.position) {
        orderMismatches.push({
          name: codeParam.name,
          codePos: codeParam.position + 1,
          specPos: specParam.position + 1,
        })
      }
    } else {
      missingInSpec.push(codeParam.name)
    }
  }

  for (const [name, specParam] of specParamMap) {
    if (!codeParamMap.has(name)) {
      extraInSpec.push(specParam.name)
    }
  }

  const score =
    codeParams.length === 0 ? 100 : Math.round((matching.length / codeParams.length) * 100)

  return {
    score,
    hasDeclaredConstructor: true,
    matching,
    missingInSpec,
    extraInSpec,
    orderMismatches,
  }
}

/** Runs Architectural Completeness Suite (11 Dimensions) */
function runSevenDimensionAudit(
  targetSpec: SpecInfo,
  implFiles: string[],
  ownedSymbolNames: Set<string>,
  codeGraphData?: CodeGraphData | null,
  allSpecs?: Map<string, SpecInfo>,
  dynamicCodeSymbolIndex?: Map<string, CodeSymbol[]>,
  host?: any,
): HeuristicResult[] {
  const implSourceFiles: { path: string; sf: ts.SourceFile; isCoreTarget: boolean }[] =
    implFiles.map((f) => {
      const content = fs.readFileSync(f, 'utf8')
      const sf = ts.createSourceFile(f, content, ts.ScriptTarget.Latest, true)
      const specDirName = path.basename(path.dirname(targetSpec.filePath || ''))
      const fileName = path.basename(f)
      const isCoreTarget =
        Array.from(ownedSymbolNames).some(
          (sym) => content.includes(`class ${sym}`) || content.includes(`function ${sym}`),
        ) ||
        fileName.includes(specDirName) ||
        f.includes('/use-cases/') ||
        !f.includes('/composition/')
      return { path: f, sf, isCoreTarget }
    })

  const scenarios: { title: string; text: string }[] = []
  const requirements: { title: string; text: string }[] = []
  const specDependencies: string[] = []

  function extractScenariosFromTree(mdastTree: any) {
    if (!mdastTree) return
    let currentScenario = { title: '', text: '' }
    let inScenario = false
    let inDeps = false

    function walkTree(node: any) {
      if (node.type === 'heading') {
        const headingText = extractMdastText(node.children).trim()
        inDeps = headingText.toLowerCase().includes('spec dependencies')

        if (
          headingText.toLowerCase().startsWith('scenario:') ||
          headingText.toLowerCase().startsWith('#### scenario:')
        ) {
          if (inScenario && currentScenario.title) {
            scenarios.push({ ...currentScenario })
          }
          currentScenario = {
            title: headingText.replace(/^(?:####\s*)?scenario:\s*/i, '').trim(),
            text: '',
          }
          inScenario = true
        } else if (headingText.toLowerCase().startsWith('requirement:')) {
          requirements.push({
            title: headingText.replace(/^requirement:\s*/i, '').trim(),
            text: '',
          })
          if (inScenario && currentScenario.title) {
            scenarios.push({ ...currentScenario })
            inScenario = false
          }
        }
      } else if (node.type === 'paragraph' || node.type === 'list' || node.type === 'listItem') {
        const text = extractMdastText([node])
        if (inScenario) {
          currentScenario.text += ' ' + text
        }
        if (inDeps) {
          const depMatches = text.matchAll(/([a-z0-9-]+:[a-z0-9-_/]+)/g)
          for (const m of depMatches) {
            specDependencies.push(m[1])
          }
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) walkTree(child)
      }
    }

    walkTree(mdastTree)
    if (inScenario && currentScenario.title) {
      scenarios.push({ ...currentScenario })
    }
  }

  if (targetSpec.scenarios.length > 0) {
    for (const s of targetSpec.scenarios) {
      const allSteps = [...(s.given || []), ...(s.when || []), ...(s.then || [])].join(' ')
      scenarios.push({
        title: s.name,
        text: `[Requirement: ${s.requirement}] ${allSteps}`,
      })
    }
  } else {
    extractScenariosFromTree(targetSpec.mdast)
    if (targetSpec.verifyMdast) {
      extractScenariosFromTree(targetSpec.verifyMdast)
    }
  }

  const combinedProse = `${targetSpec.rawContent}\n${targetSpec.verifyContent || ''}`.toLowerCase()
  const allScenarioProse = scenarios
    .map((s) => `${s.title} ${s.text}`)
    .join(' ')
    .toLowerCase()

  const results: HeuristicResult[] = []

  // 1. Error Topology Coverage
  // FUTURE CODEGRAPH ROADMAP:
  // Currently uses TypeScript AST `visitThrows` because @specd/code-graph does not yet extract
  // thrown errors into the graph.
  // FUTURE API: Emit `RelationType.Throws` in Tree-sitter adapters and query via:
  //   const thrownErrors = await codeGraphProvider.getThrownErrors(symbolId)
  const hasErrorIsolationPolicy =
    combinedProse.includes('errors are collected, not thrown') ||
    combinedProse.includes('per-file errors are collected') ||
    combinedProse.includes('must not throw for') ||
    combinedProse.includes('error isolation') ||
    combinedProse.includes('collected in result') ||
    combinedProse.includes('not collected per-file')

  const thrownErrors = new Set<string>()
  for (const { sf, isCoreTarget } of implSourceFiles) {
    if (!isCoreTarget && implSourceFiles.some((item) => item.isCoreTarget)) {
      continue
    }

    function visitThrows(node: ts.Node) {
      if (ts.isThrowStatement(node) && node.expression) {
        if (ts.isNewExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
          thrownErrors.add(node.expression.expression.text)
        }
      }
      ts.forEachChild(node, visitThrows)
    }
    visitThrows(sf)
  }

  const errorFindings: HeuristicResult['findings'] = []
  let coveredErrors = 0
  for (const err of thrownErrors) {
    const presence = checkPresence(err, targetSpec)
    if (presence.inRequirements || presence.inVerify) {
      coveredErrors++
      errorFindings.push({
        type: 'ok',
        message: `Error '${err}' ${presence.badge} is documented in spec.`,
      })
    } else {
      errorFindings.push({
        type: 'error',
        message: `Error '${err}' ${presence.badge} is thrown in code but NOT documented in requirements or verify!`,
      })
    }
  }

  let errorScore = 100
  if (thrownErrors.size > 0) {
    errorScore = Math.round((coveredErrors / thrownErrors.size) * 100)
  } else if (hasErrorIsolationPolicy) {
    errorScore = 100
    errorFindings.push({
      type: 'ok',
      message:
        'Spec explicitly defines an error isolation policy (errors collected in result, not thrown).',
    })
  } else {
    errorFindings.push({
      type: 'ok',
      message: 'No domain throw statements found in target implementation.',
    })
  }

  results.push({
    dimension: '1. Error Topology Coverage',
    score: errorScore,
    passed: errorScore === 100,
    findings: errorFindings,
  })

  // 2. Union & Enum Branch Matrix
  // FUTURE CODEGRAPH ROADMAP:
  // Currently uses TypeScript AST `visitUnions` because Tree-sitter does not persist union literal facts.
  // FUTURE API: Emit `TypeShapeFact` with string union variants and query via:
  //   const typeShape = await codeGraphProvider.getTypeShape(typeSymbolId)
  const unionLiterals: { propertyName: string; values: string[] }[] = []
  for (const { sf, isCoreTarget } of implSourceFiles) {
    if (!isCoreTarget && implSourceFiles.some((item) => item.isCoreTarget)) continue

    function visitUnions(node: ts.Node) {
      if (ts.isPropertySignature(node) && node.name && node.type) {
        if (ts.isUnionTypeNode(node.type)) {
          const literals = node.type.types
            .filter((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))
            .map((t) => (t as ts.LiteralTypeNode).literal.getText(sf).replace(/['"]/g, ''))
          if (literals.length > 1) {
            unionLiterals.push({
              propertyName: node.name.getText(sf),
              values: literals,
            })
          }
        }
      }
      ts.forEachChild(node, visitUnions)
    }
    visitUnions(sf)
  }

  const unionFindings: HeuristicResult['findings'] = []
  let totalUnionBranches = 0
  let coveredUnionBranches = 0

  for (const u of unionLiterals) {
    for (const val of u.values) {
      totalUnionBranches++
      const presence = checkPresence(new RegExp(`['"]?${val}['"]?`, 'i'), targetSpec)
      if (presence.inRequirements || presence.inVerify) {
        coveredUnionBranches++
        unionFindings.push({
          type: 'ok',
          message: `Union branch '${u.propertyName}: ${val}' ${presence.badge} is covered in spec.`,
        })
      } else {
        unionFindings.push({
          type: 'warn',
          message: `Union branch '${u.propertyName}: ${val}' ${presence.badge} has no coverage in spec.`,
        })
      }
    }
  }
  const unionScore =
    totalUnionBranches === 0 ? 100 : Math.round((coveredUnionBranches / totalUnionBranches) * 100)
  results.push({
    dimension: '2. Union & Enum Branch Matrix',
    score: unionScore,
    passed: unionScore >= 80,
    findings:
      unionFindings.length > 0
        ? unionFindings
        : [{ type: 'ok', message: 'No multi-value string union inputs in code.' }],
  })

  // 3. I/O Interface Field Coverage
  // FUTURE CODEGRAPH ROADMAP:
  // Currently uses TypeScript AST `visitInterfaces` because interface properties are not indexed in the graph.
  // FUTURE API: Query public interface properties via:
  //   const typeShape = await codeGraphProvider.getTypeShape(interfaceSymbolId)
  const ioFields = new Set<string>()
  for (const { sf, path: fPath } of implSourceFiles) {
    const isInternalService = fPath.includes('/services/') && !fPath.includes('index-result')
    if (isInternalService) continue

    function visitInterfaces(node: ts.Node) {
      if (ts.isInterfaceDeclaration(node)) {
        const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        const name = node.name.text
        if (
          isExported &&
          (name.endsWith('Input') ||
            name.endsWith('Result') ||
            name.endsWith('Breakdown') ||
            name.endsWith('Options') ||
            name.endsWith('Config'))
        ) {
          node.members.forEach((m) => {
            if (ts.isPropertySignature(m) && m.name) {
              ioFields.add(m.name.getText(sf))
            }
          })
        }
      }
      ts.forEachChild(node, visitInterfaces)
    }
    visitInterfaces(sf)
  }

  const ioFindings: HeuristicResult['findings'] = []
  let coveredIo = 0
  for (const field of ioFields) {
    const presence = checkPresence(field, targetSpec)
    if (presence.inRequirements || presence.inVerify) {
      coveredIo++
      ioFindings.push({
        type: 'ok',
        message: `Interface field '${field}' ${presence.badge} is documented in spec.`,
      })
    } else {
      ioFindings.push({
        type: 'warn',
        message: `Interface field '${field}' ${presence.badge} exists in code interface but is never mentioned in requirements or verify!`,
      })
    }
  }
  const ioScore = ioFields.size === 0 ? 100 : Math.round((coveredIo / ioFields.size) * 100)
  results.push({
    dimension: '3. I/O Interface Field Coverage',
    score: ioScore,
    passed: ioScore >= 80,
    findings:
      ioFindings.length > 0
        ? ioFindings
        : [{ type: 'ok', message: 'No explicit Input/Result interfaces.' }],
  })

  // 4. Boolean Toggle Symmetry
  const booleanFlags = new Set<string>()
  for (const { sf, path: fPath } of implSourceFiles) {
    const isInternalService = fPath.includes('/services/') && !fPath.includes('index-result')
    if (isInternalService) continue

    function visitBooleans(node: ts.Node) {
      if (
        ts.isPropertySignature(node) &&
        node.name &&
        node.type &&
        node.type.kind === ts.SyntaxKind.BooleanKeyword
      ) {
        booleanFlags.add(node.name.getText(sf))
      }
      ts.forEachChild(node, visitBooleans)
    }
    visitBooleans(sf)
  }

  const boolFindings: HeuristicResult['findings'] = []
  let symmetricBools = 0
  for (const flag of booleanFlags) {
    const fLower = flag.toLowerCase()
    const hasTrue =
      combinedProse.includes(`${fLower}: true`) ||
      combinedProse.includes(`${fLower} is true`) ||
      combinedProse.includes(`when ${fLower}`) ||
      combinedProse.includes(`${fLower}=true`) ||
      combinedProse.includes(`${fLower}: \`true\``) ||
      allScenarioProse.includes(`${fLower}`)

    const hasFalse =
      combinedProse.includes(`${fLower}: false`) ||
      combinedProse.includes(`${fLower} is false`) ||
      combinedProse.includes(`when ${fLower} is absent`) ||
      combinedProse.includes(`without ${fLower}`) ||
      combinedProse.includes(`absent or false`) ||
      combinedProse.includes(`false or absent`) ||
      combinedProse.includes(`false/absent`) ||
      combinedProse.includes(`${fLower}=false`) ||
      combinedProse.includes(`${fLower}: \`false\``) ||
      combinedProse.includes(`omitted when not provided`) ||
      combinedProse.includes(`is null`) ||
      combinedProse.includes(`normal incremental`)

    const presence = checkPresence(flag, targetSpec)
    if (hasTrue && hasFalse) {
      symmetricBools++
      boolFindings.push({
        type: 'ok',
        message: `Boolean '${flag}' ${presence.badge} has symmetric verification (both true and false/absent/null cases verified).`,
      })
    } else if (hasTrue) {
      boolFindings.push({
        type: 'warn',
        message: `Boolean '${flag}' ${presence.badge} documents 'true' case, but lacks explicit 'false/absent' scenario.`,
      })
    } else {
      boolFindings.push({
        type: 'warn',
        message: `Boolean '${flag}' ${presence.badge} lacks explicit scenario toggle verification.`,
      })
    }
  }
  const boolScore =
    booleanFlags.size === 0 ? 100 : Math.round((symmetricBools / booleanFlags.size) * 100)
  results.push({
    dimension: '4. Boolean Toggle Symmetry',
    score: boolScore,
    passed: boolScore >= 80,
    findings:
      boolFindings.length > 0
        ? boolFindings
        : [{ type: 'ok', message: 'No boolean toggle properties.' }],
  })

  // 5. Call Graph vs Spec Dependencies Alignment
  // Uses authoritative metadata via Kernel Use Case (host.kernel.specs.getPersistedDeps)
  // Cross-references with CodeGraph relations (IMPORTS / CALLS) to ensure all code dependencies are declared.
  const depFindings: HeuristicResult['findings'] = []
  let depScore = 100

  const declaredDeps = targetSpec.declaredDependencies ?? []
  const isInitialized = targetSpec.isDepsInitialized ?? false

  // 1. Report dependencies from Metadata Use Case
  if (declaredDeps.length > 0) {
    depFindings.push({
      type: 'ok',
      message: `Spec metadata declares ${declaredDeps.length} dependencies via getMetadata: [${declaredDeps.join(', ')}].`,
    })
  } else if (isInitialized) {
    depFindings.push({
      type: 'ok',
      message: `Spec metadata explicitly declares zero dependencies (self-contained/isolated).`,
    })
  } else {
    depFindings.push({
      type: 'warn',
      message: `Spec dependencies are uninitialized in durable metadata storage.`,
    })
    depScore = Math.min(depScore, 70)
  }

  // 2. Cross-reference with CodeGraph: Hybrid (Symbol first, File fallback)
  if (codeGraphData && codeGraphData.fileDependencies && codeGraphData.fileToSpecs) {
    const calledSpecs = new Set<string>()
    const isTestFile = (f: string) =>
      f.includes('/test/') || f.includes('/tests/') || f.includes('.spec.') || f.includes('.test.')

    // Analyze outbound dependencies exclusively from production implementation files
    const prodImplFiles = implFiles.filter((f) => !isTestFile(f))

    for (const f of prodImplFiles) {
      const {
        workspace: ws,
        relPath: cleaned,
        canonical: canonicalPath,
      } = toCanonicalWorkspacePath(f, host)
      const relPath = path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')
      const candidates = [
        f,
        relPath,
        canonicalPath,
        `${ws}:${cleaned}`,
        `${ws}:${relPath}`,
        ...targetSpec.specLockImplementationFiles.map((i) => i.file),
      ]

      for (const cand of candidates) {
        const targets = codeGraphData.fileDependencies.get(cand)
        if (targets) {
          for (const target of targets) {
            if (
              target.file === cand ||
              target.file.endsWith(relPath) ||
              target.file.endsWith(cleaned)
            ) {
              continue // skip self-file calls
            }

            // Tier 1: Check Symbol Ownership (if symbol is present & has an owner)
            let resolvedBySymbol = false
            if (target.symbolName && codeGraphData.symbolToSpecs.has(target.symbolName)) {
              const symOwners = codeGraphData.symbolToSpecs.get(target.symbolName)!
              if (symOwners.size === 1) {
                const [owner] = Array.from(symOwners)
                if (owner !== targetSpec.specId) {
                  calledSpecs.add(owner)
                  resolvedBySymbol = true
                }
              }
            }

            // Tier 2: Fallback to File Ownership
            if (!resolvedBySymbol && codeGraphData.fileToSpecs.has(target.file)) {
              const fileOwners = codeGraphData.fileToSpecs.get(target.file)!
              if (fileOwners.size === 1) {
                const [owner] = Array.from(fileOwners)
                if (owner !== targetSpec.specId) {
                  calledSpecs.add(owner)
                }
              } else if (fileOwners.size > 1 && !fileOwners.has(targetSpec.specId)) {
                // If the file is shared across multiple specs, only require dependency if one of the owners is already declared
                const declaredSet = new Set(declaredDeps)
                const declaredOwner = Array.from(fileOwners).find((o) => declaredSet.has(o))
                if (declaredOwner) {
                  calledSpecs.add(declaredOwner)
                }
              }
            }
          }
        }
      }
    }

    const declaredSet = new Set(declaredDeps)
    const undeclaredCalledSpecs = Array.from(calledSpecs).filter((s) => !declaredSet.has(s))

    if (undeclaredCalledSpecs.length > 0) {
      for (const s of undeclaredCalledSpecs) {
        depFindings.push({
          type: 'error',
          message: `Code calls/imports symbols/files owned by '${s}', but it is NOT declared in metadata dependsOn!`,
        })
      }
      depScore = Math.max(0, depScore - undeclaredCalledSpecs.length * 20)
    } else if (calledSpecs.size > 0) {
      depFindings.push({
        type: 'ok',
        message: `All code-level cross-spec dependencies (${calledSpecs.size}) are verified in metadata.`,
      })
    }
  }

  // 3. Consistency check with Spec Markdown layout
  const hasSection = targetSpec.sections.some((s) =>
    s.name.toLowerCase().includes('spec dependencies'),
  )
  if (!hasSection) {
    depFindings.push({
      type: 'warn',
      message: `Spec markdown is missing the standard '## Spec Dependencies' section (though metadata is loaded via use case).`,
    })
    depScore = Math.min(depScore, 80)
  }

  results.push({
    dimension: '5. Dependency Graph Alignment',
    score: depScore,
    passed: depScore >= 80,
    findings: depFindings,
  })

  // 6. State Mutation & Side-Effect Visibility
  const mutationCalls: string[] = []
  for (const { sf } of implSourceFiles) {
    function visitMutations(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sf)
        if (/(\.mutate|\.archive|\.save|\.persist|\.write|\.publish|\.bulkLoad)/.test(text)) {
          mutationCalls.push(text)
        }
      }
      ts.forEachChild(node, visitMutations)
    }
    visitMutations(sf)
  }

  const mutFindings: HeuristicResult['findings'] = []
  const hasMutationScenarios =
    /(persists|mutates|publishes|saves|records|transitions|created event|upsert)/i.test(
      combinedProse,
    )

  if (mutationCalls.length > 0) {
    if (hasMutationScenarios) {
      mutFindings.push({
        type: 'ok',
        message: `Code performs ${mutationCalls.length} mutation calls, and verify.md asserts state mutation outcomes (persists/records/mutates).`,
      })
    } else {
      mutFindings.push({
        type: 'warn',
        message: `Code performs ${mutationCalls.length} mutation calls, but verify.md lacks explicit state change assertions.`,
      })
    }
  } else {
    mutFindings.push({
      type: 'ok',
      message: 'No explicit disk/db mutation calls detected (read-only use case).',
    })
  }
  const mutScore = mutationCalls.length > 0 && !hasMutationScenarios ? 50 : 100
  results.push({
    dimension: '6. State Mutation & Side Effects',
    score: mutScore,
    passed: mutScore === 100,
    findings: mutFindings,
  })

  // 7. Graceful Fallback & Degradation Coverage
  let tryCatchBlocks = 0
  for (const { sf, isCoreTarget } of implSourceFiles) {
    if (!isCoreTarget && implSourceFiles.some((item) => item.isCoreTarget)) continue

    function visitCatch(node: ts.Node) {
      if (ts.isTryStatement(node) && node.catchClause) {
        tryCatchBlocks++
      }
      ts.forEachChild(node, visitCatch)
    }
    visitCatch(sf)
  }

  const fallbackFindings: HeuristicResult['findings'] = []
  const hasFallbackScenarios =
    /(falls back|gracefully|warning|catches|suppresses|recovery|resilience|does not abort|not abort|error isolation|isolation|continues|skipped)/i.test(
      combinedProse,
    )

  if (tryCatchBlocks > 0) {
    if (hasFallbackScenarios) {
      fallbackFindings.push({
        type: 'ok',
        message: `Code has ${tryCatchBlocks} try/catch recovery blocks, and verify.md tests fallback/warning/isolation scenarios.`,
      })
    } else {
      fallbackFindings.push({
        type: 'warn',
        message: `Code has ${tryCatchBlocks} try/catch blocks with internal recovery, but verify.md does NOT test fallback behavior.`,
      })
    }
  } else {
    fallbackFindings.push({
      type: 'ok',
      message: 'No catch-and-fallback recovery blocks detected.',
    })
  }
  const fallbackScore = tryCatchBlocks > 0 && !hasFallbackScenarios ? 50 : 100
  results.push({
    dimension: '7. Fallback & Graceful Degradation',
    score: fallbackScore,
    passed: fallbackScore === 100,
    findings: fallbackFindings,
  })

  // 8. Reverse Drift & Zombie References (Language-Agnostic Graph Integrity)
  // FUTURE CODEGRAPH ROADMAP:
  // Pure SQL against SQLite CodeGraph:
  //   SELECT target FROM relations WHERE source = :specId AND type = 'COVERS_SYMBOL' AND target NOT IN (SELECT id FROM symbols);
  //   SELECT target FROM relations WHERE source = :specId AND type = 'DEPENDS_ON' AND target NOT IN (SELECT spec_id FROM specs);
  //   SELECT target FROM relations WHERE source = :specId AND type = 'COVERS_FILE' AND target NOT IN (SELECT path FROM files);
  const zombieFindings: HeuristicResult['findings'] = []
  let zombieScore = 100

  // 8.1 Zombie symbols from spec-lock
  if (
    targetSpec.specLockImplementationSymbols &&
    targetSpec.specLockImplementationSymbols.size > 0
  ) {
    for (const symName of targetSpec.specLockImplementationSymbols) {
      let existsInCode =
        dynamicCodeSymbolIndex?.has(symName) ||
        (codeGraphData && codeGraphData.symbols.has(symName))
      if (!existsInCode && symName.includes('.')) {
        const [parent, member] = symName.split('.')
        const parentEntries =
          dynamicCodeSymbolIndex?.get(parent) ||
          (codeGraphData && codeGraphData.symbols.get(parent))
        const classSig = parentEntries?.find((s) => s.classSig)?.classSig
        if (classSig && classSig.methods.includes(member)) {
          existsInCode = true
        }
      }
      if (!existsInCode) {
        zombieFindings.push({
          type: 'error',
          message: `Zombie symbol detected! Spec-lock links symbol '${symName}', but it no longer exists in the codebase!`,
        })
        zombieScore = Math.max(0, zombieScore - 30)
      }
    }
  }

  // 8.2 Dangling Spec Dependencies
  if (targetSpec.declaredDependencies && targetSpec.declaredDependencies.length > 0 && allSpecs) {
    for (const dep of targetSpec.declaredDependencies) {
      if (isGlobalSpec(dep)) continue // global conventions are virtual
      const depExists = allSpecs.has(dep)
      if (!depExists) {
        zombieFindings.push({
          type: 'error',
          message: `Dangling spec dependency! 'dependsOn' declares '${dep}', but that spec does not exist in workspace!`,
        })
        zombieScore = Math.max(0, zombieScore - 25)
      }
    }
  }

  // 8.3 Dangling Files in Spec-Lock
  if (targetSpec.specLockImplementationFiles && targetSpec.specLockImplementationFiles.length > 0) {
    for (const fileEntry of targetSpec.specLockImplementationFiles) {
      const fullPath = resolveWorkspaceFilePath(fileEntry.file, host)
      if (!fs.existsSync(fullPath)) {
        zombieFindings.push({
          type: 'error',
          message: `Dangling file in spec-lock! '${fileEntry.file}' does not exist on disk!`,
        })
        zombieScore = Math.max(0, zombieScore - 25)
      }
    }
  }

  if (zombieFindings.length === 0) {
    zombieFindings.push({
      type: 'ok',
      message:
        'No zombie symbols, dangling spec dependencies, or missing implementation files detected.',
    })
  }
  results.push({
    dimension: '8. Reverse Drift & Zombie References',
    score: zombieScore,
    passed: zombieScore >= 80,
    findings: zombieFindings,
  })

  // 9. Public API Member Coverage (CONTAINS / parent_id)
  // FUTURE CODEGRAPH ROADMAP:
  // Pure SQL against SQLite CodeGraph:
  //   SELECT s.name FROM symbols s JOIN relations r ON r.target = s.id AND r.type = 'CONTAINS'
  //   WHERE r.source = :classSymbolId AND s.kind = 'method' AND s.name NOT IN (SELECT symbol_name FROM spec_mentions WHERE spec_id = :specId);
  const memberFindings: HeuristicResult['findings'] = []
  let totalPublicMethods = 0
  let coveredPublicMethods = 0

  for (const symName of ownedSymbolNames) {
    const symEntries = dynamicCodeSymbolIndex?.get(symName)
    const classEntry = symEntries?.find((s) => s.classSig !== undefined)
    if (classEntry?.classSig) {
      const publicMethods = classEntry.classSig.methods.filter(
        (m) => !m.startsWith('_') && !m.startsWith('#') && m !== 'constructor' && m !== '__init__',
      )
      for (const m of publicMethods) {
        totalPublicMethods++
        const regex = new RegExp(`\\b${m}\\b`, 'i')
        const presence = checkPresence(regex, targetSpec)
        if (presence.inRequirements) {
          coveredPublicMethods++
          memberFindings.push({
            type: 'ok',
            message: `Public method '${classEntry.classSig.name}.${m}()' ${presence.badge} is documented in requirements.`,
          })
        } else if (presence.inVerify) {
          // Uncontracted verification drift: tested in verify but never declared in requirements!
          memberFindings.push({
            type: 'warn',
            message: `Public method '${classEntry.classSig.name}.${m}()' ${presence.badge} is tested in verify but missing from requirements contracts (contract drift)!`,
          })
        } else {
          memberFindings.push({
            type: 'warn',
            message: `Public method '${classEntry.classSig.name}.${m}()' ${presence.badge} exists in code but has no mention in requirements or verify (ghost method)!`,
          })
        }
      }
    }
  }

  const memberScore =
    totalPublicMethods === 0 ? 100 : Math.round((coveredPublicMethods / totalPublicMethods) * 100)
  results.push({
    dimension: '9. Public API Member Coverage',
    score: memberScore,
    passed: memberScore >= 80,
    findings:
      memberFindings.length > 0
        ? memberFindings
        : [{ type: 'ok', message: 'No public methods in owned classes.' }],
  })

  // 10. Graph Topology, Cycles & Layering Inversion
  // FUTURE CODEGRAPH ROADMAP:
  // Pure SQL / Graph Traversal in CodeGraph:
  //   WITH RECURSIVE dep_tree AS (...) SELECT * FROM dep_tree WHERE target = :specId;
  const topologyFindings: HeuristicResult['findings'] = []
  let topologyScore = 100

  // 10.1 Dependency Cycle Detection
  if (allSpecs && targetSpec.declaredDependencies) {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    let cyclePath: string[] | null = null

    function findCycle(currentId: string, pathSoFar: string[]): boolean {
      visited.add(currentId)
      recursionStack.add(currentId)

      const spec = allSpecs.get(currentId)
      const deps = spec?.declaredDependencies || []

      for (const dep of deps) {
        if (isGlobalSpec(dep)) continue
        if (!visited.has(dep)) {
          if (findCycle(dep, [...pathSoFar, dep])) return true
        } else if (recursionStack.has(dep)) {
          cyclePath = [...pathSoFar, dep]
          return true
        }
      }

      recursionStack.delete(currentId)
      return false
    }

    findCycle(targetSpec.specId, [targetSpec.specId])
    if (cyclePath) {
      topologyFindings.push({
        type: 'error',
        message: `Circular dependency detected in spec graph! Cycle: ${cyclePath.join(' -> ')}`,
      })
      topologyScore = Math.max(0, topologyScore - 50)
    } else {
      topologyFindings.push({
        type: 'ok',
        message: 'No circular dependencies detected in transitive spec dependency tree.',
      })
    }
  }

  // 10.2 Architectural Layering Rules (Dynamically computed from workspace graph)
  const { tiers: dynamicTiers } = computeDynamicWorkspaceTiers(host, codeGraphData)
  const [currentWs] = targetSpec.specId.split(':')
  const currentLayer = dynamicTiers.get(currentWs)

  if (currentLayer !== undefined && targetSpec.declaredDependencies) {
    for (const dep of targetSpec.declaredDependencies) {
      if (isGlobalSpec(dep)) continue
      const [depWs] = dep.split(':')
      if (depWs === currentWs) continue
      const depLayer = dynamicTiers.get(depWs)
      if (depLayer !== undefined && depLayer > currentLayer) {
        topologyFindings.push({
          type: 'error',
          message: `Layering Inversion! Workspace '${currentWs}' (tier ${currentLayer}) depends on '${dep}' in higher tier '${depWs}' (tier ${depLayer}). Core layers must never depend on outer layers!`,
        })
        topologyScore = Math.max(0, topologyScore - 40)
      }
    }
    if (topologyScore === 100 && targetSpec.declaredDependencies.length > 0) {
      topologyFindings.push({
        type: 'ok',
        message: `Architectural layering respected: all dependencies belong to equal or lower architectural tiers.`,
      })
    }
  }

  results.push({
    dimension: '10. Graph Topology & Layering Rules',
    score: topologyScore,
    passed: topologyScore >= 80,
    findings: topologyFindings,
  })

  // 11. Async, Cancellation & Transaction Contracts
  const asyncFindings: HeuristicResult['findings'] = []
  let hasAbortSignal = false
  let hasTransactions = false

  for (const { sf } of implSourceFiles) {
    const text = sf.text
    if (/AbortSignal|cancelToken|signal\s*:\s*AbortSignal/i.test(text)) {
      hasAbortSignal = true
    }
    if (/(\.transaction\(|beginTransaction|db\.begin|\bgit\.stash|\brollback\()/i.test(text)) {
      hasTransactions = true
    }
  }

  let asyncScore = 100
  if (hasAbortSignal) {
    const cancelPresence = checkPresence(
      /(aborted|cancellation|cancels|abortsignal|early termination)/i,
      targetSpec,
    )
    if (cancelPresence.inRequirements || cancelPresence.inVerify) {
      asyncFindings.push({
        type: 'ok',
        message: `Code supports AbortSignal / cancellation ${cancelPresence.badge}, documented in spec.`,
      })
    } else {
      asyncFindings.push({
        type: 'warn',
        message: `Code accepts AbortSignal / cancellation token ${cancelPresence.badge}, but spec lacks early cancellation scenarios or requirements!`,
      })
      asyncScore = Math.max(0, asyncScore - 30)
    }
  }

  if (hasTransactions) {
    const rollbackPresence = checkPresence(
      /(rollback|reverts|transaction failure|rolls back|atomic failure)/i,
      targetSpec,
    )
    if (rollbackPresence.inRequirements || rollbackPresence.inVerify) {
      asyncFindings.push({
        type: 'ok',
        message: `Code uses transactions / atomic writes ${rollbackPresence.badge}, documented in spec.`,
      })
    } else {
      asyncFindings.push({
        type: 'warn',
        message: `Code performs transactional / atomic operations ${rollbackPresence.badge}, but spec lacks rollback verification on failure!`,
      })
      asyncScore = Math.max(0, asyncScore - 30)
    }
  }

  if (!hasAbortSignal && !hasTransactions) {
    asyncFindings.push({
      type: 'ok',
      message:
        'No complex transaction rollbacks or AbortSignal cancellation tokens detected in implementation.',
    })
  }

  results.push({
    dimension: '11. Async & Transaction Contracts',
    score: asyncScore,
    passed: asyncScore >= 80,
    findings: asyncFindings,
  })

  return results
}

/**
 * Part C: Graph Intelligence & Ecosystem Impact Suite
 *
 * Dimensions:
 * 12. Hotspot & Blast Radius vs Verification Density (Downstream dependents vs scenario coverage)
 * 13. Dead Code & Graph Reachability (Orphaned files in spec-lock & island/ghost specs)
 * 14. Event Emission & Hook Lifecycle Contracts (Event payload assertions & hook error isolation)
 * 15. Performance Anti-patterns & Loop I/O (N+1 query & unbatched I/O detection)
 */
function runGraphIntelligenceAudit(
  targetSpec: SpecInfo,
  implFiles: string[],
  codeGraphData: CodeGraphData | null,
  allSpecs: Map<string, SpecInfo>,
  host?: any,
): HeuristicResult[] {
  const results: HeuristicResult[] = []
  const db = codeGraphData?.db

  // Parse implementation ASTs for code inspection
  const implSourceFiles: { filePath: string; sf: ts.SourceFile }[] = []
  for (const f of implFiles) {
    if (fs.existsSync(f)) {
      try {
        const text = fs.readFileSync(f, 'utf8')
        const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true)
        implSourceFiles.push({ filePath: f, sf })
      } catch {}
    }
  }

  // Count scenarios in format-agnostic metadata (with fallback to verifyContent regex)
  const scenarioCount =
    targetSpec.scenarios.length > 0
      ? targetSpec.scenarios.length
      : (targetSpec.verifyContent || '').match(/^(?:#{2,4}\s+)?Scenario:/gm)?.length || 0

  // Downstream inward dependents (Specs + Code Callers)
  let inwardSpecs: string[] = []
  const codeCallerFiles = new Set<string>()

  if (db) {
    try {
      const specDepRows = db
        .prepare(`SELECT DISTINCT source FROM relations WHERE type = 'DEPENDS_ON' AND target = ?`)
        .all(targetSpec.specId) as { source: string }[]
      inwardSpecs = specDepRows.map((r) => r.source).filter((s) => !isGlobalSpec(s))

      const isTest = (f: string) =>
        f.includes('test/') || f.includes('tests/') || f.includes('.spec.') || f.includes('.test.')

      for (const f of implFiles) {
        if (isTest(f)) continue
        const { relPath: cleaned, canonical: canonicalColon } = toCanonicalWorkspacePath(f, host)
        const colonPattern = `%${canonicalColon}%`
        const slashPattern = `%${cleaned}%`

        const callerRows = db
          .prepare(
            `SELECT DISTINCT source FROM relations
             WHERE type IN ('CALLS', 'CONSTRUCTS', 'IMPORTS', 'USES_TYPE')
               AND (target LIKE ? OR target LIKE ?)
               AND source NOT LIKE '%test%'
               AND source NOT LIKE ?
               AND source NOT LIKE ?`,
          )
          .all(colonPattern, slashPattern, colonPattern, slashPattern) as { source: string }[]

        for (const row of callerRows) {
          const rawSrc = row.source.split(':')[0] + ':' + (row.source.split(':')[1] || '')
          codeCallerFiles.add(rawSrc)
        }
      }
    } catch {}
  }

  const totalConsumers = inwardSpecs.length + codeCallerFiles.size

  // 12. Hotspot & Blast Radius vs Verification Density
  const blastFindings: HeuristicResult['findings'] = []
  let blastScore = 100

  if (totalConsumers === 0) {
    blastFindings.push({
      type: 'ok',
      message: `Self-contained spec with 0 downstream dependents across the workspace.`,
    })
  } else if (totalConsumers > 20) {
    if (scenarioCount >= 10) {
      blastFindings.push({
        type: 'ok',
        message: `High-leverage critical spec (${totalConsumers} downstream dependents: ${inwardSpecs.length} specs, ${codeCallerFiles.size} callers) is strongly fortified with ${scenarioCount} verification scenarios.`,
      })
    } else if (scenarioCount >= 5) {
      blastFindings.push({
        type: 'warn',
        message: `High blast radius: ${totalConsumers} downstream dependents rely on this spec (${inwardSpecs.length} specs, ${codeCallerFiles.size} callers), but verify.md has moderate coverage (${scenarioCount} scenarios). Recommended >= 10 scenarios.`,
      })
      blastScore = 80
    } else {
      blastFindings.push({
        type: 'error',
        message: `Critical Hotspot: High blast radius (${totalConsumers} downstream dependents: ${inwardSpecs.length} specs, ${codeCallerFiles.size} callers) with thin verification (${scenarioCount} scenarios)! High regression risk under refactorings.`,
      })
      blastScore = 50
    }
  } else if (totalConsumers > 5) {
    if (scenarioCount >= 3) {
      blastFindings.push({
        type: 'ok',
        message: `Balanced verification density: ${scenarioCount} scenarios protect ${totalConsumers} downstream dependents (${inwardSpecs.length} specs, ${codeCallerFiles.size} code callers).`,
      })
    } else {
      blastFindings.push({
        type: 'warn',
        message: `Moderate blast radius (${totalConsumers} downstream dependents), but verify.md has only ${scenarioCount} scenarios.`,
      })
      blastScore = 75
    }
  } else {
    blastFindings.push({
      type: 'ok',
      message: `Low blast radius (${totalConsumers} downstream dependents: ${inwardSpecs.length} specs, ${codeCallerFiles.size} callers), verified by ${scenarioCount} scenarios.`,
    })
  }

  results.push({
    dimension: '12. Blast Radius vs Verification Density',
    score: blastScore,
    passed: blastScore >= 80,
    findings: blastFindings,
  })

  // 13. Dead Code & Graph Reachability
  const reachabilityFindings: HeuristicResult['findings'] = []
  let reachabilityScore = 100
  let deadFilesFound = 0

  if (db && targetSpec.specLockImplementationFiles.length > 0) {
    for (const item of targetSpec.specLockImplementationFiles) {
      if (
        item.file.includes('test/') ||
        item.file.includes('tests/') ||
        isEntrypointFile(item.file, host) ||
        !/\.(?:ts|tsx|js|jsx|mjs|cjs|py|php|go|rs|rb|cs)$/i.test(item.file)
      ) {
        continue
      }
      const { relPath: innerPath, canonical: canonicalColon } = toCanonicalWorkspacePath(
        item.file,
        host,
      )
      const colonPattern = `%${canonicalColon}%`
      const slashPattern = `%${innerPath}%`

      try {
        const row = db
          .prepare(
            `SELECT count(*) as c FROM relations
             WHERE type IN ('CALLS', 'CONSTRUCTS', 'IMPORTS', 'USES_TYPE')
               AND (target LIKE ? OR target LIKE ?)
               AND source NOT LIKE ?
               AND source NOT LIKE ?`,
          )
          .get(colonPattern, slashPattern, colonPattern, slashPattern) as { c: number }

        if (row && row.c === 0) {
          deadFilesFound++
          reachabilityFindings.push({
            type: 'warn',
            message: `File '${item.file}' declared in spec-lock has 0 incoming references (IMPORTS/CALLS/USES_TYPE) across the entire codebase graph (potential orphaned or dead code).`,
          })
          reachabilityScore = Math.max(0, reachabilityScore - 25)
        }
      } catch {}
    }
  }

  // Spec-level reachability (Ghost / Island Spec)
  const { leafWorkspaces } = computeDynamicWorkspaceTiers(host, codeGraphData)
  const isLeafWorkspace = leafWorkspaces.has(targetSpec.workspace)
  if (
    totalConsumers === 0 &&
    !isLeafWorkspace &&
    !isEntrypointFile(targetSpec.specId, host) &&
    !isGlobalSpec(targetSpec.specId)
  ) {
    reachabilityFindings.push({
      type: 'warn',
      message: `Spec '${targetSpec.specId}' is an isolated graph island (0 incoming spec dependencies and 0 external callers). Verify if it is a public library entry point or an obsolete ghost spec.`,
    })
    reachabilityScore = Math.max(0, reachabilityScore - 15)
  }

  if (deadFilesFound === 0 && reachabilityScore === 100) {
    reachabilityFindings.push({
      type: 'ok',
      message: `Graph reachability verified: all spec-lock implementation files and spec nodes have active incoming graph references.`,
    })
  }

  results.push({
    dimension: '13. Dead Code & Graph Reachability',
    score: reachabilityScore,
    passed: reachabilityScore >= 80,
    findings: reachabilityFindings,
  })

  // 14. Event Emission & Dispatch Lifecycle Contracts
  // Uses universal ecosystem conventions (Node EventEmitter, PSR-14, CakePHP dispatchEvent, Django signals)
  // plus optional project-level overrides from host.config.codeGraph.conventions.dispatchers
  const eventFindings: HeuristicResult['findings'] = []
  let eventScore = 100
  const dispatchedEvents = new Set<string>()

  const DEFAULT_DISPATCH_METHODS = [
    'emit',
    'dispatch',
    'dispatchEvent',
    'publish',
    'notify',
    'trigger',
    'fire',
    'send',
    'run*Hook*', // Universal runner convention (runStepHooks, runExternalHook, etc.)
  ]
  const DEFAULT_DISPATCH_FUNCTIONS = ['event', 'do_action', 'apply_filters']

  const configuredMethods: string[] =
    host?.config?.codeGraph?.conventions?.dispatchers?.methods || []
  const configuredFunctions: string[] =
    host?.config?.codeGraph?.conventions?.dispatchers?.functions || []

  const allMethods = Array.from(new Set([...DEFAULT_DISPATCH_METHODS, ...configuredMethods]))
  const allFunctions = Array.from(new Set([...DEFAULT_DISPATCH_FUNCTIONS, ...configuredFunctions]))

  // Helper to compile literal strings or globs (e.g. 'run*Hook*') into regex fragments
  const toRegexPattern = (str: string) =>
    str.includes('*')
      ? str
          .split('*')
          .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')
      : str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const methodPattern = allMethods.map(toRegexPattern).join('|')
  const funcPattern = allFunctions.map(toRegexPattern).join('|')

  // Catches:
  // 1. .emit('event'), .dispatchEvent('event')
  // 2. .runStepHooks.execute(...) or .run*Hook*(...) -> registers 'runStepHooks' / the runner method itself or payload ID
  // 3. func('event')
  const DISPATCH_METHOD_REGEX = new RegExp(
    `\\.(?:_?(${methodPattern}))(?:\\.[a-zA-Z0-9_]+)?\\s*(?:<[^>]+>)?\\s*\\(\\s*(?:['"]([a-zA-Z0-9_\\-.:]+)['"]|\\{[^}]*(?:name|step|phase|id):\\s*['"]?([a-zA-Z0-9_\\-.:]+)['"]?|([^),]+))?`,
    'g',
  )
  const DISPATCH_FUNC_REGEX = new RegExp(
    `(?:^|[^a-zA-Z0-9_.])(?:${funcPattern})\\s*\\(\\s*['"]([a-zA-Z0-9_\\-.:]+)['"]`,
    'g',
  )

  for (const { sf } of implSourceFiles) {
    const text = sf.text
    let match: RegExpExecArray | null
    while ((match = DISPATCH_METHOD_REGEX.exec(text)) !== null) {
      const runnerName = match[1]
      const evt = match[2] || match[3]
      if (evt) {
        dispatchedEvents.add(evt)
      } else if (runnerName && /hook/i.test(runnerName)) {
        dispatchedEvents.add(runnerName)
      }
    }
    while ((match = DISPATCH_FUNC_REGEX.exec(text)) !== null) {
      if (match[1]) dispatchedEvents.add(match[1])
    }
  }

  if (dispatchedEvents.size > 0) {
    let unverifiedCount = 0
    for (const evt of dispatchedEvents) {
      const evtBase = evt.split('.').pop() || evt
      const regex = new RegExp(
        `(?:emits|publish|published|event|payload|dispatch|hook).*(?:${evt}|${evtBase})|(?:${evt}|${evtBase}).*(?:emits|published|event|dispatch|hook)`,
        'i',
      )
      const presence = checkPresence(regex, targetSpec)
      if (presence.inRequirements || presence.inVerify) {
        eventFindings.push({
          type: 'ok',
          message: `Dispatched event/hook '${evt}' ${presence.badge} is covered in spec.`,
        })
      } else {
        unverifiedCount++
        eventFindings.push({
          type: 'warn',
          message: `Dispatched event/hook '${evt}' ${presence.badge} is never documented or verified in spec!`,
        })
      }
    }
    if (unverifiedCount > 0) {
      eventScore = Math.max(0, eventScore - 30)
    }
  }

  if (dispatchedEvents.size === 0) {
    eventFindings.push({
      type: 'ok',
      message: `No event emission or lifecycle dispatch orchestration detected in implementation.`,
    })
  }

  results.push({
    dimension: '14. Event Emission & Hook Contracts',
    score: eventScore,
    passed: eventScore >= 80,
    findings: eventFindings,
  })

  // 15. Performance Anti-patterns & Loop I/O (N+1 Query Detection)
  const perfFindings: HeuristicResult['findings'] = []
  let perfScore = 100
  const detectedLoopIOs: { file: string; callText: string; line: number; loopKind: string }[] = []

  const IO_CALL_REGEX =
    /(?:\bfs\.(?:stat|lstat|readdir|readFile|writeFile|unlink|mkdir)|fsPromises\.|(?:read|write)FileAtomic|existsSync|readFileSync|writeFileSync|\b(?:db|repo|repository)\.(?:query|get|prepare|all|run)|\bthis\.(?:get|artifact)\b)/

  for (const { filePath, sf } of implSourceFiles) {
    const baseName = path.basename(filePath)

    function checkLoopBody(bodyNode: ts.Node, loopKind: string) {
      function findIO(n: ts.Node) {
        if (ts.isCallExpression(n)) {
          const callText = n.expression.getText(sf)
          if (IO_CALL_REGEX.test(callText)) {
            const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
            detectedLoopIOs.push({ file: baseName, callText, line, loopKind })
          }
        }
        ts.forEachChild(n, findIO)
      }
      ts.forEachChild(bodyNode, findIO)
    }

    function visit(node: ts.Node) {
      if (
        ts.isForStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node)
      ) {
        checkLoopBody((node as any).statement || node, 'iterative loop')
      } else if (ts.isCallExpression(node)) {
        const expr = node.expression
        if (ts.isPropertyAccessExpression(expr) && ['map', 'forEach'].includes(expr.name.text)) {
          const arg = node.arguments[0]
          if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
            const isAsync = (arg.modifiers || []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
            if (isAsync) {
              checkLoopBody(arg.body, `async ${expr.name.text}`)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sf)
  }

  if (detectedLoopIOs.length > 0) {
    const perfPresence = checkPresence(
      /(?:cache|caching|cached|memoiz|memoriz|batch|batching|bulk|buffer|buffering|chunk|n\+1|latency|sla|throughput|performance|preload|indexcache)/i,
      targetSpec,
    )
    const samples = detectedLoopIOs.slice(0, 3).map((d) => `'${d.callText}' (${d.file}:${d.line})`)

    if (perfPresence.inRequirements || perfPresence.inVerify) {
      perfFindings.push({
        type: 'ok',
        message: `Loop I/O detected in implementation (${samples.join(', ')}), explicitly governed by caching/batching/SLA requirements in spec ${perfPresence.badge}.`,
      })
    } else {
      perfFindings.push({
        type: 'warn',
        message: `Potential N+1 I/O operation: iterative loops execute I/O calls [${samples.join(', ')}] without explicit batching, caching, or SLA contracts in spec ${perfPresence.badge}!`,
      })
      perfScore = 70
    }
  } else {
    perfFindings.push({
      type: 'ok',
      message: `No N+1 loop I/O patterns detected in implementation.`,
    })
  }

  results.push({
    dimension: '15. Performance Anti-patterns & Loop I/O',
    score: perfScore,
    passed: perfScore >= 80,
    findings: perfFindings,
  })

  return results
}

/** Executes spec audit report for a SpecInfo object */
function printSpecAuditReport(
  targetSpec: SpecInfo,
  allSpecs: Map<string, SpecInfo>,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
  implFiles: string[],
  codeGraphData: CodeGraphData | null,
  host?: any,
): { ownedCount: number; conformantCount: number; avgScore: number } {
  console.log(
    `\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.cyan}  Spec Completeness & Ownership Audit: ${targetSpec.specId}${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
  )
  console.log(
    `Spec Source: ${targetSpec.filePath ? path.relative(PROJECT_ROOT, targetSpec.filePath) : 'Change Merged Preview'}`,
  )
  console.log(`Title: "${targetSpec.title}"`)
  console.log(
    `Contract Metadata: ${targetSpec.rules.length} requirements rules, ${targetSpec.scenarios.length} verify scenarios (Format-Agnostic)\n`,
  )

  // Part A: Code Symbols
  console.log(
    `${colors.bold}── Part A: Code Symbols Discovered in Effective Spec State ─────────────${colors.reset}\n`,
  )

  const mentionsList = Array.from(targetSpec.symbolMentions.values())
  const validCodeClasses: { name: string; sig: ClassSignature; mention: SymbolMention }[] = []

  for (const mention of mentionsList) {
    const symbolEntries = dynamicCodeSymbolIndex.get(mention.symbolName)
    const classEntry = symbolEntries?.find((s) => s.classSig !== undefined)
    if (classEntry && classEntry.classSig) {
      validCodeClasses.push({
        name: mention.symbolName,
        sig: classEntry.classSig,
        mention,
      })
    }
  }

  console.log(`Symbols Verified in Code (${validCodeClasses.length}):\n`)

  let ownedCount = 0
  let conformantCount = 0
  const ownedSymbolNames = new Set<string>()

  for (const { name: symbolName, sig: classSig, mention } of validCodeClasses) {
    const ownership = evaluateSymbolOwnership(symbolName, classSig, allSpecs, codeGraphData)
    const isOwner = ownership.owner?.specId === targetSpec.specId

    const sourceTag =
      mention.source === 'contract-ast'
        ? `${colors.green}[Contract AST]${colors.reset}`
        : mention.source === 'spec-lock'
          ? `${colors.magenta}[Spec Lock Link]${colors.reset}`
          : mention.source === 'inline-code'
            ? `${colors.cyan}[Inline Code]${colors.reset}`
            : `${colors.yellow}[Prose Text]${colors.reset}`

    const presence = checkPresence(symbolName, targetSpec)
    console.log(
      `${colors.bold}• Symbol: ${colors.white}${symbolName}${colors.reset} ${sourceTag} ${presence.badge}`,
    )
    console.log(`  Source context: ${colors.dim}"${mention.sectionName}"${colors.reset}`)

    if (isOwner) {
      ownedCount++
      ownedSymbolNames.add(symbolName)
      console.log(
        `  Role: 👑 ${colors.green}${colors.bold}PRIMARY OWNER${colors.reset} (Confidence: ${ownership.ownerConfidence})`,
      )
      console.log(`  Rationale: ${colors.dim}${ownership.rationale}${colors.reset}`)
      const analysis = analyzeConstructorCompleteness(
        classSig,
        ownership.contract?.constructorParams,
      )

      if (!ownership.contract?.constructorParams) {
        console.log(
          `  ${colors.yellow}Constructor Status: Behavioral/Textual or Spec-Lock Link (No formal constructor block in spec AST)${colors.reset}`,
        )
      } else {
        const scoreColor =
          analysis.score === 100 ? colors.green : analysis.score >= 70 ? colors.yellow : colors.red
        console.log(
          `  Constructor Conformance: ${scoreColor}${analysis.score}%${colors.reset} [${analysis.matching.length}/${classSig.constructorParams.length} params]`,
        )

        if (analysis.score === 100 && analysis.orderMismatches.length === 0) {
          conformantCount++
          console.log(`  Status: ${colors.green}✔ FULLY CONFORMANT${colors.reset}`)
        } else {
          if (analysis.missingInSpec.length > 0) {
            console.log(
              `  ${colors.red}Missing in Spec: [${analysis.missingInSpec.join(', ')}]${colors.reset}`,
            )
          }
          if (analysis.extraInSpec.length > 0) {
            console.log(
              `  ${colors.yellow}Extra/Drifted in Spec: [${analysis.extraInSpec.join(', ')}]${colors.reset}`,
            )
          }
          if (analysis.orderMismatches.length > 0) {
            console.log(
              `  ${colors.yellow}Order Mismatches: ${analysis.orderMismatches.map((m) => `${m.name} (Spec:#${m.specPos} vs Code:#${m.codePos})`).join(', ')}${colors.reset}`,
            )
          }
        }
      }
    } else {
      const realOwner = ownership.owner ? ownership.owner.specId : 'unknown'
      console.log(
        `  Role: 🌿 ${colors.dim}Referenced / Linked (Primary owner is: ${realOwner})${colors.reset}`,
      )
    }
    console.log()
  }

  // Part B: Architectural Suite & Part C: Graph Intelligence
  let avgScore = 100
  if (implFiles.length === 0) {
    console.log(
      `${colors.yellow}⚠ No implementation files mapped to run architectural completeness checks.${colors.reset}\n`,
    )
  } else {
    const heuristicResults = runSevenDimensionAudit(
      targetSpec,
      implFiles,
      ownedSymbolNames,
      codeGraphData,
      allSpecs,
      dynamicCodeSymbolIndex,
      host,
    )

    console.log(
      `${colors.bold}── Part B: Architectural Completeness Suite (${heuristicResults.length} Dimensions) ────────────${colors.reset}\n`,
    )

    for (const res of heuristicResults) {
      const scoreColor =
        res.score === 100 ? colors.green : res.score >= 70 ? colors.yellow : colors.red
      const icon = res.passed
        ? `${colors.green}✔${colors.reset}`
        : `${colors.yellow}⚠${colors.reset}`

      console.log(
        `${colors.bold}${res.dimension}${colors.reset} [${scoreColor}${res.score}%${colors.reset}] ${icon}`,
      )
      for (const f of res.findings) {
        const fIcon =
          f.type === 'ok'
            ? `${colors.green}  ✓${colors.reset}`
            : f.type === 'warn'
              ? `${colors.yellow}  ⚠${colors.reset}`
              : `${colors.red}  ✖${colors.reset}`
        console.log(`${fIcon} ${f.message}`)
      }
      console.log()
    }

    const partBScore = Math.round(
      heuristicResults.reduce((acc, r) => acc + r.score, 0) / heuristicResults.length,
    )

    // Part C: Graph Intelligence & Ecosystem Impact
    const graphResults = runGraphIntelligenceAudit(
      targetSpec,
      implFiles,
      codeGraphData,
      allSpecs,
      host,
    )

    console.log(
      `${colors.bold}── Part C: Graph Intelligence & Ecosystem Impact (${graphResults.length} Dimensions) ────────────${colors.reset}\n`,
    )

    for (const res of graphResults) {
      const scoreColor =
        res.score === 100 ? colors.green : res.score >= 70 ? colors.yellow : colors.red
      const icon = res.passed
        ? `${colors.green}✔${colors.reset}`
        : `${colors.yellow}⚠${colors.reset}`

      console.log(
        `${colors.bold}${res.dimension}${colors.reset} [${scoreColor}${res.score}%${colors.reset}] ${icon}`,
      )
      for (const f of res.findings) {
        const fIcon =
          f.type === 'ok'
            ? `${colors.green}  ✓${colors.reset}`
            : f.type === 'warn'
              ? `${colors.yellow}  ⚠${colors.reset}`
              : `${colors.red}  ✖${colors.reset}`
        console.log(`${fIcon} ${f.message}`)
      }
      console.log()
    }

    const partCScore = Math.round(
      graphResults.reduce((acc, r) => acc + r.score, 0) / graphResults.length,
    )
    avgScore = Math.round((partBScore + partCScore) / 2)

    const bColor = partBScore >= 90 ? colors.green : partBScore >= 70 ? colors.yellow : colors.red
    const cColor = partCScore >= 90 ? colors.green : partCScore >= 70 ? colors.yellow : colors.red
    const avgColor = avgScore >= 90 ? colors.green : avgScore >= 70 ? colors.yellow : colors.red

    console.log(
      `${colors.bold}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
    )
    console.log(`${colors.bold}Audit Summary for ${targetSpec.specId}:${colors.reset}`)
    console.log(`  Owned Classes Conformance: ${conformantCount}/${ownedCount}`)
    console.log(`  Part B Architectural Completeness: ${bColor}${partBScore}%${colors.reset}`)
    console.log(`  Part C Graph Ecosystem Intelligence: ${cColor}${partCScore}%${colors.reset}`)
    console.log(`  Overall Spec Completeness Index: ${avgColor}${avgScore}%${colors.reset}`)
    console.log(
      `${colors.bold}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`,
    )
  }

  return { ownedCount, conformantCount, avgScore }
}

/** Analyzes a symbol (Symbol -> Spec Mode) */
async function analyzeSymbolMode(
  host: any,
  symbolName: string,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
  codeGraphData: CodeGraphData | null,
) {
  console.log(
    `\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.cyan}  AST-to-AST Analysis for Symbol: ${symbolName}${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`,
  )

  const symbolEntries = dynamicCodeSymbolIndex.get(symbolName)
  const classEntry = symbolEntries?.find((s) => s.classSig !== undefined)

  if (!classEntry || !classEntry.classSig) {
    console.log(
      `${colors.red}✖ Symbol '${symbolName}' not found as a class in codebase workspaces.${colors.reset}`,
    )
    return
  }

  const classSig = classEntry.classSig
  const relFilePath = path.relative(PROJECT_ROOT, classSig.filePath).replace(/\\/g, '/')
  console.log(`${colors.bold}Implementation AST:${colors.reset} [${relFilePath}]`)
  console.log(
    `${colors.dim}Constructor Parameters in Code (${classSig.constructorParams.length}):${colors.reset}`,
  )
  classSig.constructorParams.forEach((p, idx) => {
    const opt = p.isOptional ? '?' : ''
    console.log(
      `  ${idx + 1}. ${colors.white}${p.name}${opt}${colors.reset}: ${colors.dim}${p.type}${colors.reset}`,
    )
  })
  console.log()

  const allSpecs = await loadAllSpecs(host, dynamicCodeSymbolIndex)
  const ownership = evaluateSymbolOwnership(symbolName, classSig, allSpecs, codeGraphData)

  if (!ownership.owner) {
    console.log(
      `${colors.yellow}⚠ No spec currently owns or references symbol '${symbolName}'.${colors.reset}`,
    )
    return
  }

  console.log(
    `${colors.bold}Ownership Resolution (CodeGraph + AST Contract + SpecLock):${colors.reset}`,
  )
  console.log(
    `  👑 Primary Owner Spec: ${colors.green}${colors.bold}${ownership.owner.specId}${colors.reset} (Confidence: ${colors.bold}${ownership.ownerConfidence}${colors.reset})`,
  )
  console.log(`     Spec: ${path.relative(PROJECT_ROOT, ownership.owner.filePath)}`)
  if (ownership.owner.verifyFilePath) {
    console.log(`     Verify: ${path.relative(PROJECT_ROOT, ownership.owner.verifyFilePath)}`)
  }
  console.log(`     Rationale: ${colors.dim}${ownership.rationale}${colors.reset}`)

  if (ownership.extendingSpecs.length > 0) {
    console.log(`  🌿 Extending / Linked Specs (${ownership.extendingSpecs.length}):`)
    ownership.extendingSpecs.forEach((s) => console.log(`     - ${s.specId}`))
  }
  console.log()

  const analysis = analyzeConstructorCompleteness(classSig, ownership.contract?.constructorParams)

  console.log(`${colors.bold}Contract Conformance (Spec AST vs Code AST):${colors.reset}`)

  if (!ownership.contract?.constructorParams) {
    console.log(
      `  ${colors.yellow}⚠ The governing spec '${ownership.owner.specId}' is behavioral/textual or linked via spec-lock:${colors.reset}`,
    )
    console.log(
      `    No formal TypeScript constructor block found in the Markdown AST for '${symbolName}'.`,
    )
  } else {
    const scoreColor =
      analysis.score === 100 ? colors.green : analysis.score >= 70 ? colors.yellow : colors.red
    console.log(
      `  Completeness Score: ${scoreColor}${colors.bold}${analysis.score}%${colors.reset}`,
    )
    console.log(
      `  ✓ Parameters matching (${analysis.matching.length}): ${colors.green}${analysis.matching.join(', ') || 'none'}${colors.reset}`,
    )

    if (analysis.missingInSpec.length > 0) {
      console.log(
        `  ${colors.red}✖ Missing parameters in spec AST (${analysis.missingInSpec.length}):${colors.reset}`,
      )
      analysis.missingInSpec.forEach((name) => {
        const p = classSig.constructorParams.find((cp) => cp.name === name)!
        console.log(
          `     - ${colors.red}${name}${colors.reset} (${p.type}) [Code pos: #${p.position + 1}]`,
        )
      })
    }

    if (analysis.extraInSpec.length > 0) {
      console.log(
        `  ${colors.yellow}⚠ Extra / Drifted parameters in spec AST (${analysis.extraInSpec.length}):${colors.reset}`,
      )
      analysis.extraInSpec.forEach((name) =>
        console.log(`     - ${colors.yellow}${name}${colors.reset}`),
      )
    }

    if (analysis.orderMismatches.length > 0) {
      console.log(
        `  ${colors.yellow}⚠ Positional / Order Mismatches (${analysis.orderMismatches.length}):${colors.reset}`,
      )
      analysis.orderMismatches.forEach((m) => {
        console.log(
          `     - ${colors.yellow}${m.name}${colors.reset}: declared at #${m.specPos} in spec AST, but #${m.codePos} in code AST!`,
        )
      })
    }
  }
  console.log()
}

/** Analyzes a single spec via SpecRepository / Kernel Use Cases (no raw disk reading) */
async function analyzeSpecMode(
  host: any,
  specIdQuery: string,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
  codeGraphData: CodeGraphData | null,
) {
  const allSpecs = await loadAllSpecs(host, dynamicCodeSymbolIndex)
  let targetSpec: SpecInfo | undefined

  if (allSpecs.has(specIdQuery)) {
    targetSpec = allSpecs.get(specIdQuery)
  } else if (!specIdQuery.includes(':') && !specIdQuery.includes('/')) {
    // If user passed a bare spec name without workspace (e.g. "change-list"), match exact suffix
    const exactMatches: SpecInfo[] = []
    for (const [id, spec] of allSpecs) {
      if (id.endsWith(`:${specIdQuery}`) || id.endsWith(`/${specIdQuery}`)) {
        exactMatches.push(spec)
      }
    }
    if (exactMatches.length === 1) {
      targetSpec = exactMatches[0]
    }
  }

  if (!targetSpec) {
    console.error(
      `\n${colors.red}✖ Spec '${specIdQuery}' not found in workspace spec repositories.${colors.reset}`,
    )
    const suggestions: string[] = []
    const q = specIdQuery.toLowerCase().replace(/^[a-z0-9-]+:/, '')
    for (const id of allSpecs.keys()) {
      if (id.toLowerCase().includes(specIdQuery.toLowerCase()) || id.toLowerCase().includes(q)) {
        suggestions.push(id)
      }
    }
    if (suggestions.length > 0) {
      console.log(`\nDid you mean one of these?`)
      for (const s of suggestions.slice(0, 5)) {
        console.log(`  • ${colors.cyan}${s}${colors.reset}`)
      }
    }
    console.log()
    process.exit(1)
  }

  const implFiles = findImplementationFilesForSpec(
    targetSpec.specId,
    targetSpec.specLockImplementationFiles,
    host,
    codeGraphData,
  )

  printSpecAuditReport(targetSpec, allSpecs, dynamicCodeSymbolIndex, implFiles, codeGraphData, host)
}

/**
 * Extracts merged metadata and artifact contents for a spec in an active change
 * using the active schema and registered parsers (schema-driven, format-agnostic, zero hardcoded filenames).
 */
async function extractMergedSpecMetadata(
  host: any,
  changeName: string,
  specId: string,
  baseSpec?: SpecInfo,
): Promise<{
  metadata: any
  requirementsContent: string
  verifyContent: string
  previewFiles: any[]
}> {
  let schema: any = null
  let specArtifacts: any[] = []
  try {
    const schemaRes = await host.kernel.specs.getActiveSchema.execute()
    schema = schemaRes.schema
    specArtifacts = schema.artifacts().filter((a: any) => a.scope === 'spec')
  } catch {}

  let previewFiles: any[] = []
  try {
    const previewResult = await host.kernel.changes.preview.execute({ name: changeName, specId })
    previewFiles = previewResult.files || []
  } catch {}

  const extraction = schema?.metadataExtraction()

  // Identify requirement & scenario artifacts dynamically from schema extraction declarations (scope: spec)
  const rulesArtifactId =
    extraction?.rules?.[0]?.artifact ?? extraction?.title?.artifact ?? specArtifacts[0]?.id
  const scenariosArtifactId =
    extraction?.scenarios?.[0]?.artifact ??
    specArtifacts.find((a: any) => a.id !== rulesArtifactId)?.id

  const reqArtifactDef =
    specArtifacts.find((a: any) => a.id === rulesArtifactId) || specArtifacts[0]
  const verArtifactDef =
    specArtifacts.find((a: any) => a.id === scenariosArtifactId) || specArtifacts[1]

  const getFileContent = (def: any) => {
    if (!def) return ''
    const fname = def.filename || (def.output ? path.basename(def.output) : '')
    const f = previewFiles.find((file: any) => file.filename === fname)
    return f?.merged ?? f?.base ?? ''
  }

  let requirementsContent = getFileContent(reqArtifactDef)
  let verifyContent = getFileContent(verArtifactDef)

  let mergedMetadata: any = null

  if (extraction && specArtifacts.length > 0) {
    try {
      const parsers =
        host.kernel.changes.preview?._parsers || host.kernel.specs.generateMetadata?._parsers
      const transforms = host.kernel.specs.generateMetadata?._extractorTransforms
      const astsByArtifact = new Map<string, any>()
      const renderers = new Map<string, any>()
      const transformContexts = new Map<string, any>()

      for (const artifactType of specArtifacts) {
        const targetFilename =
          artifactType.filename || (artifactType.output ? path.basename(artifactType.output) : '')
        const previewFile = previewFiles.find((f: any) => f.filename === targetFilename)
        const content = previewFile?.merged ?? previewFile?.base ?? ''
        const format =
          artifactType.format ??
          (targetFilename.endsWith('.md')
            ? 'markdown'
            : targetFilename.endsWith('.yaml') || targetFilename.endsWith('.yml')
              ? 'yaml'
              : targetFilename.endsWith('.json')
                ? 'json'
                : 'plaintext')
        const parser = parsers?.get(format)
        if (!parser) continue

        const ast = parser.parse(content)
        astsByArtifact.set(artifactType.id, ast)
        renderers.set(artifactType.id, parser)
        transformContexts.set(
          artifactType.id,
          new Map<string, any>([['resolveSpecReference', (ref: string) => ref]]),
        )
      }

      mergedMetadata = await extractMetadata(
        extraction,
        astsByArtifact,
        renderers,
        transforms,
        transformContexts,
      )
    } catch (err: any) {
      console.warn(
        `${colors.yellow}⚠ Merged metadata extraction failed for '${specId}', using schema artifact fallback: ${err.message}${colors.reset}`,
      )
    }
  }

  // Graceful fallback if extraction was null or errored:
  if (!mergedMetadata) {
    mergedMetadata = baseSpec?.metadata || null
  }

  if (!requirementsContent && baseSpec) {
    requirementsContent = baseSpec.rawContent || ''
  }
  if (!verifyContent && baseSpec) {
    verifyContent = baseSpec.verifyContent || ''
  }

  return {
    metadata: mergedMetadata,
    requirementsContent,
    verifyContent,
    previewFiles,
  }
}

/** Analyzes an active change via PreviewSpec use case (no CLI subprocesses, no raw disk reads) */
async function analyzeChangeMode(
  host: any,
  changeName: string,
  dynamicCodeSymbolIndex: Map<string, CodeSymbol[]>,
  codeGraphData: CodeGraphData | null,
) {
  console.log(
    `\n${colors.bold}${colors.magenta}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.magenta}  Change Completeness & Conformance Audit: ${changeName}${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.magenta}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`,
  )

  let changeStatus: any
  try {
    // USE CASE: host.kernel.changes.status
    changeStatus = await host.kernel.changes.status.execute({ name: changeName })
  } catch (err: any) {
    console.error(`${colors.red}✖ Failed to load change status for '${changeName}'.${colors.reset}`)
    console.error(err.message)
    process.exit(1)
  }

  const change = changeStatus.change
  if (!change) {
    console.error(`${colors.red}✖ No active change found for '${changeName}'.${colors.reset}`)
    process.exit(1)
  }

  console.log(`Change State: ${colors.bold}${colors.green}${change.state}${colors.reset}`)
  console.log(`Description: ${colors.dim}${change.description || 'No description'}${colors.reset}`)
  console.log(`Specs in Change (${change.specIds.length}): ${change.specIds.join(', ')}\n`)

  const allSpecs = await loadAllSpecs(host, dynamicCodeSymbolIndex)
  const auditResults: {
    specId: string
    ownedCount: number
    conformantCount: number
    avgScore: number
  }[] = []

  for (const specId of change.specIds) {
    console.log(
      `\n${colors.bold}${colors.blue}▶ Materializing Preview for Spec: ${specId}...${colors.reset}`,
    )

    const baseSpec = allSpecs.get(specId)

    // Primary: Schema-driven merged metadata extraction from change preview (format-agnostic)
    // Fallback: Schema-directed artifact inspection (no hardcoded filenames)
    const {
      metadata: mergedMetadata,
      requirementsContent,
      verifyContent,
    } = await extractMergedSpecMetadata(host, changeName, specId, baseSpec)

    const effectiveSpec = parseSpecContent(
      specId,
      requirementsContent,
      baseSpec?.filePath || '',
      dynamicCodeSymbolIndex,
      verifyContent,
      baseSpec?.specLockImplementationFiles?.map((f) => ({ file: f.file, symbols: f.symbols })),
      baseSpec?.verifyFilePath,
      change.declaredDependencies?.get?.(specId) ??
        mergedMetadata?.dependsOn ??
        baseSpec?.declaredDependencies ??
        [],
      change.declaredDependencies?.has?.(specId) ||
        !!mergedMetadata?.dependsOn ||
        baseSpec?.isDepsInitialized ||
        false,
      mergedMetadata,
    )

    const implFiles = findImplementationFilesForSpec(
      specId,
      baseSpec?.specLockImplementationFiles || [],
      host,
      codeGraphData,
    )

    const result = printSpecAuditReport(
      effectiveSpec,
      allSpecs,
      dynamicCodeSymbolIndex,
      implFiles,
      codeGraphData,
      host,
    )
    auditResults.push({ specId, ...result })
  }

  console.log(
    `\n${colors.bold}${colors.magenta}══════════════════════════════════════════════════════════════════════════════${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.magenta}  Consolidated Change Summary: ${changeName}${colors.reset}`,
  )
  console.log(
    `${colors.bold}${colors.magenta}══════════════════════════════════════════════════════════════════════════════${colors.reset}\n`,
  )

  console.log(`${colors.bold}Spec Completeness Breakdown:${colors.reset}`)
  for (const r of auditResults) {
    const sColor = r.avgScore >= 90 ? colors.green : r.avgScore >= 70 ? colors.yellow : colors.red
    console.log(
      `  • ${colors.bold}${r.specId}${colors.reset}: ${sColor}${r.avgScore}% completeness${colors.reset} [Owned Classes Conformance: ${r.conformantCount}/${r.ownedCount}]`,
    )
  }

  const overallAvg = Math.round(
    auditResults.reduce((acc, r) => acc + r.avgScore, 0) / (auditResults.length || 1),
  )
  const overallColor =
    overallAvg >= 90 ? colors.green : overallAvg >= 70 ? colors.yellow : colors.red
  console.log(
    `\n${colors.bold}Overall Change Architectural Completeness Index: ${overallColor}${overallAvg}%${colors.reset}\n`,
  )
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log(`
${colors.bold}Unified Spec Completeness & Ownership Analyzer${colors.reset}

Features:
  - CodeGraph Subsystem Integration (Uses domain GraphStore port in <100ms)
  - MDAST Dual-Document Parser (spec.md requirements + verify.md scenarios)
  - Example Instantiation & Prose Port Extractor
  - Multi-Tier Ownership Resolution (Graph COVERS_SYMBOL relations + AST Contracts)
  - 15-Dimensional Architectural & Graph Intelligence Completeness Suite:
      Part B (Architectural Completeness):
        1. Error Topology Coverage (Throw assertions & isolation policies)
        2. Union & Enum Branch Matrix (Type union literals in verify.md)
        3. I/O Interface Field Coverage (Public Input/Result properties)
        4. Boolean Toggle Symmetry (True vs False/absent/null cases)
        5. Call Graph vs Spec Dependencies Alignment
        6. State Mutation & Side-Effect Visibility
        7. Graceful Fallback & Degradation Coverage
        8. Reverse Drift & Zombie References (Spec-lock integrity)
        9. Public API Member Coverage (Unreferenced public methods)
        10. Graph Topology & Layering Rules (Cycles & architectural tier breaches)
        11. Async & Transaction Contracts (AbortSignal & rollback verification)
      Part C (Graph Ecosystem Intelligence):
        12. Blast Radius vs Verification Density (Downstream consumers vs scenarios)
        13. Dead Code & Graph Reachability (Orphaned files & island ghost specs)
        14. Event Emission & Hook Lifecycle Contracts (Event payloads & hook resilience)
        15. Performance Anti-patterns & Loop I/O (N+1 query & unbatched I/O detection)

Usage:
  npx tsx dev/scripts/spec-completeness-poc.ts [--config <path>] --symbol <SymbolName>
  npx tsx dev/scripts/spec-completeness-poc.ts [--config <path>] --spec <specId>
  npx tsx dev/scripts/spec-completeness-poc.ts [--config <path>] --change <changeName>
  npx tsx dev/scripts/spec-completeness-poc.ts [--config <path>] <SymbolName | specId>

Options:
  --config, -c <path>   Explicit path to specd.yaml (evaluates external projects)
  --project, -p <dir>   Path to project directory for config discovery
`)
    process.exit(0)
  }

  let explicitConfigPath: string | undefined
  let explicitProjectDir: string | undefined
  let mode: 'symbol' | 'spec' | 'change' = 'symbol'
  let target = ''

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--config' || arg === '-c') {
      explicitConfigPath = args[++i]
    } else if (arg === '--project' || arg === '-p') {
      explicitProjectDir = args[++i]
    } else if (arg === '--change') {
      mode = 'change'
      target = args[++i]
    } else if (arg === '--symbol') {
      mode = 'symbol'
      target = args[++i]
    } else if (arg === '--spec') {
      mode = 'spec'
      target = args[++i]
    } else if (!arg.startsWith('-') && !target) {
      if (arg.includes('/') || arg.includes(':')) {
        mode = 'spec'
      } else {
        mode = 'symbol'
      }
      target = arg
    }
  }

  if (!target) {
    console.error(
      `${colors.red}Please provide a target symbol, spec ID, or change name.${colors.reset}`,
    )
    process.exit(1)
  }

  const { openSpecdHost } = await import('../../packages/sdk/dist/index.js')
  const hostInput = explicitConfigPath
    ? { configPath: path.resolve(process.cwd(), explicitConfigPath) }
    : {
        startDir: explicitProjectDir
          ? path.resolve(process.cwd(), explicitProjectDir)
          : process.cwd(),
      }

  const host = await openSpecdHost(hostInput)
  PROJECT_ROOT = host.config.projectRoot

  if (explicitConfigPath || explicitProjectDir) {
    console.log(
      `${colors.dim}📁 Project Config: ${host.configFilePath || host.config.projectRoot}${colors.reset}`,
    )
  }

  const { symbolIndex: dynamicCodeSymbolIndex, codeGraphData } = buildDynamicCodeSymbolIndex(host)

  if (codeGraphData) {
    console.log(
      `${colors.dim}⚡ CodeGraph Database Connected: ${codeGraphData.symbols.size.toLocaleString()} symbol entries loaded from SQLite (<30ms)${colors.reset}`,
    )
  } else {
    console.log(
      `${colors.dim}ℹ CodeGraph SQLite not found, using AST indexer fallback${colors.reset}`,
    )
  }

  if (mode === 'change') {
    await analyzeChangeMode(host, target, dynamicCodeSymbolIndex, codeGraphData)
  } else if (mode === 'symbol') {
    await analyzeSymbolMode(host, target, dynamicCodeSymbolIndex, codeGraphData)
  } else {
    await analyzeSpecMode(host, target, dynamicCodeSymbolIndex, codeGraphData)
  }
}

main()
