import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { Spec, ABSENT_SPEC_SIDECAR } from '../../domain/entities/spec.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { expectedArtifactFilename } from '../../domain/services/artifact-filename.js'
import { inferFormat } from '../../domain/services/format-inference.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type ListWorkspaces, type ProjectWorkspace } from '../use-cases/list-workspaces.js'
import { resolveSealedArchiveDependsOn } from './resolve-sealed-archive-depends-on.js'
import {
  extractMetadataFromSpecArtifacts,
  type MetadataArtifactInput,
} from '../use-cases/_shared/extract-metadata-from-spec-artifacts.js'
import { type SpecWorkspaceRoute } from '../use-cases/_shared/spec-reference-resolver.js'

/**
 * Ports required to load enter-ready / archive extract and ownership facts.
 */
export interface ReadyPredicateFactsDeps {
  /** Change artifact content loader. */
  readonly changes: ChangeRepository
  /** Workspace map for ownership and spec repositories. */
  readonly listWorkspaces: ListWorkspaces
  /** Artifact parsers used by metadata extraction. */
  readonly parsers: ArtifactParserRegistry
  /** Extractor transform registry used by metadata extraction. */
  readonly extractorTransforms: ExtractorTransformRegistry
  /** Workspace routing metadata for `resolveSpecPath`. */
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  /**
   * Content hasher for archive lock-less `resolveInitialPersistedDependsOn`.
   * Unused on enter-`ready`.
   */
  readonly hasher?: ContentHasher
}

/**
 * Loads ownership and dependsOn maps used by enter-ready / archive shared checks.
 *
 * @param deps - Application ports
 * @param change - Active change
 * @param schema - Active schema
 * @returns Extracted vs persisted dependsOn and workspace ownership
 */
export async function loadReadyPredicateFacts(
  deps: ReadyPredicateFactsDeps,
  change: Change,
  schema: Schema,
): Promise<{
  readonly extractedDependsOnBySpecId: ReadonlyMap<string, readonly string[] | undefined>
  readonly persistedDependsOnBySpecId: ReadonlyMap<string, readonly string[] | undefined>
  readonly ownershipBySpecId: ReadonlyMap<string, 'owned' | 'shared' | 'readOnly'>
}> {
  const workspaces = await deps.listWorkspaces.execute()
  const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))
  const extracted = new Map<string, readonly string[] | undefined>()
  const persisted = new Map<string, readonly string[] | undefined>()
  const ownership = new Map<string, 'owned' | 'shared' | 'readOnly'>()

  for (const specId of change.specIds) {
    const { workspace } = parseSpecId(specId)
    const ws = workspaceMap.get(workspace)
    if (ws !== undefined) {
      ownership.set(specId, ws.specRepo.ownership())
    }

    const manifestDeps = change.specDependsOn.get(specId)
    if (manifestDeps !== undefined) {
      persisted.set(specId, manifestDeps)
    }

    const extractedDeps = await extractDependsOnForSpec({
      change,
      schema,
      specId,
      workspaceMap,
      deps,
    })
    if (extractedDeps !== undefined) {
      extracted.set(specId, extractedDeps)
    }
  }

  return {
    extractedDependsOnBySpecId: extracted,
    persistedDependsOnBySpecId: persisted,
    ownershipBySpecId: ownership,
  }
}

/**
 * Loads sealed `dependsOn` per spec for archive `deps.consistent`.
 *
 * Same precedence as spec-lock persistence: publication plan, then lock,
 * then `resolveInitialPersistedDependsOn` for an on-disk spec, else
 * merge-extract for a brand-new spec.
 *
 * @param deps - Application ports
 * @param change - Change being archived
 * @param schema - Active schema
 * @returns Sealed `dependsOn` keyed by spec id
 */
export async function loadArchiveSealedDependsOnBySpecId(
  deps: ReadyPredicateFactsDeps,
  change: Change,
  schema: Schema,
): Promise<ReadonlyMap<string, readonly string[] | undefined>> {
  const workspaces = await deps.listWorkspaces.execute()
  const workspaceMap = new Map(workspaces.map((ws) => [ws.name, ws]))
  const repositories = new Map<string, SpecRepository>(
    workspaces.map((ws) => [ws.name, ws.specRepo]),
  )
  const persisted = new Map<string, readonly string[] | undefined>()

  for (const specId of change.specIds) {
    const { workspace, capPath } = parseSpecId(specId)
    const ws = workspaceMap.get(workspace)
    if (ws === undefined) {
      continue
    }
    const specPath = SpecPath.parse(capPath)
    const existing = await ws.specRepo.get(specPath)
    const spec =
      existing ?? new Spec(workspace, specPath, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
    const lock = await ws.specRepo.readPersistedState(spec)
    const extractedDependsOn = await extractDependsOnForSpec({
      change,
      schema,
      specId,
      workspaceMap,
      deps,
    })
    persisted.set(
      specId,
      await resolveSealedArchiveDependsOn({
        change,
        specId,
        specRepo: ws.specRepo,
        schema,
        persistedDependsOn: lock?.dependsOn ?? null,
        parsers: deps.parsers,
        extractorTransforms: deps.extractorTransforms,
        hasher: deps.hasher,
        workspaceRoutes: deps.workspaceRoutes,
        repositories,
        ...(extractedDependsOn !== undefined ? { extractedDependsOn } : {}),
      }),
    )
  }

  return persisted
}

/**
 * Extracts `dependsOn` for one spec using the same metadata-extraction path as archive.
 *
 * When extract is undefined, the spec is omitted from the extracted map.
 *
 * @param args - Per-spec extract inputs
 * @param args.change - Active change
 * @param args.schema - Active schema
 * @param args.specId - Spec id to extract
 * @param args.workspaceMap - Workspaces keyed by name
 * @param args.deps - Gather ports
 * @returns Extracted dependsOn, or undefined when extraction yields nothing
 */
export async function extractDependsOnForSpec(args: {
  readonly change: Change
  readonly schema: Schema
  readonly specId: string
  readonly workspaceMap: Map<string, ProjectWorkspace>
  readonly deps: ReadyPredicateFactsDeps
}): Promise<readonly string[] | undefined> {
  if (args.schema.metadataExtraction() === undefined) {
    return undefined
  }

  const { workspace, capPath } = parseSpecId(args.specId)
  const ws = args.workspaceMap.get(workspace)
  if (ws === undefined) {
    return undefined
  }

  const specPath = SpecPath.parse(capPath)
  const existing = await ws.specRepo.get(specPath)
  const spec =
    existing ?? new Spec(workspace, specPath, [], ABSENT_SPEC_SIDECAR, ABSENT_SPEC_SIDECAR)
  const specExists = existing !== null
  const artifacts = await loadExtractArtifacts({
    change: args.change,
    schema: args.schema,
    specId: args.specId,
    spec,
    specExists,
    specRepo: ws.specRepo,
    changes: args.deps.changes,
    parsers: args.deps.parsers,
  })
  if (artifacts.length === 0) {
    return undefined
  }

  const repositories = new Map<string, SpecRepository>(
    [...args.workspaceMap.values()].map((entry) => [entry.name, entry.specRepo]),
  )
  const extracted = await extractMetadataFromSpecArtifacts({
    effectiveSpecSchema: args.schema,
    workspace,
    specPath,
    artifacts,
    parsers: args.deps.parsers,
    extractorTransforms: args.deps.extractorTransforms,
    repositories,
    workspaceRoutes: args.deps.workspaceRoutes,
  })
  return extracted.metadata.dependsOn
}

/**
 * Loads spec-scoped artifact contents for extraction (change files, then canonical).
 *
 * @param args - Load inputs
 * @param args.change - Active change
 * @param args.schema - Active schema
 * @param args.specId - Spec id whose artifacts are loaded
 * @param args.spec - Spec entity (canonical or absent sidecar)
 * @param args.specExists - Whether the spec exists on disk
 * @param args.specRepo - Spec repository for the workspace
 * @param args.changes - Change artifact content loader
 * @param args.parsers - Artifact parsers
 * @returns Artifact contents for {@link extractMetadataFromSpecArtifacts}
 */
async function loadExtractArtifacts(args: {
  readonly change: Change
  readonly schema: Schema
  readonly specId: string
  readonly spec: Spec
  readonly specExists: boolean
  readonly specRepo: SpecRepository
  readonly changes: ChangeRepository
  readonly parsers: ArtifactParserRegistry
}): Promise<readonly MetadataArtifactInput[]> {
  const artifacts: MetadataArtifactInput[] = []

  for (const artifactType of args.schema.artifacts()) {
    if (artifactType.scope !== 'spec') continue

    const outputBasename = path.basename(artifactType.output)
    const expectedFilename = expectedArtifactFilename({
      artifactType,
      key: args.specId,
      specExists: args.specExists,
    })
    const trackedFile = args.change.getArtifact(artifactType.id)?.getFile(args.specId)
    const trackedFilename = trackedFile?.filename ?? expectedFilename
    const loaded = await args.changes.artifact(args.change, trackedFilename)
    let content: string | null = loaded?.content ?? null

    if (content !== null && artifactType.delta === true && trackedFilename.startsWith('deltas/')) {
      content = await mergeDeltaContent({
        content,
        spec: args.spec,
        specRepo: args.specRepo,
        outputBasename,
        format: artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext',
        parsers: args.parsers,
      })
    }

    if (content === null) {
      content = (await args.specRepo.artifact(args.spec, outputBasename))?.content ?? null
    }
    if (content === null) continue

    artifacts.push({
      artifactId: artifactType.id,
      filename: outputBasename,
      content,
      format: artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext',
    })
  }

  return artifacts
}

/**
 * Merges a change-directory delta with the canonical base artifact.
 *
 * @param args - Delta merge inputs
 * @param args.content - Delta file content from the change directory
 * @param args.spec - Spec used as the merge base
 * @param args.specRepo - Spec repository for the canonical artifact
 * @param args.outputBasename - Canonical artifact filename
 * @param args.format - Parser format id
 * @param args.parsers - Artifact parsers
 * @returns Serialized merged content, or null when merge is not possible
 */
async function mergeDeltaContent(args: {
  readonly content: string
  readonly spec: Spec
  readonly specRepo: SpecRepository
  readonly outputBasename: string
  readonly format: string
  readonly parsers: ArtifactParserRegistry
}): Promise<string | null> {
  const parser = args.parsers.get(args.format)
  const yamlParser = args.parsers.get('yaml')
  if (parser === undefined || yamlParser === undefined) {
    return null
  }
  const base = await args.specRepo.artifact(args.spec, args.outputBasename)
  if (base === null) {
    return null
  }
  try {
    const merged = parser.apply(parser.parse(base.content), yamlParser.parseDelta(args.content))
    return parser.serialize(merged.ast)
  } catch {
    return null
  }
}
