import { SpecPath } from '../value-objects/spec-path.js'

/**
 * Metadata for a spec directory.
 *
 * A spec is a directory identified by a workspace and a name ({@link SpecPath}).
 * It contains one or more artifact files (e.g. `spec.md`, `proposal.md`).
 * This entity holds only metadata — artifact content is loaded on demand
 * via `SpecRepository.artifact()`.
 */
export class Spec {
  private readonly _workspace: string
  private readonly _name: SpecPath
  private readonly _filenames: readonly string[]

  /**
   * Creates a new `Spec` with the given workspace, name, and artifact filenames.
   *
   * @param workspace - The workspace name from `specd.yaml` (e.g. `"billing"`, `"default"`)
   * @param name - The spec path within the workspace's specs directory (e.g. `auth/oauth`)
   * @param filenames - The artifact filenames present in this spec directory
   */
  constructor(workspace: string, name: SpecPath, filenames: readonly string[]) {
    this._workspace = workspace
    this._name = name
    this._filenames = [...filenames]
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

  /** The artifact filenames present in this spec directory (e.g. `["spec.md", "proposal.md"]`). */
  get filenames(): readonly string[] {
    return this._filenames
  }

  /**
   * Returns whether this spec has an artifact with the given filename.
   *
   * @param filename - The filename to check (e.g. `"spec.md"`)
   * @returns `true` if the artifact exists in this spec directory
   */
  hasArtifact(filename: string): boolean {
    return this._filenames.includes(filename)
  }
}
