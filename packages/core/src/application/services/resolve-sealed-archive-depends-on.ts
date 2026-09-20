import { type Change } from '../../domain/entities/change.js'
import { type Schema } from '../../domain/value-objects/schema.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { type SpecWorkspaceRoute } from '../use-cases/_shared/spec-reference-resolver.js'
import { resolveInitialPersistedDependsOn } from '../use-cases/resolve-initial-persisted-depends-on.js'

/** Inputs for archive sealed `dependsOn` (sidecar + `deps.consistent` facts). */
export interface ResolveSealedArchiveDependsOnInput {
  readonly change: Change
  readonly specId: string
  readonly specRepo: SpecRepository
  readonly schema: Schema
  readonly persistedDependsOn: readonly string[] | null
  readonly parsers: ArtifactParserRegistry
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly hasher: ContentHasher | undefined
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly repositories: ReadonlyMap<string, SpecRepository>
  /**
   * Merge-extract `dependsOn` for a brand-new spec (no disk, no lock, no plan).
   * Ignored when a plan, lock, or on-disk spec exists.
   */
  readonly extractedDependsOn?: readonly string[]
}

/**
 * Seals `dependsOn` for one archive attempt.
 *
 * Publication plan (`change.specDependsOn`) always wins. An existing lock is
 * kept when the change has no snapshot. `resolveInitialPersistedDependsOn`
 * runs only for a lock-less spec that already exists on disk. A new spec
 * with no snapshot seals merge-extract (or `[]` when extract is empty).
 * Merge extraction is not a fallback when disk or a lock already exists.
 *
 * @param input - Change, spec identity, lock `dependsOn`, and extract ports
 * @returns Dependency set to persist on `spec-lock.json`
 */
export async function resolveSealedArchiveDependsOn(
  input: ResolveSealedArchiveDependsOnInput,
): Promise<readonly string[]> {
  const manifestDeps = input.change.specDependsOn.get(input.specId)
  if (manifestDeps !== undefined) {
    return [...manifestDeps]
  }
  if (input.persistedDependsOn !== null) {
    return [...input.persistedDependsOn]
  }
  const { capPath } = parseSpecId(input.specId)
  const onDisk = await input.specRepo.get(SpecPath.parse(capPath))
  if (onDisk === null) {
    return input.extractedDependsOn !== undefined ? [...input.extractedDependsOn] : []
  }
  if (input.hasher === undefined) {
    throw new Error('ArchiveChange requires ContentHasher to resolve lock-less on-disk dependsOn')
  }
  return [
    ...(await resolveInitialPersistedDependsOn(
      {
        specId: input.specId,
        schema: { name: input.schema.name(), version: input.schema.version() },
      },
      {
        specRepo: input.specRepo,
        schemaProvider: { get: () => Promise.resolve(input.schema) },
        parsers: input.parsers,
        extractorTransforms: input.extractorTransforms,
        hasher: input.hasher,
        workspaceRoutes: input.workspaceRoutes,
        repositories: input.repositories,
      },
    )),
  ]
}
