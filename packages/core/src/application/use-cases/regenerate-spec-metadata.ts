import {
  type MaterializeSpecMetadata,
  type MaterializeSpecMetadataResult,
} from './materialize-spec-metadata.js'
import { type ListWorkspaces } from './list-workspaces.js'

/** Target for metadata regeneration. */
export type RegenerateSpecMetadataTarget =
  | { readonly kind: 'spec'; readonly specId: string }
  | { readonly kind: 'batch'; readonly workspaces?: readonly string[] }

/** Input for {@link RegenerateSpecMetadata}. */
export interface RegenerateSpecMetadataInput {
  readonly target: RegenerateSpecMetadataTarget
  /** When true, skip dependsOn conflict detection when persisting regenerated metadata. */
  readonly force?: boolean
}

/** Per-spec regeneration result. */
export interface RegenerateSpecMetadataSpecResult {
  readonly specId: string
  readonly ok: boolean
  readonly result?: MaterializeSpecMetadataResult
  readonly error?: string
}

/** Result returned by {@link RegenerateSpecMetadata}. */
export type RegenerateSpecMetadataResult =
  | { readonly kind: 'spec'; readonly result: RegenerateSpecMetadataSpecResult }
  | {
      readonly kind: 'batch'
      readonly specs: readonly RegenerateSpecMetadataSpecResult[]
      readonly failed: boolean
    }

/** Forces metadata regeneration for one spec or a workspace batch. */
export class RegenerateSpecMetadata {
  /**
   * Creates the use case.
   *
   * @param materializeSpecMetadata - Metadata materialization use case
   * @param listWorkspaces - Project workspace orchestrator
   */
  constructor(
    private readonly materializeSpecMetadata: MaterializeSpecMetadata,
    private readonly listWorkspaces: ListWorkspaces,
  ) {}

  /**
   * Forces metadata regeneration for the requested target.
   *
   * @param input - Regeneration target
   * @returns Single-spec or batch regeneration result
   */
  async execute(input: RegenerateSpecMetadataInput): Promise<RegenerateSpecMetadataResult> {
    if (input.target.kind === 'spec') {
      const result = await this._regenerateOne(input.target.specId, input.force === true)
      return { kind: 'spec', result }
    }

    const workspaces = await this.listWorkspaces.execute()
    const filter =
      input.target.workspaces !== undefined && input.target.workspaces.length > 0
        ? new Set(input.target.workspaces)
        : null

    const specs: RegenerateSpecMetadataSpecResult[] = []
    for (const ws of workspaces) {
      if (filter !== null && !filter.has(ws.name)) continue
      const listed = await ws.specRepo.list()
      for (const entry of listed.items) {
        specs.push(await this._regenerateOne(`${ws.name}:${entry.path}`, input.force === true))
      }
    }

    return {
      kind: 'batch',
      specs,
      failed: specs.some((entry) => !entry.ok),
    }
  }

  /**
   * Regenerates metadata for a single spec.
   *
   * @param specId - Canonical spec ID
   * @param force - Whether to skip dependsOn conflict detection
   * @returns Per-spec regeneration result
   */
  private async _regenerateOne(
    specId: string,
    force: boolean,
  ): Promise<RegenerateSpecMetadataSpecResult> {
    try {
      const result = await this.materializeSpecMetadata.execute({
        specId,
        policy: 'force',
        allowDependsOnOverwrite: force,
      })
      return { specId, ok: true, result }
    } catch (error) {
      return {
        specId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
