import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../../domain/value-objects/index-options.js'
import { type LanguageAdapter } from '../../../domain/value-objects/language-adapter.js'
import {
  emptyResolutionManifestSource,
  type ResolutionManifestSource,
} from '../../ports/resolution-manifest-source.js'
import { resolveEffectiveGraphConfig } from './resolve-effective-graph-config.js'

/** Visible full-rebuild reason when the derivation fingerprint differs. */
export const FULL_REBUILD_FINGERPRINT_REASON =
  'Graph derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed'

/** Text warning appended by graph stats when a derivation mismatch is known. */
export const GRAPH_STATS_FINGERPRINT_WARNING =
  '⚠ Derivation fingerprint mismatch — code-graph version, workspace configuration, or resolution manifest content changed'

/** Input for computing a graph fingerprint. */
export interface GraphFingerprintInput {
  readonly codeGraphVersion: string
  readonly projectRoot: string
  readonly workspaces: readonly ProjectWorkspace[]
  readonly graphConfig: ProjectGraphConfig
  readonly adapters: readonly LanguageAdapter[]
  readonly repoRoot: string | null
  readonly source?: ResolutionManifestSource
}

/** Normalized workspace representation for fingerprint computation. */
interface NormalizedWorkspaceFingerprint {
  readonly name: string
  readonly codeRoot: string
  readonly allowedPaths: readonly string[]
  readonly excludePaths: readonly string[]
  readonly respectGitignore: boolean
  readonly resolutionInputs: readonly ResolutionInputFingerprint[]
}

/** Content identity for a deterministic package or build-resolution input. */
export interface ResolutionInputFingerprint {
  readonly path: string
  readonly contentHash: string
}

/**
 * Normalizes workspace targets for deterministic fingerprinting.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspaces - The workspace targets to normalize.
 * @param graphConfig - The project graph configuration.
 * @param adapters - Registered language adapters supply resolution-manifest basenames.
 * @param repoRoot - Repository root that bounds the resolution-manifest walk, or null.
 * @param source - Port that reads manifest existence and text.
 * @returns Normalized workspace representations.
 */
function normalizeWorkspaceFingerprintInput(
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
  adapters: readonly LanguageAdapter[],
  repoRoot: string | null,
  source: ResolutionManifestSource,
): readonly NormalizedWorkspaceFingerprint[] {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  return workspaces.map((ws) => {
    const wsGraph = effectiveGraphConfig.workspaces.get(ws.name)
    return {
      name: ws.name,
      codeRoot: normalizeRelativePath(projectRoot, ws.codeRoot),
      allowedPaths: wsGraph?.allowedPaths ? [...wsGraph.allowedPaths] : [],
      excludePaths: wsGraph?.excludePaths ? [...wsGraph.excludePaths] : [],
      respectGitignore: wsGraph?.respectGitignore ?? true,
      resolutionInputs: discoverResolutionInputs(
        projectRoot,
        ws.codeRoot,
        adapters,
        repoRoot,
        source,
      ),
    }
  })
}

/**
 * Computes a deterministic fingerprint for the entire graph configuration.
 * @param input - The fingerprint input.
 * @returns A SHA-256 hex digest.
 */
export function computeGraphFingerprint(input: GraphFingerprintInput): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(
    input.projectRoot,
    input.workspaces,
    input.graphConfig,
  )
  const normalized = normalizeWorkspaceFingerprintInput(
    input.projectRoot,
    input.workspaces,
    input.graphConfig,
    input.adapters,
    input.repoRoot,
    input.source ?? emptyResolutionManifestSource,
  )
  const payload = JSON.stringify({
    v: input.codeGraphVersion,
    w: normalized,
    g: {
      includePaths: effectiveGraphConfig.includePaths,
      globalExcludePaths: effectiveGraphConfig.globalExcludePaths,
      syntheticSpecExcludePaths: effectiveGraphConfig.syntheticSpecExcludePaths,
    },
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Computes a deterministic fingerprint for a single workspace.
 * @param codeGraphVersion - The code-graph package version.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspace - The workspace target.
 * @param workspaces - All workspace targets in the current project.
 * @param graphConfig - The project graph configuration.
 * @param adapters - Registered language adapters supply resolution-manifest basenames.
 * @param repoRoot - Repository root that bounds the resolution-manifest walk, or null.
 * @param source - Port that reads manifest existence and text.
 * @returns A SHA-256 hex digest.
 */
export function computeWorkspaceFingerprint(
  codeGraphVersion: string,
  projectRoot: string,
  workspace: ProjectWorkspace,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
  adapters: readonly LanguageAdapter[] = [],
  repoRoot: string | null = null,
  source: ResolutionManifestSource = emptyResolutionManifestSource,
): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  const wsGraph = effectiveGraphConfig.workspaces.get(workspace.name)
  const normalized: NormalizedWorkspaceFingerprint = {
    name: workspace.name,
    codeRoot: normalizeRelativePath(projectRoot, workspace.codeRoot),
    allowedPaths: wsGraph?.allowedPaths ? [...wsGraph.allowedPaths] : [],
    excludePaths: wsGraph?.excludePaths ? [...wsGraph.excludePaths] : [],
    respectGitignore: wsGraph?.respectGitignore ?? true,
    resolutionInputs: discoverResolutionInputs(
      projectRoot,
      workspace.codeRoot,
      adapters,
      repoRoot,
      source,
    ),
  }
  const payload = JSON.stringify({ v: codeGraphVersion, w: [normalized] })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Computes the fingerprint entry for project-global `root:` discovery.
 * @param codeGraphVersion - The current code-graph version.
 * @param projectRoot - Absolute project root used for discovery.
 * @param workspaces - The current workspace targets.
 * @param graphConfig - The project graph configuration.
 * @param adapters - Registered language adapters supply resolution-manifest basenames.
 * @param repoRoot - Repository root that bounds the resolution-manifest walk, or null.
 * @param source - Port that reads manifest existence and text.
 * @returns A SHA-256 hex digest.
 */
export function computeRootFingerprint(
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
  adapters: readonly LanguageAdapter[] = [],
  repoRoot: string | null = null,
  source: ResolutionManifestSource = emptyResolutionManifestSource,
): string {
  const effectiveGraphConfig = resolveEffectiveGraphConfig(projectRoot, workspaces, graphConfig)
  const payload = JSON.stringify({
    v: codeGraphVersion,
    root: {
      includePaths: effectiveGraphConfig.includePaths,
      excludePaths: effectiveGraphConfig.rootExcludePaths,
    },
    workspaces: workspaces.map((workspace) => ({
      name: workspace.name,
      codeRoot: normalizeRelativePath(projectRoot, workspace.codeRoot),
      resolutionInputs: discoverResolutionInputs(
        projectRoot,
        workspace.codeRoot,
        adapters,
        repoRoot,
        source,
      ),
    })),
  })
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Rewrites CRLF and lone CR line endings to LF for manifest digests.
 * @param text - Manifest text whose newline spelling must not affect the digest.
 * @returns The same text with LF line endings.
 */
function normalizeNewlines(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Hashes a resolution manifest as newline-normalized UTF-8 text.
 * @param source - Port that reads manifest text.
 * @param filePath - Absolute path to the manifest file.
 * @returns SHA-256 hex digest, or undefined when the file cannot be read.
 */
function hashManifestText(source: ResolutionManifestSource, filePath: string): string | undefined {
  const content = source.readText(filePath)
  if (content === undefined) return undefined
  return createHash('sha256').update(normalizeNewlines(content), 'utf8').digest('hex')
}

/**
 * Collects exact basenames declared by registered adapters.
 * @param adapters - Registered language adapters.
 * @returns Deduplicated exact filenames, excluding empties and path/glob tokens.
 */
function collectResolutionBasenames(adapters: readonly LanguageAdapter[]): readonly string[] {
  const names = new Set<string>()
  for (const adapter of adapters ?? []) {
    for (const name of adapter.resolutionManifests()) {
      if (name === '' || name.includes('/') || name.includes('\\') || name.includes('*')) {
        continue
      }
      names.add(name)
    }
  }
  return [...names]
}

/**
 * Discovers and hashes adapter-declared resolution manifests for one workspace.
 * @param projectRoot - Absolute project root used as the stable relative-path base.
 * @param codeRoot - Workspace code root to start the upward walk from.
 * @param adapters - Registered language adapters supply basenames.
 * @param repoRoot - Repository root that bounds the walk, or null to use projectRoot.
 * @param source - Port that reads manifest existence and text.
 * @returns Deterministically ordered relative paths and content hashes.
 */
export function discoverResolutionInputs(
  projectRoot: string,
  codeRoot: string,
  adapters: readonly LanguageAdapter[],
  repoRoot: string | null,
  source: ResolutionManifestSource = emptyResolutionManifestSource,
): readonly ResolutionInputFingerprint[] {
  const basenames = collectResolutionBasenames(adapters)
  if (basenames.length === 0) return []

  const start = resolve(codeRoot)
  const bound = resolve(repoRoot ?? projectRoot)
  const directories = collectWalkDirectories(start, bound)
  const files = new Set<string>()

  for (const dir of directories) {
    if (!source.directoryExists(dir)) continue
    for (const basename of basenames) {
      const candidate = join(dir, basename)
      if (source.isRegularFile(candidate)) {
        files.add(candidate)
      }
    }
  }

  return [...files]
    .flatMap((filePath) => {
      const contentHash = hashManifestText(source, filePath)
      if (contentHash === undefined) return []
      return [
        {
          path: normalizeRelativePath(projectRoot, filePath),
          contentHash,
        },
      ]
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * Builds the directory walk from codeRoot toward the bound.
 * @param start - Absolute workspace code root.
 * @param bound - Absolute repository or project root.
 * @returns Directories to inspect, start-first.
 */
function collectWalkDirectories(start: string, bound: string): readonly string[] {
  if (start === bound) return [start]

  const relativeToBound = relative(bound, start)
  const startInsideBound =
    relativeToBound === '' || (!relativeToBound.startsWith('..') && !isAbsolute(relativeToBound))

  if (!startInsideBound) {
    return [start]
  }

  const directories: string[] = []
  let current = start
  while (true) {
    directories.push(current)
    if (current === bound) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return directories
}

/**
 * Converts an absolute-or-relative path into stable project-relative form.
 * @param projectRoot - Absolute project root used as the relative-path base.
 * @param target - Absolute or relative target path.
 * @returns Forward-slash normalized path without an absolute root.
 */
function normalizeRelativePath(projectRoot: string, target: string): string {
  const normalized = relative(resolve(projectRoot), resolve(target)).replaceAll('\\', '/')
  if (normalized === '') return '.'
  return isAbsolute(normalized) ? normalized.replaceAll('\\', '/') : normalized
}

/**
 * Parses a serialized fingerprint map from storage.
 * @param stored - The JSON string or null.
 * @returns A map of workspace name to fingerprint.
 */
export function parseFingerprintMap(stored: string | null): Map<string, string> {
  if (stored === null) return new Map()
  try {
    const parsed = JSON.parse(stored) as Record<string, string>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

/**
 * Serializes a fingerprint map to JSON for storage.
 * @param map - The fingerprint map.
 * @returns A JSON string.
 */
export function serializeFingerprintMap(map: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(map))
}

/**
 * Detects if any stored workspace fingerprint differs from the current one.
 * @param storedMap - The stored fingerprint map.
 * @param codeGraphVersion - The current code-graph version.
 * @param projectRoot - Absolute project root used to resolve effective graph config.
 * @param workspaces - The current workspace targets.
 * @param graphConfig - The project graph configuration.
 * @param adapters - Registered language adapters supply resolution-manifest basenames.
 * @param repoRoot - Repository root that bounds the resolution-manifest walk, or null.
 * @param source - Port that reads manifest existence and text.
 * @returns True if any mismatch is detected.
 */
export function detectFingerprintMismatch(
  storedMap: Map<string, string>,
  codeGraphVersion: string,
  projectRoot: string,
  workspaces: readonly ProjectWorkspace[],
  graphConfig: ProjectGraphConfig,
  adapters: readonly LanguageAdapter[] = [],
  repoRoot: string | null = null,
  source: ResolutionManifestSource = emptyResolutionManifestSource,
): boolean {
  if (storedMap.size === 0) {
    return false
  }

  for (const ws of workspaces) {
    const currentFp = computeWorkspaceFingerprint(
      codeGraphVersion,
      projectRoot,
      ws,
      workspaces,
      graphConfig,
      adapters,
      repoRoot,
      source,
    )
    const storedFp = storedMap.get(ws.name)
    if (storedFp !== currentFp) {
      return true
    }
  }

  const rootFingerprint = computeRootFingerprint(
    codeGraphVersion,
    projectRoot,
    workspaces,
    graphConfig,
    adapters,
    repoRoot,
    source,
  )
  if (storedMap.get('root') !== rootFingerprint) {
    return true
  }

  return false
}
