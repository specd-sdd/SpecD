import { SpecPath } from '../value-objects/spec-path.js'

/** Cheap presence + lastModified for one schema artifact on {@link Spec}. */
export interface SpecArtifactEntry {
  readonly filename: string
  readonly lastModified: string
}

/** Cheap presence + lastModified for a spec sidecar (`spec-lock.json`, `metadata.json`). */
export interface SpecSidecarStamp {
  readonly present: boolean
  readonly lastModified: string | null
}

/** Sidecar stamp for an absent file. */
export const ABSENT_SPEC_SIDECAR: SpecSidecarStamp = { present: false, lastModified: null }

/**
 *
 * A spec is a directory identified by a workspace and a name ({@link SpecPath}).
 * It contains one or more artifact files (e.g. `spec.md`, `proposal.md`).
 * This entity holds only metadata — artifact content is loaded on demand
 * via `SpecRepository.artifact()`.
 */
export class Spec {
  private readonly _workspace: string
  private readonly _name: SpecPath
  private readonly _artifacts: readonly SpecArtifactEntry[]
  private readonly _persistedStateStamp: SpecSidecarStamp
  private readonly _generatedMetadataStamp: SpecSidecarStamp

  /**
   * Creates a new `Spec` with stamp metadata for artifacts and sidecars.
   *
   * @param workspace - The workspace name from `specd.yaml` (e.g. `"billing"`, `"default"`)
   * @param name - The spec path within the workspace's specs directory (e.g. `auth/oauth`)
   * @param artifacts - Schema artifact filenames with last-modified stamps
   * @param persistedStateStamp - Stamp for `spec-lock.json`
   * @param generatedMetadataStamp - Stamp for generated `metadata.json`
   */
  constructor(
    workspace: string,
    name: SpecPath,
    artifacts: readonly SpecArtifactEntry[],
    persistedStateStamp: SpecSidecarStamp,
    generatedMetadataStamp: SpecSidecarStamp,
  ) {
    this._workspace = workspace
    this._name = name
    this._artifacts = [...artifacts]
    this._persistedStateStamp = persistedStateStamp
    this._generatedMetadataStamp = generatedMetadataStamp
  }

  /** The workspace name this spec belongs to (from `specd.yaml`). */
  get workspace(): string {
    return this._workspace
  }

  /**
   * The spec identity path within the workspace's specs directory.
   * For example, `auth/oauth` or `billing/payments`.
   */
  get name(): SpecPath {
    return this._name
  }

  /** Schema artifact entries with last-modified stamps. */
  get artifacts(): readonly SpecArtifactEntry[] {
    return this._artifacts
  }

  /** Artifact filenames present in this spec directory (derived from {@link artifacts}). */
  get filenames(): readonly string[] {
    return this._artifacts.map((artifact) => artifact.filename)
  }

  /**
   * Returns whether this spec has an artifact with the given filename.
   *
   * @param filename - The filename to check (e.g. `"spec.md"`)
   * @returns `true` when a matching entry exists in {@link artifacts}
   */
  hasArtifact(filename: string): boolean {
    return this._artifacts.some((artifact) => artifact.filename === filename)
  }

  /** Stamp for persisted semantic state sidecar (`spec-lock.json`). */
  get persistedStateStamp(): SpecSidecarStamp {
    return this._persistedStateStamp
  }

  /** Stamp for generated metadata sidecar (`metadata.json`). */
  get generatedMetadataStamp(): SpecSidecarStamp {
    return this._generatedMetadataStamp
  }
}
